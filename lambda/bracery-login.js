/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const util = require('./bracery-util');
const config = require('./bracery-config');

const dynamoPromise = util.dynamoPromise();

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;  // must be defined from AWS Lambda
const COGNITO_APP_CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID;  // must be defined from AWS Lambda
const COGNITO_APP_SECRET = process.env.COGNITO_APP_SECRET;  // must be defined from AWS Lambda

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Set up some returns
  let session = await util.getSession (event, dynamoPromise);
  const respond = util.respond (callback, event, session);

  try {
    // Login callback:
    // Retrieve the access token, use that to get user info,
    // store that info in the session database, and redirect.
    const authorizationCode = event && event.queryStringParameters && event.queryStringParameters.code;
    if (!authorizationCode)
      throw new Error ("No authorization code");
    
    const urlEncodedTokenData = 'grant_type=authorization_code'
	  + '&client_id=' + encodeURIComponent(COGNITO_APP_CLIENT_ID)
	  + '&redirect_uri=' + encodeURIComponent(config.baseUrl + config.loginPrefix)
	  + '&code=' + authorizationCode;
    const tokenReqOpts = {
      hostname: config.cognitoDomain,
      port: 443,
      path: '/oauth2/token',
      method: 'POST',
      headers: {
	'Content-Type': 'application/x-www-form-urlencoded',
	'Authorization': 'Basic ' + Buffer.from(COGNITO_APP_CLIENT_ID + ':' + COGNITO_APP_SECRET).toString('base64'),
	  'Content-Length': urlEncodedTokenData.length,
      },
    };
    let [tokenRes, tokenData] = await util.httpsRequest (tokenReqOpts, urlEncodedTokenData);
    if (tokenRes.statusCode == 200) {
      const tokenResBody = JSON.parse (tokenData);
      const accessToken = tokenResBody.access_token, refreshToken = tokenResBody.refresh_token;
      const infoReqOpts = {
	hostname: config.cognitoDomain,
	port: 443,
	path: '/oauth2/userInfo',
	method: 'GET',
	headers: {
	  'Authorization': 'Bearer ' + accessToken,
	},
      };
      let [infoRes, infoData] = await util.httpsRequest (infoReqOpts);
      if (infoRes.statusCode == 200) {
        const infoResBody = JSON.parse (infoData);
        const email = infoResBody.email;
        await dynamoPromise('updateItem')
        ({ TableName: config.sessionTableName,
           Key: { cookie: session.cookie },
           UpdateExpression: 'SET #e = :e, #a = :a, #r = :r, #g = :g',
           ExpressionAttributeNames: {
             '#e': 'email',
               '#a': 'accessToken',
               '#r': 'refreshToken',
               '#g': 'accessGranted',
             },
             ExpressionAttributeValues: {
               ':e': email,
               ':a': accessToken,
               ':r': refreshToken,
               ':g': Date.now()
             } });
	respond.redirectWithCookie (config.baseUrl + config.viewPrefix + ((session.state && session.state.name) || '') + '?redirect=true');
      }
    }
  } catch (e) {
    respond.serverError (e);
  }
};
