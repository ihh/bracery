/* This is a small AWS lambda function for tweeting Bracery.
*/

//console.log('Loading function');

// Our desired call rate
const callsPerHour = 1;

// Markdown->HTML, HTML->text
const marked = require('marked');
const textversionjs = require('textversionjs');
const decodeHtmlEntities = require('html-entities').AllHtmlEntities.decode;
const html2plaintext = (html) => decodeHtmlEntities (textversionjs (html)).replace (/\n$/,'');

// Bracery web
const config = require('./bracery-config');
const util = require('./bracery-util');

// DynamoDB
const dynamoPromise = util.dynamoPromise();

// Bracery
global.nlp = require('./compromise.es6.min');  // hack/workaround so Bracery can see nlp. Not very satisfactory.
const Bracery = require('./bracery').Bracery;
const rita = require('./rita-tiny');

let bracery = new Bracery (null, { rita });

// Twitter
const Twit = require('twit');
const maxTweetLen = 280;

const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;  // must be defined from AWS Lambda
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;  // must be defined from AWS Lambda

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    // Scan the Twitter table for authorized bots; post to Twitter
    let scanResult = await dynamoPromise('scan')
    ({ TableName: config.twitterTableName,
       FilterExpression: '#g = :g',
       ExpressionAttributeNames: { '#g': 'granted' },
       ExpressionAttributeValues: { ':g': true },
     });

    if (scanResult) {
      // Limit tweets to one per Twitter screen name (i.e. per user, as best we can tell)
      let byScreenName = {};
      scanResult.Items.forEach ((item) => {
	const sn = item.twitterScreenName;
	byScreenName[sn] = byScreenName[sn] || [];
	byScreenName[sn].push (item);
      });
      const screenNames = Object.keys (byScreenName);
      for (let i = 0; i < screenNames.length; ++i) {
	// Fisher-Yates shuffle
	const j = i + Math.floor (Math.random() * (screenNames.length - i));
	const items = byScreenName[screenNames[j]];
	screenNames[j] = screenNames[i];
	// This function is called many times per hour, so tweet with a probability that (on average) yields one tweet per hour
	if (Math.random() >= 1 / callsPerHour)  // On average we want each account to tweet once per hour
          continue;
	// Pick a random bracery word to expand
	const item = items[Math.floor (Math.random() * items.length)];
	let vars = item.vars ? JSON.parse (item.vars) : {};
	let braceryConfig = util.braceryExpandConfig (bracery, vars, dynamoPromise);
	let expansion = await braceryConfig.expandFull ({ symbolName: item.name });
	let tweetVar = expansion.vars.tweet;   // If the $tweet variable is set, use that as the tweet
	delete expansion.vars.tweet;  // Make it easy on bot programmers; don't persist the $tweet variable
	let bookmarkVar = expansion.vars.bookmark;   // If the $bookmark variable is set, we want to bookmark
	let wantBookmark = tweetVar || bookmarkVar || !!util.bookmarkRegex.exec (expansion.text);  // if $tweet or $bookmark is set, or the text contains <bookmark>, then bookmark
	let html = util.expandMarkdown (expansion.text, marked);
	let text = html2plaintext (html);
	const createBookmark = () => util.createBookmark ({ name: item.name,
							    vars: vars,
							    expansion: { text: expansion.text,
									 vars: expansion.vars } },
							  null,
							  dynamoPromise)
	      .then ((bookmark) => bookmark.url);
	let digest = await util.digestText (tweetVar || text,
					    maxTweetLen, createBookmark, wantBookmark);
	let twit = new Twit({
          consumer_key: TWITTER_CONSUMER_KEY,
          consumer_secret: TWITTER_CONSUMER_SECRET,
          access_token: item.accessToken,
          access_token_secret: item.accessTokenSecret
	});
	console.warn('Tweeting as @' + item.twitterScreenName + ': ' + digest);
	try {
	  await twit.post('statuses/update', { status: digest });
	  await dynamoPromise('updateItem')
	  ({ TableName: config.twitterTableName,
             Key: { user: item.user,
                    requestToken: item.requestToken },
             UpdateExpression: 'SET #v = :v',
             ExpressionAttributeNames: { '#v': 'vars' },
             ExpressionAttributeValues: { ':v': JSON.stringify (expansion.vars) },
	   });
	} catch (e) {
	  // log error, move on to the next tweet
	  console.error (e);
	}
      }
    }
  } catch (e) {
    console.error (e);
    throw e;
  }
};
