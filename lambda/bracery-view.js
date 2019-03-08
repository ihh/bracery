/* This is a small AWS lambda function for presenting a page associated with a (named) Bracery symbol.
 */

//console.log('Loading function');

const fs = require('fs');
const https = require('https');
const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;
const updateIndexName = config.updateIndexName;
const defaultName = config.defaultSymbolName;
const sessionTableName = config.sessionTableName;

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

const cookieName = 'bracery_session';

// The Lambda function
exports.handler = (event, context, callback) => {
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
  
  // If we were given an authorization code (as a redirect from Cognito login),
  // then retrieve the access token, use that to get the email address,
  // and store all this info in the session database with a newly-generated cookie.
  // Otherwise, look for a cookie in the headers, and try to retrieve the session info.
  const authorizationCode = event && event.queryStringParameters && event.queryStringParameters.code;
  let cookie = null;
  const cookiePromise = new Promise ((resolve, reject) => {
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
      const tokenReq = https.request (tokenReqOpts, (res) => {
	log('tokenReq response status',res.statusCode);
	let data = '';
	res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
	  // log('tokenReq response body',data);  // insecure
	  if (res.statusCode != 200)
	    return resolve();
	  const tokenResBody = JSON.parse (data);
	  // log({tokenResBody});  // insecure
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
	  const infoReq = https.request (infoReqOpts, (res) => {
	    log('infoReq response status',res.statusCode);
	    let data = '';
	    res.on('data', (chunk) => { data += chunk; });
	    res.on('end', () => {
              // log('infoRes response body',data);  // insecure
	      if (res.statusCode != 200)
		return resolve();
	      const infoResBody = JSON.parse (data);
	      // log({infoResBody});  // insecure
	      const email = infoResBody.email;
	      tmpMap[templateUserVar] = email;
	      const newCookie = util.generateCookie();
	      dynamo.putItem ({ TableName: sessionTableName,
				Item: { cookie: newCookie,
					email: email,
					accessToken: accessToken,
					refreshToken: refreshToken,
					issued: Date.now() },
			      }, (err, res) => {
				if (!err)
				  cookie = newCookie;
				resolve();
			      });
	    });
	  });
	  infoReq.end();
	});
      });
      tokenReq.write (urlEncodedTokenData);
      tokenReq.end();
    } else {  // !authorizationCode
      log(event.headers);
      const regex = new RegExp (cookieName + '=(\\w+)');
      const match = event.headers && event.headers.cookie && regex.exec (event.headers.cookie);
      if (match) {
	cookie = match[1];
	dynamo.query({ TableName: sessionTableName,
                       KeyConditionExpression: "#ckey = :cval",
                       ExpressionAttributeNames:{
			 "#ckey": "cookie"
                       },
                       ExpressionAttributeValues: {
			 ":cval": cookie
                       }}, (err, res) => {
			 if (!err) {
			   const result = res.Items && res.Items.length && res.Items[0];
			   if (result)
			     tmpMap[templateUserVar] = result.email;
			 }
			 resolve();
		       });
      } else
	resolve();
    }
  });
  
  // Set up some returns
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

  // Query the database for the given symbol definition, or use evalText if supplied
  let symbolPromise =
      (typeof(evalText) === 'string'
       ? Promise.resolve (evalText)
       : new Promise ((resolve, reject) => {
	 dynamo.query({ TableName: tableName,
			KeyConditionExpression: "#nkey = :nval",
			ExpressionAttributeNames:{
			  "#nkey": "name"
			},
			ExpressionAttributeValues: {
			  ":nval": name.toLowerCase()
			}}, (err, res) => {
			  if (!err) {
			    const result = res.Items && res.Items.length && res.Items[0];
			    if (result && result.bracery)
                              tmpMap[templateDefVar] = result.bracery;
			  }
			  resolve();
			});
       }));

  // Query the database for recently-updated symbols
  let newsPromise = new Promise ((resolve, reject) => {
    dynamo.query({ TableName: tableName,
                   IndexName: updateIndexName,
                   ScanIndexForward: false,
                   Limit: config.recentlyUpdatedLimit,
                   KeyConditionExpression: "#viskey = :visval",
                   ExpressionAttributeNames:{
                     "#viskey": "visibility"
                   },
                   ExpressionAttributeValues: {
                     ":visval": config.defaultVisibility
                   }}, (err, res) => {
                     if (!err && res.Items)
                       tmpMap[templateRecentVar] = JSON.stringify (res.Items.map ((item) => item.name));
                     resolve();
                   });
  });

  cookiePromise
    .then (() => symbolPromise)
    .then (() => newsPromise)
    .then (() => {
      // Add log to template map
      tmpMap.LOG = logText;
      // Read the file, do the %VAR%->val template substitutions, and return
      fs.readFile (templateHtmlFilename, templateHtmlFileEncoding, (err, templateHtml) => {
        if (err)
          done (err);
        else
          ok (util.expandTemplate (templateHtml, tmpMap));
      });
    });

};
