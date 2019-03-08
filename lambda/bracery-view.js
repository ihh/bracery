/* This is a small AWS lambda function for presenting a page associated with a (named) Bracery symbol.
 */

//console.log('Loading function');

const fs = require('fs');

const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;
const updateIndexName = config.updateIndexName;
const defaultName = config.defaultSymbolName;

const dynamoPromise = util.dynamoPromise();

const COGNITO_APP_CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID;  // must be defined from AWS Lambda

// The static assets pointed to by these template substitutions
// should be uploaded in the Lambda zip of bracery-asset.js (or to S3, or wherever)
const templateVarValMap = { 'JAVASCRIPT_FILE': config.assetPrefix + config.viewAssetStub + '.js',
                            'STYLE_FILE': config.assetPrefix + config.viewAssetStub + '.css',
                            'BASE_URL': config.baseUrl,
                            'STORE_PATH_PREFIX': config.storePrefix,
                            'VIEW_PATH_PREFIX': config.viewPrefix,
                            'EXPAND_PATH_PREFIX': config.expandPrefix,
			    'LOGIN_PATH_PREFIX': config.loginPrefix,
			    'COGNITO_DOMAIN': config.cognitoDomain,
			    'COGNITO_APP_ID': COGNITO_APP_CLIENT_ID };
const templateNameVar = 'SYMBOL_NAME';
const templateDefVar = 'SYMBOL_DEFINITION';
const templateInitVar = 'INIT_TEXT';
const templateVarsVar = 'VARS';
const templateRecentVar = 'RECENT_SYMBOLS';
const templateUserVar = 'USER';

// Function to get parameters
function getParams (event) {
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

  // Return
  return { name, initText, evalText, vars };
}

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Set up some returns
  let session = await util.getSession (event, dynamoPromise);
  const respond = util.respond (callback, event, session);

  // Wrap all downstream calls (to dynamo etc) in try...catch
  try {
    // Get parameters
    const { name, initText, evalText, vars } = getParams (event);
    
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
    const log = () => {
      logText += Array.prototype.map.call (arguments, (arg) => JSON.stringify (arg)).join(' ') + '\n';
    };
    
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
    

    // Read the file
    const templateHtmlBuf = await util.promisify (fs.readFile) (config.templateHtmlFilename, config.templateHtmlFileEncoding);

    // Wait for promises
    await newsPromise;
    await symbolPromise;
    
    // Do the %VAR%->val template substitutions
    if (session)
      tmpMap[templateUserVar] = session.email.replace(/(\w)\w+([@\.])/g,(m,c,s)=>c+'**'+s);  // obfuscate email
    tmpMap.LOG = logText;  // add log to template map
    const finalHtml = util.expandTemplate (templateHtmlBuf.toString(), tmpMap);

    // And return
    respond.withCookie (finalHtml);

  } catch (e) {
    console.warn(e);
    respond.serverError (e);
  }
};
