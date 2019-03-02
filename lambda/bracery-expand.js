/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();
const tableName = 'BraceryTable';

global.nlp = require('./expand-deps/compromise.es6.min');
const Bracery = require('./expand-deps/bracery').Bracery;

// The Lambda function
exports.handler = (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get symbol name
  const name = event.pathParameters.name;

  // Set up some returns
  const done = (err, res) => callback (null, {
    statusCode: err ? (err.statusCode || '400') : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const notFound = () => done (new Error(`Name not found "${name}"`));
  const badMethod = () => done (new Error(`Unsupported method "${event.httpMethod}"`));
  const wrongPassword = () => done ({ statusCode: '401', message: "Incorrect password" });
  const serverError = () => done ({ statusCode: '500', message: "Server error" });
  const ok = (result) => done (null, result);

  // Set up Bracery
  let bracery = null;

  // Create a getSymbol function that queries the database for the given name
  const getSymbol = (symbolName) =>
        new Promise ((resolve, reject) => {
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
  
  // Create an expandSymbol function that queries the database for the given name, and expands it as Bracery
  const expandSymbolFull = (symbolName) =>
        new Promise ((resolve, reject) =>
                     getSymbol (symbolName)
                     .then ((symbolDefinition) =>
                            bracery.expand (symbolDefinition,
                                            { callback: resolve })));

  const expandSymbol = (config) => expandSymbolFull (config).then ((expansion) => expansion.tree);
  
  const setSymbol = () => [];

  // Pass this expandSymbol into Bracery's initial config
  bracery = new Bracery (null, { expand: expandSymbol,
                                 get: getSymbol,
                                 set: setSymbol });

  // Call expandSymbol and return
  expandSymbolFull.then (ok);
};
