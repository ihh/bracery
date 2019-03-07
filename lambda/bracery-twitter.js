/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const OAuth = require('oauth');

// const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;
const twitterTableName = config.twitterTableName;

const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;  // must be defined from AWS Lambda
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;  // must be defined from AWS Lambda

const newOAuth = (name) => new OAuth.OAuth(
  'https://api.twitter.com/oauth/request_token',
  'https://api.twitter.com/oauth/access_token',
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  '1.0',
  config.baseUrl + config.twitterPrefix + name,  // API endpoint for redirect from Twitter
  'HMAC-SHA1'
);

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

// The Lambda function
exports.handler = (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get symbol name
  const name = event.pathParameters.name;

  // Create OAuth context
  const oauth = newOAuth (name);
  
  // Set up some returns
  const done = (err, res) => callback (null, {
    statusCode: err ? (err.statusCode || '400') : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const redirectFound = (url) => callback (null, {
    statusCode: '302',
    headers: {
      'Location': url,
    },
  });

  const redirectPost = (url) => callback (null, {
    statusCode: '303',
    headers: {
      'Location': url,
    },
  });
  
  const serverError = (msg) => done ({ statusCode: '500', message: msg || "Server error" });
  
  // Handle the HTTP methods
  switch (event.httpMethod) {
  case 'POST':
    try {
      oauth.getOAuthRequestToken ((err, OAuthToken, OAuthTokenSecret, results) => {
        
        if (err)
          return serverError (err);

        dynamo.putItem ({ TableName: twitterTableName,
			  Item: { requestToken: OAuthToken,
                                  requestTokenSecret: OAuthTokenSecret,
                                  requestTime: Date.now(),
                                  name: name,
                                  type: 'request',
                                },
		        }, (err, result) => {
                          if (err)
                            return serverError (err);
                          redirectPost ('https://api.twitter.com/oauth/authenticate?oauth_token=' + OAuthToken);
                        });
      });
    } catch (e) {
      return serverError (e);
    }
    break;
  case 'GET':
    {
      const requestToken = event.query.oauth_token;
      const requestVerifier = event.query.oauth_verifier;

      try {
        dynamo.query
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
         }, (err, res) => {
           if (err)
             return serverError();
           const result = res.Items && res.Items.length && res.Items[0];
           if (!result)
             return serverError();
           oauth.getOAuthAccessToken
           (requestToken,
            result.requestTokenSecret,
            requestVerifier,
            (err, oAuthAccessToken, oAuthAccessTokenSecret, results) => {

              if (err)
                return serverError (err);

              dynamo.updateItem ({ TableName: twitterTableName,
                                   Key: { requestToken: requestToken },
                                   UpdateExpression: 'SET accessToken = :a, accessTokenSecret = :s, accessTime = :d, type = :t',
                                   ExpressionAttributeValues: {
                                     ':a': oAuthAccessToken,
                                     ':s': oAuthAccessTokenSecret,
                                     ':d': Date.now(),
                                     ':t': 'access'
                                   }
                                 },
                                 (err, result) => {
                                   if (err)
                                     return serverError (err);
                                   redirectFound (config.baseUrl + config.viewPrefix + name);
                                 });
            });
         });
      } catch (e) {
        return serverError (e);
      }
      break;
    }
  }
};
