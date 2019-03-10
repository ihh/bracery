/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

// const config = require('./bracery-config');
const util = require('./bracery-util');

global.nlp = require('./expand-deps/compromise.es6.min');  // hack/workaround so Bracery can see nlp. Not very satisfactory.
const Bracery = require('./expand-deps/bracery').Bracery;

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get symbol name
  const name = event.pathParameters.name;

  // Get initial vars as query or body parameters, if supplied
  const vars = util.getVars (event);

  // Set up some returns
  const respond = util.respond (callback, event);

  // Set up Bracery
  let bracery = new Bracery();
  let braceryConfig = util.braceryExpandConfig (bracery, vars);

  // Call expandSymbol
  let expansion = await braceryConfig.expandFull ({ symbolName: name });

  // And return
  respond.ok (expansion);
};
