const https = require('https');
const promisify = require('util').promisify;

const braceryWeb = require ('./bracery-web');
const extend = braceryWeb.extend;
const escapeHTML = braceryWeb.escapeHTML;
const expandMarkdown = braceryWeb.expandMarkdown;
const digestText = braceryWeb.digestText;
const getWords = braceryWeb.getWords;
const defaultSymbolName = braceryWeb.defaultSymbolName;
const bookmarkRegex = braceryWeb.bookmarkRegex;

const config = require ('./bracery-config');

function btoa (s) {
  return Buffer.from(s).toString('base64');
}

function promiseDelay (delay) {
  return new Promise ((resolve) => setTimeout (resolve, delay));
}

const logAllDynamoOperations = false;
function dynamoPromise() {
  const doc = require('dynamodb-doc');
  let dynamo = new doc.DynamoDB();
  if (logAllDynamoOperations)
    return (method) => ((params) => { console.log(JSON.stringify({method,params})); return promisify (dynamo[method].bind (dynamo)) (params) });
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
    let cookie = event.headers && (event.headers.cookie || event.headers.Cookie);
    if (cookie) {
      let m;
      while ((m = regex.exec (cookie)))  // get last (& presumably most recent) cookie, in case document.cookie has got multiple cookies
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
    const newSession = { cookie: newCookie,
			 expires: Math.ceil (Date.now() / 1000 + config.sessionExpirationSeconds) };
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

async function clearSession (session, dynamoPromise) {
  await dynamoPromise('updateItem')
  ({ TableName: config.sessionTableName,
     Key: { cookie: session.cookie },
     UpdateExpression: 'SET #s = :s',
     ExpressionAttributeNames: {
       '#s': 'state',
     },
     ExpressionAttributeValues: {
       ':s': 'null',
     } });
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

function getName (event) {
  const body = getBody (event);
  
  const name = ((event && event.pathParameters && event.pathParameters.name)
		|| (event && event.queryStringParameters && event.queryStringParameters.name)
		|| body.name
		|| defaultSymbolName);

  return name;
}

function getParams (event) {
  const body = getBody (event);
  
  // Get the symbol name
  const name = getName (event);

  // Get symbol definition override from query parameters, if supplied
  const initText = ((event && event.queryStringParameters && typeof(event.queryStringParameters['text']) === 'string')
		    ? event.queryStringParameters['text']
		    : (body.text || undefined));
  
  // Get evaluation text override from query parameters, if supplied
  const evalText = ((event && event.queryStringParameters && typeof(event.queryStringParameters['eval']) === 'string')
		    ? event.queryStringParameters['eval']
		    : (body.eval || undefined));

  // Get the expansion, if supplied
  const expansion = ((event && event.queryStringParameters && typeof(event.queryStringParameters['exp']) === 'string')
		     ? JSON.parse (event.queryStringParameters['exp'])
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
    extend (vars, JSON.parse (event.queryStringParameters.vars));
  if (body.vars)
    extend (vars, body.vars);
  return vars;
}

async function getBracery (name, revision, dynamoPromise) {
  const query = ({ KeyConditionExpression: '#n = :n',
		   ExpressionAttributeNames: {
		     '#n': 'name'
		   },
		   ExpressionAttributeValues: {
		     ':n': name
		   }});
  if (revision) {
    query.TableName = config.revisionsTableName;
    query.KeyConditionExpression += ' AND #r = :r';
    query.ExpressionAttributeNames['#r'] = 'revision';
    query.ExpressionAttributeValues[':r'] = parseInt (revision);
  } else
    query.TableName = config.tableName;
  return await dynamoPromise('query') (query);
}

async function createBracery (item, dynamoPromise) {
  item.visibility = config.defaultVisibility;
  item.created = item.updated = Date.now();
  item.revision = 1;
  await dynamoPromise('putItem')
  ({ TableName: config.tableName,
     Item: item,
   });
  await putBraceryRevision (item, dynamoPromise);
  return item;
}

async function updateBracery (item, dynamoPromise) {
  item.updated = Date.now();
  let expr = "SET #b = :b, #u = :u, #r = " + (item.revision ? "#r + :r" : ":r");
  let keys = { "#b": "bracery",
               "#u": "updated",
	       "#r": "revision" };
  let attrs = { ":b": item.bracery,
                ":u": item.updated,
		":r": 1 };
  if (typeof(item.locked) !== 'undefined') {
    expr = expr + ", #l = :l";
    keys['#l'] = 'locked';
    attrs[':l'] = item.locked;
  }
  if (typeof(item.owner) !== 'undefined') {
    expr = expr + ", #o = :o";
    keys['#o'] = 'owner';
    attrs[':o'] = item.owner;
  }
  const update = await dynamoPromise('updateItem')
  ({ TableName: config.tableName,
     Key: { name: item.name },
     UpdateExpression: expr,
     ExpressionAttributeNames: keys,
     ExpressionAttributeValues: attrs,
     ReturnValues: 'UPDATED_NEW',
   });
  item.revision = update.Attributes.revision;
  await putBraceryRevision (item, dynamoPromise);
  return update.Attributes;
}

async function putBraceryRevision (item, dynamoPromise) {
  await dynamoPromise('putItem')
  ({ TableName: config.revisionsTableName,
     Item: item,
   });
}

function withCookie (callback, session) {
  return (res) => {
    let headers = {
      'Content-Type': 'text/html; charset=' + config.stringEncoding,
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
  var braceryCache = {}
  const getSymbol = async (getConfig) => {
    const symbolName = getConfig.symbolName || getConfig.node.name;
    if (braceryCache[symbolName])
      return braceryCache[symbolName];
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
    return (braceryCache[symbolName] = (result && result.bracery) ? [result.bracery] : '');
  };

  // Create an expandSymbol function that queries the database for the given name, and expands it as Bracery
  const expandFull = async (expandConfig) => {
    let result = null;
    if (expandConfig.rhsText)
      result = await bracery.expand (expandConfig.rhsText, braceryConfig);
    else {
      const symbolDefinition = await getSymbol (expandConfig);
      result = await bracery.expand (symbolDefinition[0], braceryConfig);
    }
    return result;
  };

  // create a dummy setSymbol function
  const setSymbol = () => [];

  // Return
  extend (braceryConfig,
          braceryWeb.braceryLimits,
          { expandFull: expandFull,
            get: getSymbol,
            set: setSymbol,
	    expand: null,  // signals to Bracery that we want it to fetch the symbol definition & then expand it locally
            callback: true,  // signals to Bracery that we want it to return promises
            makeLink: braceryWeb.makeInternalLink.bind (null, btoa) });

  return braceryConfig;
}

module.exports = {
  // From bracery-web.js
  promisify,
  extend,
  escapeHTML,
  expandMarkdown,
  digestText,
  getWords,
  bookmarkRegex,

  // From this file
  promiseDelay,
  dynamoPromise,
  getBracery,
  createBracery,
  updateBracery,
  expandTemplate,
  randomChar,
  makeUniqueId,
  getBody,
  getVars,
  getSession,
  getParams,
  getName,
  getBookmarkedParams,
  clearSession,
  createBookmark,
  httpsRequest,
  respond,
  braceryExpandConfig,
};
