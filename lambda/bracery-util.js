const promisify = require('util').promisify;
const braceryWeb = require ('./bracery-web');
const extend = braceryWeb.extend;
const escapeHTML = braceryWeb.escapeHTML;

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

function dynamoPromise (dynamo) {
  return (method) => promisify (dynamo[method].bind (dynamo));
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
};
