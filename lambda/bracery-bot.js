/* This is a small AWS lambda function for tweeting Bracery.
*/

//console.log('Loading function');

const config = require('./bracery-config');
const util = require('./bracery-util');

const DomParser = require('dom-parser');
let parser = new DomParser();

const Twit = require('twit');
const maxTweetLen = 280;

const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;  // must be defined from AWS Lambda
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;  // must be defined from AWS Lambda

const maxTweetsPerCall = 300;   // Twitter allows 300 tweets per 15-minute window
const callsPerDay = 1;  // On average we want each account to tweet once per day

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
    for (let i = 0, tweets = 0; i < screenNames.length && tweets < maxTweetsPerCall; ++i) {
      // Fisher-Yates shuffle
      const j = i + Math.floor (Math.random() * (screenNames.length - i));
      const items = byScreenName[screenNames[j]];
      screenNames[j] = screenNames[i];
      // This function is called many times per day, so tweet with a probability that (on average) yields one tweet per day
      if (Math.random() >= 1 / callsPerDay)
        continue;
      // Pick a random bracery word to expand
      const item = items[Math.floor (Math.random() * items.length)];
      vars = item.vars ? JSON.parse (item.vars) : {};
      let expansion = await braceryConfig.expandFull ({ symbolName: item.name });
      let html = util.expandMarkdown (expansion.text);
      let digest = util.digestHTML (html, parser, maxTweetLen);
      let twit = new Twit({
        consumer_key: TWITTER_CONSUMER_KEY,
        consumer_secret: TWITTER_CONSUMER_SECRET,
        access_token: item.accessToken,
        access_token_secret: item.accessTokenSecret
      });
      console.warn('Tweeting as @' + item.twitterScreenName + ': ' + digest);
      await twit.post('statuses/update', { status: digest });
      await dynamoPromise('update')
      ({ TableName: config.twitterTableName,
         Key: { user: item.user,
                requestToken: item.requestToken },
         FilterExpression: 'SET #v = :v',
         ExpressionAttributeNames: { '#v': 'vars' },
         ExpressionAttributeValues: { ':v': JSON.stringify (expansion.vars) },
       });
      ++tweets;
    }
  }

};
