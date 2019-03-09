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

  // Query the database for the given name
  try {
    // Set up some returns
    let session = await util.getSession (event, dynamoPromise);
    const respond = util.respond (callback, event, session);

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
    const resultLocked = (result && result.locked && (!session || !session.loggedIn || (result.owner !== session.sub)));
    // Handle the HTTP methods
    switch (event.httpMethod) {
    case 'DELETE':
      if (resultLocked)
        return respond.forbidden();
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
      if (result && result.bracery) {
        let ret = { bracery: result.bracery };
        if (result.locked) {
          ret.locked = true;
          ret.owned = (result.owner === session.sub);
        }
        respond.ok (ret);
      } else
        respond.notFound();
      break;
    case 'PUT':
      {
        if (resultLocked)
          return respond.forbidden();
	let item = { name: name,
                     bracery: body.bracery,
		     updated: Date.now() };
        if (session.loggedIn)
          util.extend (item,
                       { locked: body.locked,
                         owner: session.sub } );
        if (result) {
          let expr = "SET #b = :b, #u = :u";
          let keys = { "#b": "bracery",
                       "#u": "updated" };
          let attrs = { ":b": item.bracery,
                        ":u": item.updated };
          if (session.loggedIn) {
            expr = expr + ", #l = :l, #o = :o";
            util.extend (keys,
                         { "#l": "locked",
                           "#o": "owner" } );
            util.extend (attrs,
                         { ":l": item.locked,
                           ":o": item.owner });
          }
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
    console.warn (e);  // to CloudWatch
    respond.serverError (e);
  }
};
