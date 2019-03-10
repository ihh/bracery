/* This is a small AWS lambda function for tweeting Bracery.
*/

//console.log('Loading function');

const config = require('./bracery-config');
const util = require('./bracery-util');

const Twit = require('twit');

const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;  // must be defined from AWS Lambda
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;  // must be defined from AWS Lambda

const dynamoPromise = util.dynamoPromise();

global.nlp = require('./compromise.es6.min');  // hack/workaround so Bracery can see nlp. Not very satisfactory.
const Bracery = require('./bracery').Bracery;

let bracery = new Bracery();
let vars = {};
let braceryConfig = util.braceryExpandConfig (bracery, vars, dynamoPromise);

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  let scanResult = await dynamoPromise('scan')
  ({ TableName: config.twitterTableName,
     FilterExpression: '#g = :g',
     ExpressionAttributeNames: { '#g': 'granted' },
     ExpressionAttributeValues: { ':g': true },
   });

  if (scanResult)
    await Promise.all (scanResult.Items.map (async (item) => {
      let twit = new Twit({
        consumer_key: TWITTER_CONSUMER_KEY,
        consumer_secret: TWITTER_CONSUMER_SECRET,
        access_token: item.accessToken,
        access_token_secret: item.accessTokenSecret
      });
      vars = {};  // reset vars
      let expansion = await braceryConfig.expandFull ({ symbolName: item.name });
      console.warn('Tweeting as @' + item.twitterScreenName + ': ' + expansion.text);
      await twit.post('statuses/update', { status: expansion.text });
    }));

};
