/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;
const revisionsTableName = config.revisionsTableName;

const dynamoPromise = util.dynamoPromise();

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get symbol name, and body if we have it
  const name = event.pathParameters.name;
  const body = util.getBody (event);
  const revision = event.httpMethod === 'GET' && event.queryStringParameters && event.queryStringParameters.rev;
  
  // Set up some returns
  let session = await util.getSession (event, dynamoPromise);
  const respond = util.respond (callback, event, session);

  // Query the database for the given name
  try {
    let res = await util.getBracery (name, revision, dynamoPromise);
    const result = res.Items && res.Items.length && res.Items[0];
    const resultLocked = (result && result.locked && (!session || !session.loggedIn || (result.owner !== session.user)));
    // Handle the HTTP methods
    switch (event.httpMethod) {
    case 'DELETE':
      if (resultLocked)
        return respond.forbidden();
      if (result) {
	let item = { name: name,
                     bracery: ' ',  // DynamoDB doesn't like empty strings...
		     updated: Date.now(),
		     revision: result.revision,
		     locked: false };
        let deleteResult = await util.updateBracery (item, dynamoPromise);
        return respond.ok ({ revision: deleteResult.revision });
      } else
        return respond.notFound();
      break;
    case 'GET':
      if (result && result.bracery) {
        let ret = { bracery: result.bracery };
        if (result.locked) {
          ret.locked = true;
          ret.owned = (result.owner === session.user);
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
		     updated: Date.now(),
		     revision: result.revision };
        if (session.loggedIn)
          util.extend (item,
                       { locked: body.locked,
                         owner: session.user } );
        let putResult = await
	(result
         ? util.updateBracery (item, dynamoPromise)
         : util.createBracery (item, dynamoPromise));

        await util.clearSession (session, dynamoPromise);
        
        respond.ok ({ revision: putResult.revision });
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
