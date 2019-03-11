/* This is a small AWS lambda function for authorizing through Twitter 3-legged OAuth.
*/

//console.log('Loading function');

const OAuth = require('oauth');
const Twit = require('twit');

const util = require('./bracery-util');
const config = require('./bracery-config');
const twitterTableName = config.twitterTableName;

const dynamoPromise = util.dynamoPromise();

const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;  // must be defined from AWS Lambda
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;  // must be defined from AWS Lambda

const oauth = new OAuth.OAuth(
  'https://api.twitter.com/oauth/request_token',
  'https://api.twitter.com/oauth/access_token',
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  '1.0',
  config.baseUrl + config.twitterPrefix,  // API endpoint for redirect from Twitter
  'HMAC-SHA1'
);

const getOAuthRequestToken = () => new Promise
((resolve) => oauth.getOAuthRequestToken
 ((err, OAuthToken, OAuthTokenSecret) => {
   if (err)
     throw new Error (err);
   resolve ({ OAuthToken, OAuthTokenSecret });
 }));
 
const getOAuthAccessToken = (reqToken, reqSecret, reqVerifier) => new Promise
((resolve) => oauth.getOAuthAccessToken
 (reqToken, reqSecret, reqVerifier,
  (err, accToken, accSecret) => {
    if (err)
      throw new Error (err);
    resolve ({ accToken, accSecret });
  }));

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  let session = await util.getSession (event, dynamoPromise);
  const respond = util.respond (callback, event, session);

  // This function is called twice, once on the request stage of 3-legged auth
  // (redirected from app to Twitter), then again on the callback (redirected from Twitter to app).
  // To find out which stage we're at, we check to see if oauth_verifier is present as a query param.
  
  // Get request token & verifier (callback stage)
  const requestToken = event.queryStringParameters.oauth_token;
  const requestVerifier = event.queryStringParameters.oauth_verifier;

  // Which stage is this, request or callback?
  const isRequest = !requestVerifier;
  try {

    if (!(session && session.loggedIn))
      return respond.forbidden();
    
    if (isRequest) {
      // Get symbol name & subscribe/unsubscribe state (request stage)
      const name = event.queryStringParameters.source;
      const subscribe = !event.queryStringParameters.unsubscribe;

      if (subscribe && !name)
        return respond.badRequest();

      // Update session with state
      await dynamoPromise('updateItem')
      ({ TableName: config.sessionTableName,
         Key: { cookie: session.cookie },
         UpdateExpression: 'SET #s = :s',
         ExpressionAttributeNames: {
           '#s': 'state',
         },
         ExpressionAttributeValues: {
           ':s': JSON.stringify (util.getParams (event)),
         } });

      // Add a new entry to the Twitter table
      let { OAuthToken, OAuthTokenSecret }
          = await getOAuthRequestToken();
      let item = { user: session.user,
                   requestToken: OAuthToken,
                   requestTokenSecret: OAuthTokenSecret,
                   requestTime: Date.now(),
                   subscribe: subscribe,
                   granted: false };
      if (name)
        item.name = name;
      await dynamoPromise('putItem')
      ({ TableName: twitterTableName,
         Item: item });
      respond.redirectPost ('https://api.twitter.com/oauth/authenticate?oauth_token=' + OAuthToken);
    } else {  // !isRequest
      // Query the Twitter table to find the requestTokenSecret
      let res = await dynamoPromise('query')
      ({ TableName: twitterTableName,
         KeyConditionExpression: "#u = :u AND #t = :t",
         ExpressionAttributeNames: {
           '#u': 'user',
           '#t': 'requestToken'
         },
         ExpressionAttributeValues: {
           ':u': session.user,
           ':t': requestToken
         }
       });
      const queryResult = res.Items && res.Items.length && res.Items[0];
      if (!(queryResult && queryResult.requestToken === requestToken))
        return respond.notFound();
      let { accToken, accSecret }
          = await getOAuthAccessToken (requestToken,
                                       queryResult.requestTokenSecret,
                                       requestVerifier);
      // Set up params for update
      let params = { TableName: twitterTableName,
                     Key: { user: session.user,
                            requestToken: requestToken },
                     UpdateExpression: 'SET #a = :a, #s = :s, #t = :t, #g = :g',
                     ExpressionAttributeNames: {
                       '#a': 'accessToken',
                       '#s': 'accessTokenSecret',
                       '#t': 'accessTime',
                       '#g': 'granted'
                     },
                     ExpressionAttributeValues: {
                       ':a': accToken,
                       ':s': accSecret,
                       ':t': Date.now(),
                       ':g': true
                     }
                   };
      // Find out who the user is
      let twit = new Twit({
        consumer_key: TWITTER_CONSUMER_KEY,
        consumer_secret: TWITTER_CONSUMER_SECRET,
        access_token: accToken,
        access_token_secret: accSecret
      });
      let credResult = await twit.get('account/verify_credentials',
                                      { skip_status: true });
      let twitterIdStr;
      if (credResult.resp.statusCode == 200 && credResult.data) {
        params.UpdateExpression += ', #n = :n, #id = :id';
        util.extend (params.ExpressionAttributeNames,
                     { '#n': 'twitterScreenName',
                       '#id': 'twitterIdStr' });
        util.extend (params.ExpressionAttributeValues,
                     { ':n': credResult.data.screen_name,
                       ':id': (twitterIdStr = credResult.data.id_str) });
      }
      // Delete all earlier entries in the Twitter table associated with this user & symbol name
      // (or, if unsubscribing & no symbol name was specified, delete all entries associated with this twitter ID)
      // Also delete old ungranted requests; and if unsubscribing, delete this entry too
      let allRes = await dynamoPromise('query')
      ({ TableName: twitterTableName,
         KeyConditionExpression: "#u = :u",
         ExpressionAttributeNames: {
           '#u': 'user'
         },
         ExpressionAttributeValues: {
           ':u': session.user
         }
       });
      if (allRes && allRes.Items) {
        const itemsToDelete = allRes.Items.filter ((item) => {
          return ((item.requestTime < queryResult.requestTime
                   || (item.requestTime === queryResult.requestTime && !queryResult.subscribe))
                  && (!item.granted
                      || (queryResult.name
                          ? (item.name === queryResult.name)
                          : (item.twitterIdStr === twitterIdStr))));
        });
        await Promise.all
        (itemsToDelete.map ((item) => dynamoPromise('deleteItem')
                            ({ TableName: twitterTableName,
                               Key: { user: session.user,
                                      requestToken: item.requestToken } })));
      }
      if (queryResult.subscribe)
        await dynamoPromise('updateItem') (params);
      respond.redirectFound (config.baseUrl + config.viewPrefix + (queryResult.name || '') + '?redirect=true');
    }
  } catch (e) {
    console.warn (e);  // to CloudWatch
    return respond.serverError (e);
  }
  
  return;
};
