/* This is a small AWS lambda function for making permalinks.
 */

//console.log('Loading function');

const fs = require('fs');

const util = require('./bracery-util');
const config = require('./bracery-config');

const dynamoPromise = util.dynamoPromise();

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Set up some returns
  let session = await util.getSession (event, dynamoPromise);
  const respond = util.respond (callback, event, session);

  // Wrap all downstream calls (to dynamo etc) in try...catch
  try {
    // Get app state parameters
    const appState = util.getParams (event);
    const { name, initText, evalText, vars, expansion } = appState;

    // Permalink requested?
    const permalink = util.getBody(event).link;
    if (permalink) {
      // Make bookmark permalink and return
      const bookmark = await util.createBookmark (appState, session, dynamoPromise);
      respond.ok (bookmark);
    } else {
      // Update session with state and return
      await dynamoPromise('updateItem')
      ({ TableName: config.sessionTableName,
         Key: { cookie: session.cookie },
         UpdateExpression: 'SET #s = :s',
         ExpressionAttributeNames: {
           '#s': 'state',
         },
         ExpressionAttributeValues: {
           ':s': JSON.stringify (appState),
         } });
      respond.ok();
    }

  } catch (e) {
    console.warn (e);  // to CloudWatch
    respond.serverError (e);
  }
};
