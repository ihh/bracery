/* This is a small AWS lambda function for scraping newsapi.org to Bracery.
*/

// Bracery web
const config = require('./bracery-config');
const util = require('./bracery-util');

// newsapi.org
const NEWS_API_KEY = process.env.NEWS_API_KEY;  // must be defined from AWS Lambda
const NewsApiDomain = 'newsapi.org';
const NewsApiPathPrefix = '/v2/top-headlines?country=us&apiKey=';
const BracerySymbolName = 'news_story';

// DynamoDB
const dynamoPromise = util.dynamoPromise();

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    const newsOpts = {
      hostname: NewsApiDomain,
      port: 443,
      path: NewsApiPathPrefix + NEWS_API_KEY,
      method: 'GET'
    };
    let [newsRes, newsData] = await util.httpsRequest (newsOpts);
    if (newsRes.statusCode == 200) {
      const newsBody = JSON.parse (newsData);
      const newsBracery = '[' + newsBody.articles.map
      ((article) => {
        let desc = article.description;
        return util.escapeHTML
        (typeof(article.author) === 'string'
         ? (article.author
            .split(/ /)
            .reduce
            ((title, authorWord) =>
             (authorWord
              ? title.replace (new RegExp(authorWord,'g'), '')
              : title),
             desc))
         : desc);
      }).join('|') + ']';
      var item = { name: BracerySymbolName,
                   bracery: newsBracery,
                   locked: true };
      await util.updateBracery (item, dynamoPromise);
    }
  } catch (e) {
    console.error (e)
    throw e
  }
};
