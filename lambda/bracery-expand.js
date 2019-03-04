/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const config = require('./bracery-config');
const tableName = config.tableName;

const util = require('./bracery-util');

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

global.nlp = require('./expand-deps/compromise.es6.min');  // hack/workaround
const Bracery = require('./expand-deps/bracery').Bracery;

// The Lambda function
exports.handler = (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get symbol name
  const name = event.pathParameters.name;

  // Get initial vars as query or body parameters, if supplied
  const vars = util.getVars (event);

  // Set up some returns
  const done = (err, res) => callback (null, {
    statusCode: err ? (err.statusCode || '400') : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const ok = (result) => done (null, result);

  // Set up Bracery
  let bracery = new Bracery(), braceryConfig;

  // Create a getSymbol function that queries the database for the given name
  const getSymbol = (config) => {
    const symbolName = config.symbolName || config.node.name;
    return new Promise ((resolve, reject) => {
      dynamo.query({ TableName: tableName,
                     KeyConditionExpression: "#nkey = :nval",
                     ExpressionAttributeNames:{
                       "#nkey": "name"
                     },
                     ExpressionAttributeValues: {
                       ":nval": symbolName.toLowerCase()
                     }}, (err, res) => {
                       if (!err) {
                         const result = res.Items && res.Items.length && res.Items[0];
                         if (result && result.bracery)
                           resolve (result.bracery);
                       }
                       resolve ('');
                     });
    });
  };

  // Create an expandSymbol function that queries the database for the given name, and expands it as Bracery
  const expandSymbolFull = (config) =>
        new Promise ((resolve, reject) =>
                     getSymbol (config)
                     .then ((symbolDefinition) =>
                            bracery.expand (symbolDefinition,
                                            util.extend ({ callback: resolve },
                                                         braceryConfig,
                                                         { vars: vars }))));

  const expandSymbol = (config) => expandSymbolFull (config).then ((expansion) => expansion.tree);

  // create a dummy setSymbol function
  const setSymbol = () => [];

  // Pass the symbol accessors into Bracery's config
  braceryConfig = { expand: expandSymbol,
                    get: getSymbol,
                    set: setSymbol };
  bracery = new Bracery (null, );

  // Call expandSymbol and return
  expandSymbolFull ({ symbolName: name }).then (ok);
};
