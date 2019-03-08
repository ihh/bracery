/* This is a small AWS lambda function for presenting a page associated with a (named) Bracery symbol.
 */

//console.log('Loading function');

const fs = require('fs');
const https = require('https');

const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;
const updateIndexName = config.updateIndexName;
const defaultName = config.defaultSymbolName;
const sessionTableName = config.sessionTableName;
const cookieName = config.cookieName;

const doc = require('dynamodb-doc');
const dynamoPromise = util.dynamoPromise (new doc.DynamoDB());

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;  // must be defined from AWS Lambda
const COGNITO_APP_CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID;  // must be defined from AWS Lambda
const COGNITO_APP_SECRET = process.env.COGNITO_APP_SECRET;  // must be defined from AWS Lambda

// The template file should be uploaded with the AWS lambda zip archive for this function.
const templateHtmlFilename = config.templateHtmlFilename;
const templateHtmlFileEncoding = config.stringEncoding;

const baseUrl = config.baseUrl;
const storePrefix = config.storePrefix;
const assetPrefix = config.assetPrefix;
const expandPrefix = config.expandPrefix;
const viewAssetStub = config.viewAssetStub;
const viewPrefix = config.viewPrefix;

// The static assets pointed to by these template substitutions
// should be uploaded in the Lambda zip of bracery-asset.js (or to S3, or wherever)
const templateVarValMap = { 'JAVASCRIPT_FILE': assetPrefix + viewAssetStub + '.js',
                            'STYLE_FILE': assetPrefix + viewAssetStub + '.css',
                            'BASE_URL': baseUrl,
                            'STORE_PATH_PREFIX': storePrefix,
                            'VIEW_PATH_PREFIX': viewPrefix,
                            'EXPAND_PATH_PREFIX': expandPrefix,
			    'COGNITO_DOMAIN': config.cognitoDomain,
			    'COGNITO_APP_ID': COGNITO_APP_CLIENT_ID };
const templateNameVar = 'SYMBOL_NAME';
const templateDefVar = 'SYMBOL_DEFINITION';
const templateInitVar = 'INIT_TEXT';
const templateVarsVar = 'VARS';
const templateRecentVar = 'RECENT_SYMBOLS';
const templateUserVar = 'USER';

// async https.request
const httpsRequest = async (opts, formData) => new Promise
((resolve, reject) => {
  let req = https.request (opts, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      resolve ([res, data]);
    });
  });
  if (formData)
    req.write (formData);
  req.end();
});
 
// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get the symbol name
  const name = (event && event.pathParameters && event.pathParameters.name) || defaultName;

  // Get symbol definition override from query parameters, if supplied
  const initText = ((event && event.queryStringParameters && typeof(event.queryStringParameters['text']) === 'string')
		    ? decodeURIComponent (event.queryStringParameters['text'])
		    : undefined);
  
  // Get evaluation text override from query parameters, if supplied
  const evalText = ((event && event.queryStringParameters && typeof(event.queryStringParameters['eval']) === 'string')
		    ? decodeURIComponent (event.queryStringParameters['eval'])
		    : undefined);

  // Get initial vars as query parameters, if supplied
  const vars = util.getVars (event);
  
  // Add the name & a dummy empty definition to the template var->val map
  let tmpMap = util.extend ({}, templateVarValMap);
  tmpMap[templateNameVar] = name;
  tmpMap[templateDefVar] = typeof(evalText) === 'string' ? evalText : '';
  tmpMap[templateInitVar] = typeof(initText) === 'string' ? initText : false;
  tmpMap[templateRecentVar] = '[]';
  tmpMap[templateVarsVar] = JSON.stringify (vars);
  tmpMap[templateUserVar] = null;

  // Keep a log, so we can debug "live" by inserting %LOG% into index.html (very unsafe...)
  let logText = '';
  function log() {
    logText += Array.prototype.map.call (arguments, (arg) => JSON.stringify (arg)).join(' ') + '\n';
  }

  // Set up some returns
  let cookie = null;
  const done = (err, res) => {
    let headers = {
      'Content-Type': 'text/html; charset=' + templateHtmlFileEncoding,
    };
    if (cookie)
      headers['Set-Cookie'] = cookieName + '=' + cookie;
    callback (null, {
      statusCode: err ? (err.statusCode || '500') : '200',
      body: err ? err.message : res,
      headers: headers,
    });
  };

  const ok = (result) => done (null, result);
  const serverError = (msg) => done ({ statusCode: '500', message: msg || "Server error" });

  // Wrap all downstream calls (to dynamo etc) in try...catch
  try {

    // Query the database for recently-updated symbols
    let newsPromise = dynamoPromise('query')
    ({ TableName: tableName,
       IndexName: updateIndexName,
       ScanIndexForward: false,
       Limit: config.recentlyUpdatedLimit,
       KeyConditionExpression: "#viskey = :visval",
       ExpressionAttributeNames:{
         "#viskey": "visibility"
       },
       ExpressionAttributeValues: {
         ":visval": config.defaultVisibility
       }})
      .then ((res) => {
        if (res.Items)
          tmpMap[templateRecentVar] = JSON.stringify (res.Items.map ((item) => item.name));
      });
    
    // Query the database for the given symbol definition, or use evalText if supplied
    let symbolPromise =
        (typeof(evalText) === 'string'
         ? Promise.resolve()
         : (dynamoPromise('query')
            ({ TableName: tableName,
	       KeyConditionExpression: "#nkey = :nval",
	       ExpressionAttributeNames:{
		 "#nkey": "name"
	       },
	       ExpressionAttributeValues: {
		 ":nval": name.toLowerCase()
	       }})
            .then ((res) => {
              const result = res.Items && res.Items.length && res.Items[0];
              if (result && result.bracery)
                tmpMap[templateDefVar] = result.bracery;
            })));

    // If we were given an authorization code (as a redirect from Cognito login),
    // then retrieve the access token, use that to get the email address,
    // and store all this info in the session database with a newly-generated cookie.
    // Otherwise, look for a cookie in the headers, and try to retrieve the session info.
    const authorizationCode = event && event.queryStringParameters && event.queryStringParameters.code;
    if (authorizationCode) {
      const urlEncodedTokenData = 'grant_type=authorization_code'
	    + '&client_id=' + encodeURIComponent(COGNITO_APP_CLIENT_ID)
	    + '&redirect_uri=' + encodeURIComponent(baseUrl + viewPrefix)
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
      let [tokenRes, tokenData] = await httpsRequest (tokenReqOpts, urlEncodedTokenData);
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
        let [infoRes, infoData] = await httpsRequest (infoReqOpts);
        if (infoRes.statusCode == 200) {
          const infoResBody = JSON.parse (infoData);
          const email = infoResBody.email;
          tmpMap[templateUserVar] = email;
          const newCookie = util.generateCookie();
          await dynamoPromise('putItem')
          ({ TableName: sessionTableName,
	     Item: { cookie: newCookie,
		     email: email,
		     accessToken: accessToken,
		     refreshToken: refreshToken,
		     issued: Date.now() },
           });
          cookie = newCookie;
        }
      }
    } else {  // !authorizationCode
      log(event.headers);
      let session = await util.getSession (event, dynamoPromise);
      if (session)
	tmpMap[templateUserVar] = session.email;
    }

    // Read the file
    const templateHtml = await util.promisify (fs.readFile) (templateHtmlFilename, templateHtmlFileEncoding);

    // Wait for promises
    await newsPromise;
    await symbolPromise;
    
    // Do the %VAR%->val template substitutions
    tmpMap.LOG = logText;  // add log to template map
    const finalHtml = util.expandTemplate (templateHtml, tmpMap);

    // And return
    ok (finalHtml);

  } catch (e) {
    serverError (e);
  }
};
