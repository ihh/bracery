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
  const regex = new RegExp (config.cookieName + '=(\\w+)');
  const match = event.headers && event.headers.cookie && regex.exec (event.headers.cookie);
  if (match) {
    cookie = match[1];
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
};
