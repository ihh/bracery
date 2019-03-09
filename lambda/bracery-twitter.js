/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const OAuth = require('oauth');

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

  // Get symbol name & subscribe/unsubscribe state (request stage)
  const name = event.queryStringParameters.name;
  const subscribe = !event.queryStringParameters.unsubscribe;

  // Get request token & verifier (callback stage)
  const requestToken = event.queryStringParameters.oauth_token;
  const requestVerifier = event.queryStringParameters.oauth_verifier;

  // Which stage is this, request or callback?
  const isRequest = !requestVerifier;
  try {

    if (!(session && session.loggedIn))
      return respond.forbidden();
    
    if (isRequest) {
      let { OAuthToken, OAuthTokenSecret }
          = await getOAuthRequestToken();
      await dynamoPromise('updateItem')
      ({ TableName: twitterTableName,
         Key: { user: session.user },
         UpdateExpression: 'SET #r = :r, #s = :s, #t = :t, #n = :n, #subscribe = :subscribe, #status = :status',
         ExpressionAttributeNames: {
           '#r': 'requestToken',
           '#s': 'requestTokenSecret',
           '#t': 'requestTime',
           '#n': 'name',
           '#subscribe': 'subscribe',
           '#status': 'status',
         },
         ExpressionAttributeValues: {
           ':r': OAuthToken,
           ':s': OAuthTokenSecret,
           ':t': Date.now(),
           ':n': name,
           ':subscribe': subscribe,
           ':status': 'request',
         }
       });
      respond.redirectPost ('https://api.twitter.com/oauth/authenticate?oauth_token=' + OAuthToken);
    } else {  // !isRequest
      let res = await dynamoPromise('query')
      ({ TableName: twitterTableName,
         KeyConditionExpression: "#u = :u",
         ExpressionAttributeNames:{
           "#u": "user"
         },
         ExpressionAttributeValues: {
           ":u": session.user
         },
         ScanIndexForward: false,
         Limit: 1,
       });
      const result = res.Items && res.Items.length && res.Items[0];
      if (!(result && result.requestToken === requestToken))
        return respond.notFound();
      let { accToken, accSecret }
          = await getOAuthAccessToken (requestToken,
                                       result.requestTokenSecret,
                                       requestVerifier);
      await dynamoPromise('updateItem')
      ({ TableName: twitterTableName,
         Key: { user: session.user },
         UpdateExpression: 'SET #a = :a, #s = :s, #t = :t, #status = :status',
         ExpressionAttributeNames: {
           '#a': 'accessToken',
           '#s': 'accessTokenSecret',
           '#t': 'accessTime',
           '#status': 'status'
         },
         ExpressionAttributeValues: {
           ':a': accToken,
           ':s': accSecret,
           ':t': Date.now(),
           ':status': (subscribe ? 'subscribe' : 'unsubscribe'),
         }
       });
      respond.redirectFound (config.baseUrl + config.viewPrefix + result.name);
    }
  } catch (e) {
    console.warn (e);  // to CloudWatch
    return respond.serverError (e);
  }
  
  return;
};
