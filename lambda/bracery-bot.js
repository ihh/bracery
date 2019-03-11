/* This is a small AWS lambda function for tweeting Bracery.
*/

//console.log('Loading function');

const config = require('./bracery-config');
const util = require('./bracery-util');

const Twit = require('twit');

const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;  // must be defined from AWS Lambda
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;  // must be defined from AWS Lambda

const millisecsBetweenTweets = 15*60*1000 / 300;   // Twitter allows 300 tweets per 15-minute window

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

  if (scanResult) {
    // One tweet per screen name
    let byScreenName = {};
    scanResult.Items.forEach ((item) => {
      const sn = item.twitterScreenName;
      byScreenName[sn] = byScreenName[sn] || [];
      byScreenName[sn].push (item);
    });
    const screenNames = Object.keys (byScreenName);
    for (let i = 0; i < screenNames.length; ++i) {
      const items = byScreenName[screenNames[i]];
      const item = items[Math.floor (Math.random() * items.length)];
      let rateLimitPromise = util.promiseDelay (millisecsBetweenTweets);
      let twit = new Twit({
        consumer_key: TWITTER_CONSUMER_KEY,
        consumer_secret: TWITTER_CONSUMER_SECRET,
        access_token: item.accessToken,
        access_token_secret: item.accessTokenSecret
      });
      vars = item.vars ? JSON.parse (item.vars) : {};
      let expansion = await braceryConfig.expandFull ({ symbolName: item.name });
      let html = util.expandMarkdown (expansion.text);
      let digest = util.digestHTML (html);
      console.warn('Tweeting as @' + item.twitterScreenName + ': ' + digest);
      await twit.post('statuses/update', { status: expansion.text });
      await dynamoPromise('update')
      ({ TableName: config.twitterTableName,
         Key: { user: item.user,
                requestToken: item.requestToken },
         FilterExpression: 'SET #v = :v',
         ExpressionAttributeNames: { '#v': 'vars' },
         ExpressionAttributeValues: { ':v': JSON.stringify (expansion.vars) },
       });
      await rateLimitPromise;
    }
  }

};
