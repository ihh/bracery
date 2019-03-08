/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;

const dynamoPromise = util.dynamoPromise();

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get symbol name, and body if we have it
  const name = event.pathParameters.name;
  const body = util.getBody (event);

  // Set up some returns
  const respond = util.respond (callback, event);

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
        respond.done();
      } else
        respond.notFound();
      break;
    case 'GET':
      if (result && result.bracery)
        respond.ok ({ bracery: result.bracery });
      else
        respond.notFound();
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
        respond.ok();
      }
      break;
    default:
      respond.badMethod();
    }
  } catch (e) {
    console.warn (e);
    respond.serverError (e);
  }
};
