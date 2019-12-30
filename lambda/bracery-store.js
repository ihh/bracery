/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const util = require('./bracery-util');
const config = require('./bracery-config');

const dynamoPromise = util.dynamoPromise();

// The Lambda function
exports.handler = async (event, context, callback) => {
  console.log('Received event:', JSON.stringify(event, null, 2));  // DEBUG
  
  // Get username (of symbol owner), symbol name, and body if we have it
  const path = event.pathParameters;
  let user, symbol;
  if (path && path.user) {
    if (path.symbol) {
      user = path.user;
      symbol = path.symbol;
    } else {
      user = util.defaultUserName;
      symbol = path.user;
    }
  } else {
    user = util.defaultUserName;
    symbol = util.defaultSymbolName;
  }
  const name = user + '/' + symbol;
  const body = util.getBody (event);
  const revision = event.httpMethod === 'GET' && event.queryStringParameters && event.queryStringParameters.rev;

  // Get session
  let session = await util.getSession (event, dynamoPromise);
  const loggedIn = session && session.loggedIn;
  const symIsOwned = loggedIn && session.user === user;
  const symOwnerIsGuest = user === util.defaultUserName;

  // Set up some returns
  const respond = util.respond (callback, event, session);
  const corsHeader = { 'Access-Control-Allow-Origin': '*' };

  // Query the database for the given name
  try {
    let res = await util.getBracery (name, revision, dynamoPromise);
    const result = res.Items && res.Items.length && res.Items[0];
    console.log(user,symbol,event.httpMethod,result); // DEBUG
    const symIsNew = !result;
    const symIsLocked = result && result.locked;
    const symIsHidden = result && result.hidden;
    // Handle the HTTP methods
    switch (event.httpMethod) {
    case 'DELETE':
      if (!symIsOwned)
        return respond.forbidden();
      if (result) {
	let item = { name,
                     bracery: ' ',  // DynamoDB doesn't like empty strings...
		     updated: Date.now(),
		     revision: result.revision,
		     locked: false };
        let deleteResult = await util.updateBracery (item, dynamoPromise);
        return respond.ok ({ revision: deleteResult.revision }, corsHeader);
      } else
        return respond.notFound();
      break;
    case 'GET':
      if (result && result.bracery && (symIsOwned || !symIsHidden)) {
        let ret = { bracery: result.bracery };
        if (symIsLocked)
          ret.locked = true;
        if (symIsHidden)
          ret.hidden = true;
        if (symIsOwned)
          ret.owned = true;
        respond.ok (ret, corsHeader);
      } else
        respond.notFound();
      break;
    case 'PUT':
      {
        if ((symIsLocked || symIsHidden || (symIsNew && !symOwnerIsGuest)) && !symIsOwned)
          return respond.forbidden();
	let item = { name,
		     user: util.userPartOfName (name),
		     symbol: util.symbolPartOfName (name),
                     bracery: body.bracery,
		     updated: Date.now(),
		     revision: result.revision };
        if (symIsOwned)
          util.extend (item,
                       { locked: !!body.locked,
                         hidden: !!body.hidden } );
        let putResult = await
	(result
         ? util.updateBracery (item, dynamoPromise)
         : util.createBracery (item, dynamoPromise));
        
        respond.ok ({ revision: putResult.revision }, corsHeader);
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
