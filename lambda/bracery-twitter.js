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
      await dynamoPromise('putItem')
      ({ TableName: twitterTableName,
	 Item: { requestToken: OAuthToken,
                 requestTokenSecret: OAuthTokenSecret,
                 requestTime: Date.now(),
                 name: name,
                 type: 'request',
                 subscribe: subscribe,
               },
       });
      respond.redirectPost ('https://api.twitter.com/oauth/authenticate?oauth_token=' + OAuthToken);
    } else {  // !isRequest
      let res = await dynamoPromise('query')
      ({ TableName: twitterTableName,
         KeyConditionExpression: "#rtkey = :rtval",
         ExpressionAttributeNames:{
           "#rtkey": "requestToken"
         },
         ExpressionAttributeValues: {
           ":rtval": requestToken
         },
         ScanIndexForward: false,
         Limit: 1,
       });
      const result = res.Items && res.Items.length && res.Items[0];
      if (!result)
        return respond.notFound();
      let { oAuthAccessToken, oAuthAccessTokenSecret }
          = await getOAuthAccessToken (requestToken,
                                       result.requestTokenSecret,
                                       requestVerifier);
      await dynamoPromise('updateItem')
      ({ TableName: twitterTableName,
         Key: { requestToken: requestToken },
         UpdateExpression: 'SET #a = :a, #s = :s, #d = :d, #t = :t',
         ExpressionAttributeNames: {
           '#a': 'accessToken',
           '#s': 'accessTokenSecret',
           '#d': 'accessTime',
           '#t': 'type'
         },
         ExpressionAttributeValues: {
           ':a': oAuthAccessToken,
           ':s': oAuthAccessTokenSecret,
           ':d': Date.now(),
           ':t': 'access'
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
