/* This is a small AWS lambda function for presenting a page associated with a (named) Bracery symbol.
 */

//console.log('Loading function');

const fs = require('fs');

const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;
const updateIndexName = config.updateIndexName;

const dynamoPromise = util.dynamoPromise();

// The static assets pointed to by these template substitutions
// should be uploaded in the Lambda zip of bracery-asset.js (or to S3, or wherever)
const templateVarValMap = { 'JAVASCRIPT_FILE': config.assetPrefix + config.viewAssetStub + '.js',
                            'STYLE_FILE': config.assetPrefix + config.viewAssetStub + '.css',
                            'BASE_URL': config.baseUrl,
                            'STORE_PATH_PREFIX': config.storePrefix,
                            'VIEW_PATH_PREFIX': config.viewPrefix,
                            'EXPAND_PATH_PREFIX': config.expandPrefix,
			    'LOGIN_PATH_PREFIX': config.loginPrefix,
                            'TWITTER_PATH_PREFIX': config.twitterPrefix };
const templateNameVar = 'SYMBOL_NAME';
const templateDefVar = 'SYMBOL_DEFINITION';
const templateLockedVar = 'LOCKED_BY_USER';
const templateInitVar = 'INIT_TEXT';
const templateVarsVar = 'VARS';
const templateRecentVar = 'RECENT_SYMBOLS';
const templateUserVar = 'USER';
const templateExpVar = 'EXPANSION';
const templateBotsVar = 'BOTS';

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Set up some returns
  let session = await util.getSession (event, dynamoPromise);
  const respond = util.respond (callback, event, session);

  // Wrap all downstream calls (to dynamo etc) in try...catch
  try {
    // Get parameters
    const { name, initText, evalText, vars, expansion } =
	  (event && event.queryStringParameters && event.queryStringParameters.redirect && session && session.state
	   ? JSON.parse (session.state)
	   : util.getParams (event));

    // Add the name & a dummy empty definition to the template var->val map
    let tmpMap = util.extend ({}, templateVarValMap);
    let bots = {};
    tmpMap[templateNameVar] = name;
    tmpMap[templateDefVar] = typeof(evalText) === 'string' ? evalText : '';
    tmpMap[templateLockedVar] = '';
    tmpMap[templateInitVar] = typeof(initText) === 'string' ? initText : false;
    tmpMap[templateRecentVar] = [];
    tmpMap[templateBotsVar] = bots;
    tmpMap[templateVarsVar] = vars;
    tmpMap[templateUserVar] = null;
    tmpMap[templateExpVar] = expansion;

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
          tmpMap[templateRecentVar] = res.Items.map ((item) => item.name);
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
              if (result && result.bracery) {
                tmpMap[templateDefVar] = result.bracery;
                if (result.locked && result.owner === session.user)
                  tmpMap[templateLockedVar] = ' checked';
              }
            })));

    // Query the database for any bots we're operating
    let botPromise =
        (session && session.loggedIn
         ? (dynamoPromise('query')
            ({ TableName: config.twitterTableName,
               KeyConditionExpression: "#u = :u",
               ExpressionAttributeNames: {
                 '#u': 'user'
               },
               ExpressionAttributeValues: {
                 ':u': session.user
               }})
            .then ((res) => {
              if (res && res.Items)
                res.Items.forEach ((item) => {
                  const tweep = item.twitterScreenName;
                  if (!bots[tweep])
                    bots[tweep] = [];
                  bots[tweep].push (item.name);
                });
            }))
         : Promise.resolve());
    
    // Read the template HTML file
    const templateHtmlBuf = await util.promisify (fs.readFile) (config.templateHtmlFilename, config.templateHtmlFileEncoding);

    // Wait for promises
    await newsPromise;
    await symbolPromise;
    await botPromise;
    
    // Do the %VAR%->val template substitutions
    if (session && session.loggedIn && session.email)
      tmpMap[templateUserVar] = session.email.replace(/(\w)[^@\.]+([@\.])/g,(m,c,s)=>c+'**'+s);  // obfuscate email for username in view
    tmpMap.LOG = logText;  // add log to template map
    const finalHtml = util.expandTemplate (templateHtmlBuf.toString(), tmpMap);

    // And return
    respond.withCookie (finalHtml);

  } catch (e) {
    console.warn (e);  // to CloudWatch
    respond.serverError (e);
  }
};
