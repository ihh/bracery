/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const promisify = require('util').promisify;
const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();
const dynamoPromise = (method) => promisify (dynamo[method].bind (dynamo));

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get symbol name, and body if we have it
  const name = event.pathParameters.name;
  const body = util.getBody (event);

  // Set up some returns
  const done = (err, res) => callback (null, {
    statusCode: err ? (err.statusCode || '400') : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const notFound = () => done ({ statusCode: '404', message: `Name not found "${name}"` });
  const badMethod = () => done ({ statusCode: '405', message: `Unsupported method "${event.httpMethod}"` });
  const serverError = (msg) => done ({ statusCode: '500', message: msg || "Server error" });
  const ok = (result) => done (null, result);

  // Query the database for the given name
  try {
    let res = await dynamoPromise('query')
    ({ TableName: tableName,
       KeyConditionExpression: "#n = :n",
       ExpressionAttributeNames:{
         "#n": "name"
       },
       ExpressionAttributeValues: {
         ":n": name
       }});
    const result = res.Items && res.Items.length && res.Items[0];
    // Handle the HTTP methods
    switch (event.httpMethod) {
    case 'DELETE':
      if (result) {
        await dynamoPromise('deleteItem')
        ({ TableName: tableName,
           Key: { name: name },
         });
        done();
      } else
        notFound();
      break;
    case 'GET':
      if (result && result.bracery)
        ok ({ bracery: result.bracery });
      else
        notFound();
      break;
    case 'PUT':
      {
	let item = { name: name,
                     bracery: body.bracery,
		     updated: Date.now() };
        if (result) {
          let expr = "SET #b = :b, #u = :t";
          let keys = { "#b": "bracery",
                       "#u": "updated" };
          let attrs = { ":b": item.bracery,
                        ":t": item.updated };
          await dynamoPromise('updateItem')
          ({ TableName: tableName,
             Key: { name: item.name },
             UpdateExpression: expr,
             ExpressionAttributeNames: keys,
             ExpressionAttributeValues: attrs,
           });
        } else {
          item.visibility = config.defaultVisibility;
          item.created = item.updated;
          await dynamoPromise('putItem')
          ({ TableName: tableName,
             Item: item,
           });
        }
	await dynamoPromise('putItem')
        ({ TableName: config.revisionsTableName,
	   Item: item,
	 });
        done();
      }
      break;
    default:
      badMethod();
    }
  } catch (e) {
    serverError (e);
  }
};
