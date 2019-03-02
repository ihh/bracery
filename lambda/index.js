/* This is a small AWS lambda function for storing/retrieving Bracery in DynamoDB.
*/

//console.log('Loiading function');

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();
const tableName = 'BraceryTable';

const crypto = require('crypto');
const salt = 'salt' + Math.random();
const iterations = 10;
const keylen = 64;
const digest = 'sha512';

exports.handler = (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  const done = (err, res) => callback(null, {
    statusCode: err ? (err.statusCode || '400') : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const name = event.pathParameters.name;
  const body = event.body || {};

  const notFound = () => done (new Error(`Name not found "${name}"`));
  const badMethod = () => done (new Error(`Unsupported method "${event.httpMethod}"`));
  const wrongPassword = () => done ({ statusCode: '401', message: "Incorrect password" });
  const serverError = () => done ({ statusCode: '500', message: "Server error" });

  const gotName = (err, res) => {
    if (err)
      return notFound();

    const result = res.Items && res.Items.length && res.Items[0];

    const gotPassword = (passwordHash) => {
      if (event.httpMethod !== 'GET' && result && (result.password ? (result.password !== passwordHash) : passwordHash))
        return wrongPassword();

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
          done (null, { bracery: result.bracery });
        else
          return notFound();
        break;
      case 'PUT':
        {
          if (result) {
            dynamo.updateItem ({ TableName: tableName,
                                 Key: { name: name },
                                 UpdateExpression: "SET bracery = :b",
                                 ExpressionAttributeValues: {
                                   ":b": body.bracery
                                 },
                               }, done);
          } else {
            let item = { name: name,
                         bracery: body.bracery };
            if (passwordHash)
              item.password = passwordHash;
            dynamo.putItem ({ TableName: tableName,
                              Item: item,
                            }, done);
          }
        }
        break;
      default:
        return badMethod();
      }
    };

    if (body && body.password)
      crypto.pbkdf2 (body.password, salt, iterations, keylen, digest, (err, derivedKey) => {
        if (err)
          return serverError();
        gotPassword (derivedKey.toString('hex'));
      })
    else
      gotPassword();
  };

  dynamo.query({ TableName: tableName,
                 KeyConditionExpression: "#nkey = :nval",
                 ExpressionAttributeNames:{
                   "#nkey": "name"
                 },
                 ExpressionAttributeValues: {
                   ":nval": name
                 }}, gotName);
};
