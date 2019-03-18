/* This is a small AWS lambda function for expanding Bracery in DynamoDB.
*/

//console.log('Loading function');

// const config = require('./bracery-config');
const util = require('./bracery-util');

global.nlp = require('./compromise.es6.min');  // hack/workaround so Bracery can see nlp. Not very satisfactory.
const Bracery = require('./bracery').Bracery;
const rita = require('./rita-tiny');

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get initial vars as query or body parameters, if supplied
  const vars = util.getVars (event);

  // Set up some returns
  const respond = util.respond (callback, event);

  // Set up Bracery
  let bracery = new Bracery (null, { rita });
  let braceryConfig = util.braceryExpandConfig (bracery, vars, util.dynamoPromise());

  // GET (single symbol) or POST (arbitrary Bracery)?
  let expansion = null;
  switch (event.httpMethod) {
  case 'GET':
    // Get symbol name
    const name = event.pathParameters.name;
    // Call expandSymbol
    expansion = await braceryConfig.expandFull ({ symbolName: name });
    break;
  case 'POST':
    // Get Bracery to expand
    const braceryText = util.getBody(event).bracery;
    // Call expand
    expansion = await bracery.expand ({ rhsText: braceryText },
                                      braceryConfig);
    break;
  default:
    return respond.badMethod();
  }
  // And return
  respond.ok (expansion);
};
