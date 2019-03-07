/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
   It implements a super-simple RESTful-ish store, mapping (symbol) names to Bracery strings.
   Each name's definition is (optionally) protected by a password.
*/

//console.log('Loading function');

const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;
const revisionsTableName = config.revisionsTableName;

const BRACERY_SALT = process.env.BRACERY_SALT;  // must be defined from AWS Lambda

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

const crypto = require('crypto');
const iterations = 10;
const keylen = 64;
const digest = 'sha512';

// The Lambda function
exports.handler = (event, context, callback) => {
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
  const wrongPassword = () => done ({ statusCode: '401', message: "Incorrect password" });
  const serverError = (msg) => done ({ statusCode: '500', message: msg || "Server error" });
  const ok = (result) => done (null, result);

  // The callback function after querying the database for anything matching the given name
  const gotName = (err, res) => {
    if (err)
      return notFound();

    const result = res.Items && res.Items.length && res.Items[0];

    // The callback function after we've hashed the user-supplied password
    const gotPassword = (passwordHash) => {
      if (event.httpMethod !== 'GET' && result && result.password && result.password !== passwordHash)
        return wrongPassword();
        
      // Handle the HTTP methods
      switch (event.httpMethod) {
      case 'DELETE':
        if (result)
          dynamo.deleteItem ({ TableName: tableName,
                               Key: { name: name },
                             }, done);
        else
          return notFound();
        break;
      case 'GET':
        if (result && result.bracery)
          ok ({ bracery: result.bracery });
        else
          return notFound();
        break;
      case 'PUT':
        {
	  let item = { name: name,
                       bracery: body.bracery,
		       updated: Date.now() };
          if (passwordHash)
            item.password = passwordHash;
	  var putRevisionItem = function (err) {
	    if (err)
	      done (err);
	    else
	      dynamo.putItem ({ TableName: revisionsTableName,
				Item: item,
			      }, done);
	  };
          if (result) {
            let expr = "SET bracery = :b, updated = :t";
            let attrs = { ":b": item.bracery,
                          ":t": item.updated };
            if (passwordHash) {
              expr += ", password = :p";
              attrs[":p"] = item.password;
            }
            dynamo.updateItem ({ TableName: tableName,
                                 Key: { name: item.name },
                                 UpdateExpression: expr,
                                 ExpressionAttributeValues: attrs,
                               },
			       putRevisionItem);
          } else {
            item.visibility = config.defaultVisibility;
            item.created = item.updated;
            dynamo.putItem ({ TableName: tableName,
                              Item: item,
                            },
			    putRevisionItem);
          }
        }
        break;
      default:
        return badMethod();
      }
    };

    // Hash the user-supplied password
    if (!BRACERY_SALT)
      return serverError();

    if (body && body.password)
      crypto.pbkdf2 (body.password, BRACERY_SALT, iterations, keylen, digest, (err, derivedKey) => {
        if (err)
          return serverError();
        gotPassword (derivedKey.toString('hex'));
      });
    else
      gotPassword();
  };

  // Query the database for the given name
  dynamo.query({ TableName: tableName,
                 KeyConditionExpression: "#nkey = :nval",
                 ExpressionAttributeNames:{
                   "#nkey": "name"
                 },
                 ExpressionAttributeValues: {
                   ":nval": name
                 }}, gotName);
};
