var braceryWeb = require ('./bracery-web');
var extend = braceryWeb.extend;
var escapeHTML = braceryWeb.escapeHTML;

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

module.exports = {
  extend: extend,
  escapeHTML: escapeHTML,
  getBody: getBody,
  getVars: getVars
}
