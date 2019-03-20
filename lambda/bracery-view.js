/* This is a small AWS lambda function for presenting a page associated with a (named) Bracery symbol.
 */

//console.log('Loading function');

const fs = require('fs');

const util = require('./bracery-util');
const config = require('./bracery-config');

const tableName = config.tableName;
const updateIndexName = config.updateIndexName;

const dynamoPromise = util.dynamoPromise();

// Bracery
global.nlp = require('./compromise.es6.min');  // hack/workaround so Bracery can see nlp. Not very satisfactory.
const BraceryModule = require('./bracery');
const Bracery = BraceryModule.Bracery;
const ParseTree = BraceryModule.ParseTree;
const bracery = new Bracery();

// Markdown->HTML
const marked = require('marked');

// The static assets pointed to by these template substitutions
// should be uploaded in the Lambda zip of bracery-asset.js (or to S3, or wherever)
const hiddenStyle = 'style="display:none;"';
const templateVarValMap = { 'JAVASCRIPT_FILE': config.assetPrefix + config.viewAssetStub + '.js',
                            'STYLE_FILE': config.assetPrefix + config.viewAssetStub + '.css',
                            'BASE_URL': config.baseUrl,
                            'STORE_PATH_PREFIX': config.storePrefix,
                            'VIEW_PATH_PREFIX': config.viewPrefix,
                            'BOOKMARK_PATH_PREFIX': config.bookmarkPrefix,
                            'EXPAND_PATH_PREFIX': config.expandPrefix,
			    'LOGIN_PATH_PREFIX': config.loginPrefix,
                            'TWITTER_PATH_PREFIX': config.twitterPrefix,
                            'SOURCE_CONTROLS_STYLE': hiddenStyle,
                            'SOURCE_REVEAL_STYLE': '' };
const templateNameVar = 'SYMBOL_NAME';
const templateDefVar = 'SYMBOL_DEFINITION';
const templateRevVar = 'REVISION';
const templateRefsVar = 'REFERRING_SYMBOLS';
const templateLockedVar = 'LOCKED_BY_USER';
const templateInitVar = 'INIT_TEXT';
const templateVarsVar = 'VARS';
const templateRecentVar = 'RECENT_SYMBOLS';
const templateUserVar = 'USER';
const templateExpVar = 'EXPANSION';
const templateExpHtmlVar = 'EXPANSION_HTML';
const templateBotsVar = 'BOTS';
const templateWarningVar = 'INITIAL_WARNING';

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Set up some returns
  let session = await util.getSession (event, dynamoPromise);
  const respond = util.respond (callback, event, session);

  // Wrap all downstream calls (to dynamo etc) in try...catch
  try {
    // Get app state parameters
    const isRedirect = event && event.queryStringParameters && event.queryStringParameters.redirect;
    const isReset = event && event.queryStringParameters && event.queryStringParameters.reset;
    const gotSessionState = session && !!session.state && !isReset;
    const parsedSessionState = gotSessionState && JSON.parse (session.state);
    const revision = event.queryStringParameters && event.queryStringParameters.rev;
    const isBookmark = event && event.queryStringParameters && event.queryStringParameters.id;
    const appState =
	  (isBookmark
           ? await util.getBookmarkedParams (event, dynamoPromise)
           : (parsedSessionState && (isRedirect || parsedSessionState.name === util.getName(event))
	      ? parsedSessionState
	      : util.getParams (event)));
    const { name, initText, evalText, vars, expansion } = appState;
    
    // Add the name & a dummy empty definition to the template var->val map
    let tmpMap = util.extend ({}, templateVarValMap);
    let bots = {};
    tmpMap[templateNameVar] = name;
    tmpMap[templateDefVar] = typeof(evalText) === 'string' ? evalText : '';
    tmpMap[templateRevVar] = '';
    tmpMap[templateRefsVar] = [];
    tmpMap[templateLockedVar] = '';
    tmpMap[templateInitVar] = typeof(initText) === 'string' ? initText : false;
    tmpMap[templateRecentVar] = [];
    tmpMap[templateBotsVar] = bots;
    tmpMap[templateVarsVar] = vars;
    tmpMap[templateUserVar] = null;
    tmpMap[templateExpVar] = expansion;
    tmpMap[templateExpHtmlVar] = '<i>' + '...bracing...' + '</i>';
    tmpMap[templateWarningVar] = (gotSessionState
				  ? ('Loaded from auto-save (<a href="' + config.viewPrefix + name + '?reset=true">clear</a>).')
				  : '');

    const populateExpansionTemplates = (expansion) => {
      if (expansion) {
        const text = expansion.text || '', vars = expansion.vars || {}
        tmpMap[templateExpVar] = { text: text, vars: vars };
        tmpMap[templateExpHtmlVar] = util.expandMarkdown (text, marked);
      }
    };

    if (event && event.queryStringParameters && event.queryStringParameters.edit) {
      tmpMap['SOURCE_CONTROLS_STYLE'] = '';
      tmpMap['SOURCE_REVEAL_STYLE'] = hiddenStyle;
    }
    
    // Query the database for recently-updated symbols
    let newsPromise = dynamoPromise('query')
    ({ TableName: tableName,
       IndexName: updateIndexName,
       ScanIndexForward: false,
       Limit: config.recentlyUpdatedLimit,
       KeyConditionExpression: "#viskey = :visval",
       ExpressionAttributeNames: {
         "#viskey": "visibility"
       },
       ExpressionAttributeValues: {
         ":visval": config.defaultVisibility
       }})
      .then ((res) => {
        if (res.Items)
          tmpMap[templateRecentVar] = res.Items.map ((item) => item.name);
      });

    // Query the database for the given symbol definition
    let symbolPromise = util.getBracery (name, revision, dynamoPromise)
        .then ((res) => {
          const result = res.Items && res.Items.length && res.Items[0];
	  if (result) {
            tmpMap[templateRevVar] = result.revision;
            if (result.locked && result.owner === session.user)
              tmpMap[templateLockedVar] = ' checked';
	  }
	  if (!result || (typeof(evalText) === 'string' && !revision))
	    return expansion;
          if (result.bracery)
            tmpMap[templateDefVar] = result.bracery;
          // If no expansion, call expandFull
          return (expansion
                  ? expansion
                  : (util
		     .braceryExpandConfig (bracery, vars, dynamoPromise)
		     .expandFull ({ rhsText: result.bracery || '' })));
        }).then (populateExpansionTemplates);

    // Query the database for any symbols that use this symbol
    let refPromise = await dynamoPromise('query')
    ({ TableName: config.wordTableName,
       KeyConditionExpression: "#word = :word",
       ExpressionAttributeNames: { "#word": "word" },
       ExpressionAttributeValues: { ":word": ParseTree.symChar + name } })
      .then ((res) => {
        const result = res.Items && res.Items.length && res.Items[0];
	if (result)
	  tmpMap[templateRefsVar] = result.symbols.split(' ');
      });
    
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

    // Reset the session, if requested
    let resetPromise =
	(isReset
	 ? dynamoPromise('updateItem')
	 ({ TableName: config.sessionTableName,
            Key: { cookie: session.cookie },
            UpdateExpression: 'SET #s = :s',
            ExpressionAttributeNames: {
              '#s': 'state',
            },
            ExpressionAttributeValues: {
              ':s': 'null',
            } })
	 : Promise.resolve());
    
    // Read the template HTML file
    const templateHtmlBuf = await util.promisify (fs.readFile) (config.templateHtmlFilename, config.templateHtmlFileEncoding);

    // Wait for promises
    await newsPromise;
    await symbolPromise;
    await botPromise;
    await resetPromise;
    
    // Do the %VAR%->val template substitutions
    if (session && session.loggedIn && session.email)
      tmpMap[templateUserVar] = session.email.replace(/(\w)[^@\.]+([@\.])/g,(m,c,s)=>c+'**'+s);  // obfuscate email for username in view
    const finalHtml = util.expandTemplate (templateHtmlBuf.toString(), tmpMap);

    // And return
    respond.withCookie (finalHtml);

  } catch (e) {
    console.warn (e);  // to CloudWatch
    respond.serverError (e);
  }
};
