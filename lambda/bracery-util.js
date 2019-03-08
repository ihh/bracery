const https = require('https');
const doc = require('dynamodb-doc');
const promisify = require('util').promisify;

const braceryWeb = require ('./bracery-web');
const extend = braceryWeb.extend;
const escapeHTML = braceryWeb.escapeHTML;

const config = require ('./bracery-config');

function getBody (event) {
  return (event.body
          ? (typeof(event.body) === 'string'
             ? JSON.parse (event.body)
             : event.body)
          : {});
}

function getVars (event) {
  let vars = {};
  if (event.queryStringParameters && event.queryStringParameters.vars)
    extend (vars, JSON.parse (decodeURI (event.queryStringParameters.vars)));
  if (event.body) {
    const body = getBody (event);
    if (body.vars)
      extend (vars, body.vars);
  }
  return vars;
}

function expandTemplate (template, tmpMap) {
  return Object.keys (tmpMap).reduce ((text, templateVar) => {
    const templateVal = tmpMap[templateVar];
    return text
      .replace (new RegExp ('%' + templateVar + '%', 'g'), templateVal)
      .replace (new RegExp ('%ESCAPED_' + templateVar + '%', 'g'), escapeHTML (templateVal))
      .replace (new RegExp ('%QUOTED_' + templateVar + '%', 'g'), JSON.stringify (templateVal));
  }, template);
}

function generateCookie() {
  return Date.now().toString(16) + Math.random().toString().substr(2)
}

function dynamoPromise() {
  let dynamo = new doc.DynamoDB();
  return (method) => promisify (dynamo[method].bind (dynamo));
}

async function getSession (event, dynamoPromise) {
  try {
    const regex = new RegExp (config.cookieName + '=(\\w+)', 'g');
    let match;
    if (event.headers && event.headers.cookie) {
      let m;
      while (m = regex.exec (event.headers.cookie))  // get last (& presumably most recent) cookie, in case document.cookie has got multiple cookies
	match = m;
    }
    if (match) {
      let cookie = match[1];
      let queryRes = await dynamoPromise('query')
      ({ TableName: config.sessionTableName,
	 KeyConditionExpression: "#ckey = :cval",
	 ExpressionAttributeNames:{
	   "#ckey": "cookie"
	 },
	 ExpressionAttributeValues: {
	   ":cval": cookie
	 }});
      if (queryRes.Items && queryRes.Items.length)
	return queryRes.Items[0];
    }
    const newCookie = generateCookie();
    const newSession = { cookie: newCookie };
    await dynamoPromise('putItem')
    ({ TableName: config.sessionTableName,
       Item: newSession,
     });
    return newSession;
  } catch (e) {
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

function getParams (event) {
  // Get the symbol name
  const name = ((event && event.pathParameters && event.pathParameters.name)
		|| (event && event.queryStringParameters && event.queryStringParameters.name)
		|| config.defaultSymbolName);

  // Get symbol definition override from query parameters, if supplied
  const initText = ((event && event.queryStringParameters && typeof(event.queryStringParameters['text']) === 'string')
		    ? decodeURIComponent (event.queryStringParameters['text'])
		    : undefined);
  
  // Get evaluation text override from query parameters, if supplied
  const evalText = ((event && event.queryStringParameters && typeof(event.queryStringParameters['eval']) === 'string')
		    ? decodeURIComponent (event.queryStringParameters['eval'])
		    : undefined);

  // Get the expansion, if supplied
  const expansion = ((event && event.queryStringParameters && typeof(event.queryStringParameters['exp']) === 'string')
		    ? decodeURIComponent (event.queryStringParameters['exp'])
		    : undefined);

  // Get initial vars as query parameters, if supplied
  const vars = getVars (event);
  
  // Return
  return { name, initText, evalText, vars, expansion };
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

function serverError (callback) {
  return (msg) => callback (null, { statusCode: '500', body: msg || "Server error" });
}

function notFound (callback) {
  return () => callback (null, { statusCode: '404', body: `Name not found "${name}"` });
}

function badMethod (callback, event) {
  return () => done ({ statusCode: '405', body: `Unsupported method "${event.httpMethod}"` });
}

function redirectFound (callback) {
  return (url) => callback (null, {
    statusCode: '302',
    headers: {
      'Location': url,
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

function redirectWithCookie (callback, session) {
  return (url) => callback (null, {
    statusCode: '302',
    headers: {
      'Location': url,
      'Set-Cookie': config.cookieName + '=' + session.cookie,
    },
  });
}

function respond (callback, event, session) {
  return {
    withCookie: withCookie (callback, session),
    ok: ok (callback),
    serverError: serverError (callback),
    notFound: notFound (callback),
    badMethod: badMethod (callback, event),
    redirectFound: redirectFound (callback),
    redirectPost: redirectPost (callback),
    redirectWithCookie: redirectWithCookie (callback, session),
  };
}

module.exports = {
  extend,
  escapeHTML,
  promisify,
  getBody,
  getVars,
  expandTemplate,
  generateCookie,
  dynamoPromise,
  getSession,
  getParams,
  httpsRequest,
  respond,
};
