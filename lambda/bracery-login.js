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

const callbackUrl = config.baseUrl + config.loginPrefix;
const loginCalloutUrl = 'https://' + config.cognitoDomain + '/login?response_type=code&client_id=' + COGNITO_APP_CLIENT_ID + '&redirect_uri=' + encodeURIComponent(callbackUrl);
const logoutCalloutUrl = 'https://' + config.cognitoDomain + '/logout?client_id=' + COGNITO_APP_CLIENT_ID + '&logout_uri=' + encodeURIComponent(callbackUrl);

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Set up some returns
  let session = await util.getSession (event, dynamoPromise);
  const respond = util.respond (callback, event, session);
  const backToApp = () => respond.redirectWithCookie (config.baseUrl + config.viewPrefix + ((session.state && session.state.name) || '') + '?redirect=true');
  
  try {
    // Figure out from query params whether this is login, logout, callout, or callback
    const authorizationCode = event && event.queryStringParameters && event.queryStringParameters.code;
    const isLogin = event && event.queryStringParameters && event.queryStringParameters.login;
    const isLogout = event && event.queryStringParameters && event.queryStringParameters.logout;
    if (!authorizationCode) {
      // No auth code, so not a login callback
      if (!isLogin && !isLogout)  // is it a logout callback?
	return backToApp();
      // Update session with state (and clear access tokens) & redirect to Cognito
      await dynamoPromise('updateItem')
      ({ TableName: config.sessionTableName,
         Key: { cookie: session.cookie },
         UpdateExpression: 'SET #s = :s, #l = :l, #a = :a, #r = :r',
         ExpressionAttributeNames: {
           '#s': 'state',
           '#l': 'loggedIn',
           '#a': 'accessToken',
           '#r': 'refreshToken',
         },
         ExpressionAttributeValues: {
           ':s': JSON.stringify (util.getParams (event)),
	   ':l': false,
	   ':a': 'none',  // DynamoDB doesn't like empty strings
	   ':r': 'none',  // DynamoDB doesn't like empty strings
         } });
      return respond.redirectWithCookie (isLogin ? loginCalloutUrl : logoutCalloutUrl);
    }
    
    // Retrieve the access token, use that to get user info,
    // store that info in the session database, and redirect.
    const urlEncodedTokenData = 'grant_type=authorization_code'
	  + '&client_id=' + encodeURIComponent(COGNITO_APP_CLIENT_ID)
	  + '&redirect_uri=' + encodeURIComponent(callbackUrl)
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
           UpdateExpression: 'SET #l = :l, #e = :e, #a = :a, #r = :r',
           ExpressionAttributeNames: {
             '#l': 'loggedIn',
             '#e': 'email',
             '#a': 'accessToken',
             '#r': 'refreshToken'
           },
           ExpressionAttributeValues: {
	     ':l': true,
             ':e': email,
             ':a': accessToken,
             ':r': refreshToken
           } });
	backToApp();
      }
    }
  } catch (e) {
    respond.serverError (e);
  }
};
