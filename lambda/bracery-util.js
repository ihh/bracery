const https = require('https');
const doc = require('dynamodb-doc');
const promisify = require('util').promisify;

const braceryWeb = require ('./bracery-web');
const extend = braceryWeb.extend;
const escapeHTML = braceryWeb.escapeHTML;
const expandMarkdown = braceryWeb.expandMarkdown;
const digestHTML = braceryWeb.digestHTML;

const config = require ('./bracery-config');

function promiseDelay (delay) {
  return new Promise ((resolve) => setTimeout (resolve, delay));
}

function dynamoPromise() {
  let dynamo = new doc.DynamoDB();
  return (method) => promisify (dynamo[method].bind (dynamo));
}

function getBody (event) {
  return (event.body
          ? (typeof(event.body) === 'string'
             ? JSON.parse (event.body)
             : event.body)
          : {});
}

function expandTemplate (template, tmpMap) {
  return Object.keys (tmpMap).reduce ((text, templateVar) => {
    const templateVal = tmpMap[templateVar];
    return text
      .replace (new RegExp ('%' + templateVar + '%', 'g'), templateVal)
      .replace (new RegExp ('%ESCAPED_' + templateVar + '%', 'g'), escapeHTML (templateVal))
      .replace (new RegExp ('%JSON_' + templateVar + '%', 'g'), JSON.stringify (templateVal));
  }, template);
}

function randomChar() {
  const r = Math.floor (36 * Math.random());
  return r.toString (36);
}

async function makeUniqueId (tableName, idAttr, initialIdChars, dynamoPromise) {
  const uniqueIdPromiser = async (id) => {
    let params = {
      TableName: tableName,
      KeyConditionExpression: "#id = :id",
      ExpressionAttributeNames: {
        "#id": idAttr,
      },
      ExpressionAttributeValues: {
        ":id": id,
      },
    };
    const res = await dynamoPromise('query') (params);
    return (res && res.Items && res.Items.length
            ? await uniqueIdPromiser (id + randomChar())
            : id);
    
  };
  return await uniqueIdPromiser (new Array(initialIdChars).fill(0).map (randomChar).join(''));
}

async function getSession (event, dynamoPromise) {
  try {
    const regex = new RegExp (config.cookieName + '=(\\w+)', 'g');
    let match;
    if (event.headers && event.headers.cookie) {
      let m;
      while ((m = regex.exec (event.headers.cookie)))  // get last (& presumably most recent) cookie, in case document.cookie has got multiple cookies
	match = m;
    }
    if (match) {
      let cookie = match[1];
      let queryRes = await dynamoPromise('query')
      ({ TableName: config.sessionTableName,
	 KeyConditionExpression: "#ckey = :cval",
	 ExpressionAttributeNames: {
	   "#ckey": "cookie"
	 },
	 ExpressionAttributeValues: {
	   ":cval": cookie
	 }});
      if (queryRes.Items && queryRes.Items.length)
	return queryRes.Items[0];
    }
    const newCookie = await makeUniqueId (config.sessionTableName, 'cookie', 16, dynamoPromise);
    const newSession = { cookie: newCookie };
    await dynamoPromise('putItem')
    ({ TableName: config.sessionTableName,
       Item: newSession,
     });
    return newSession;
  } catch (e) {
    console.warn (e);  // to CloudWatch
    return null;
  }
}

// async https.request
async function httpsRequest (opts, formData) {
  return new Promise
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
}

async function createBookmark (params, session, dynamoPromise) {
  const id = await makeUniqueId (config.bookmarkTableName, 'id', 4, dynamoPromise);
  let bookmark = { id: id,
                   created: Date.now(),
                   accessed: Date.now(),
                   accessCount: 0 };
  if (session && session.loggedIn)
    bookmark.user = session.user;
  Object.keys(params).forEach ((p) => {
    if (params[p])
      bookmark[p] = params[p];
  });
  await dynamoPromise('putItem')
  ({ TableName: config.bookmarkTableName,
     Item: bookmark });
  const url = config.baseUrl + config.viewPrefix + '?id=' + id;
  return { id, url };
}

async function getBookmarkedParams (event, dynamoPromise) {
  const id = event.queryStringParameters.id;
  let params = getParams (event);
  const res = await dynamoPromise('query')
  ({ TableName: config.bookmarkTableName,
     KeyConditionExpression: "#id = :id",
     ExpressionAttributeNames: {
       "#id": "id"
     },
     ExpressionAttributeValues: {
       ":id": id
     }});
  if (res && res.Items && res.Items.length) {
    const bookmark = res.Items[0];
    ['name','initText','evalText','vars','expansion']
      .forEach ((p) => {
        if (bookmark[p])
          params[p] = bookmark[p];
      });
    await dynamoPromise('updateItem')
    ({ TableName: config.bookmarkTableName,
       Key: { id: id },
       UpdateExpression: 'SET #a = :a, #c = #c + :n',
       ExpressionAttributeNames: {
         '#a': 'accessed',
         '#c': 'accessCount'
       },
       ExpressionAttributeValues: {
         ':a': Date.now(),
         ':n': 1
       },
     });
  }
  return params;
}

function getParams (event) {
  const body = getBody (event);
  
  // Get the symbol name
  const name = ((event && event.pathParameters && event.pathParameters.name)
		|| (event && event.queryStringParameters && event.queryStringParameters.name)
		|| body.name
		|| config.defaultSymbolName);

  // Get symbol definition override from query parameters, if supplied
  const initText = ((event && event.queryStringParameters && typeof(event.queryStringParameters['text']) === 'string')
		    ? decodeURIComponent (event.queryStringParameters['text'])
		    : (body.text || undefined));
  
  // Get evaluation text override from query parameters, if supplied
  const evalText = ((event && event.queryStringParameters && typeof(event.queryStringParameters['eval']) === 'string')
		    ? decodeURIComponent (event.queryStringParameters['eval'])
		    : (body.eval || undefined));

  // Get the expansion, if supplied
  const expansion = ((event && event.queryStringParameters && typeof(event.queryStringParameters['exp']) === 'string')
		     ? JSON.parse (decodeURIComponent (event.queryStringParameters['exp']))
		     : (body.expansion || undefined));

  // Get initial vars as query parameters, if supplied
  const vars = getVars (event, body);
  
  // Return
  return { name, initText, evalText, vars, expansion };
}

function getVars (event, body) {
  body = body || getBody (event);
  let vars = {};
  if (event.queryStringParameters && event.queryStringParameters.vars)
    extend (vars, JSON.parse (decodeURI (event.queryStringParameters.vars)));
  if (body.vars)
    extend (vars, body.vars);
  return vars;
}

function withCookie (callback, session) {
  return (res) => {
    let headers = {
      'Content-Type': 'text/html; charset=' + config.templateHtmlFileEncoding,
    };
    if (session && session.cookie)
      headers['Set-Cookie'] = config.cookieName + '=' + session.cookie;
    callback (null, {
      statusCode: '200',
      body: res,
      headers: headers,
    });
  };
}

function ok (callback) {
  return (res) => callback (null, {
    statusCode: '200',
    body: JSON.stringify (res),
    headers: {
      'Content-Type': 'application/json',
    },
  });			       
}

function redirectFound (callback) {
  return (url) => callback (null, {
    statusCode: '302',
    headers: {
      'Location': url,
    },
  });
}

function redirectWithCookie (callback, session) {
  return (url) => callback (null, {
    statusCode: '302',
    headers: {
      'Location': url,
      'Set-Cookie': config.cookieName + '=' + session.cookie,
    },
  });
}

function redirectPost (callback) {
  return (url) => callback (null, {
    statusCode: '303',
    headers: {
      'Location': url,
    },
  });
}

function badRequest (callback) {
  return (msg) => callback (null, { statusCode: '400', body: msg || "Bad request" });
}

function forbidden (callback) {
  return (msg) => callback (null, { statusCode: '403', body: msg || "Forbidden" });
}

function notFound (callback) {
  return (msg) => callback (null, { statusCode: '404', body: msg || "Not found" });
}

function badMethod (callback, event) {
  return () => callback ({ statusCode: '405', body: `Unsupported method "${event.httpMethod}"` });
}

function serverError (callback) {
  return (msg) => callback (null, { statusCode: '500', body: msg || "Server error" });
}

function respond (callback, event, session) {
  return {
    withCookie: withCookie (callback, session),
    ok: ok (callback),
    redirectFound: redirectFound (callback),
    redirectPost: redirectPost (callback),
    redirectWithCookie: redirectWithCookie (callback, session),
    badRequest: badRequest (callback),
    forbidden: forbidden (callback),
    notFound: notFound (callback),
    badMethod: badMethod (callback, event),
    serverError: serverError (callback),
  };
}

function braceryExpandConfig (bracery, vars, dp) {
  let braceryConfig = { vars };
  
  // Create a getSymbol function that queries the database for the given name
  const getSymbol = async (getConfig) => {
    const symbolName = getConfig.symbolName || getConfig.node.name;
    const res = await dp('query')
    ({ TableName: config.tableName,
       KeyConditionExpression: "#nkey = :nval",
       ExpressionAttributeNames: {
         "#nkey": "name"
       },
       ExpressionAttributeValues: {
         ":nval": symbolName.toLowerCase()
       }});
    const result = res.Items && res.Items.length && res.Items[0];
    return (result && result.bracery) || '';
  };

  // Create an expandSymbol function that queries the database for the given name, and expands it as Bracery
  const expandSymbolFull = async (expandConfig) => {
    const symbolDefinition = await getSymbol (expandConfig);
    return await bracery.expand (symbolDefinition, braceryConfig);
  };

  const expandSymbol = async (config) => {
    const expansion = await expandSymbolFull (config);
    return expansion.tree;
  };

  // create a dummy setSymbol function
  const setSymbol = () => [];

  // Return
  extend (braceryConfig,
          { expandFull: expandSymbolFull,
            expand: expandSymbol,
            get: getSymbol,
            set: setSymbol,
            makeLink: braceryWeb.makeInternalLink });

  return braceryConfig;
}

module.exports = {
  extend,
  escapeHTML,
  expandMarkdown,
  digestHTML,
  promisify,
  promiseDelay,
  dynamoPromise,
  getBody,
  getVars,
  expandTemplate,
  randomChar,
  makeUniqueId,
  getSession,
  getParams,
  getBookmarkedParams,
  createBookmark,
  httpsRequest,
  respond,
  braceryExpandConfig,
};
