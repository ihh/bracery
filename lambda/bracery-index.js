/* This is a small AWS lambda function for scraping newsapi.org to Bracery.
*/

// Bracery web
const config = require('./bracery-config');
const util = require('./bracery-util');

// DynamoDB
const dynamoPromise = util.dynamoPromise();
const dynamoBatchSize = 25;

// Bracery
global.nlp = require('./compromise.es6.min');  // hack/workaround so Bracery can see nlp. Not very satisfactory.
const ParseTree = require('./bracery').ParseTree;

// The Lambda function
exports.handler = async (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    let pagesContainingWord = {}, lastWord = null;
    do {
      let wordScanParams = { TableName: config.wordTableName };
      if (lastWord)
	wordScanParams.ExclusiveStartKey = lastWord;
      let wordScanResult = await dynamoPromise('scan') (wordScanParams);
      lastWord = wordScanResult.LastEvaluatedKey;
      wordScanResult.Items.forEach ((wordItem) => {
	pagesContainingWord[wordItem.name] = [];
      });
    } while (lastWord);

    let lastName = null;
    do {
      let defScanParams =
	  ({ TableName: config.tableName,
	     FilterExpression: '#v = :v',
	     ExpressionAttributeNames: { '#v': 'visibility' },
	     ExpressionAttributeValues: { ':v': 'public' },
	   });
      if (lastName)
	defScanParams.ExclusiveStartKey = lastName;
      let defScanResult = await dynamoPromise('scan') (defScanParams);
      lastName = defScanResult.LastEvaluatedKey;
      defScanResult.Items.forEach ((defItem) => {
	const words = util.getWords (defItem.bracery, ParseTree);
	const name = defItem.name;
	words.forEach ((word) => {
	  pagesContainingWord[word] = (pagesContainingWord[word] || []).concat ([name]);
	});
      });
    } while (lastName);

    let wordsLeft = null, backoffDelay = 1000, backoffMultiplier = 1.5;
    while ((wordsLeft = Object.keys(pagesContainingWord)).length) {
      const wordBatch = wordsLeft.slice (0, dynamoBatchSize);
      let deleteParams = { RequestItems: {} };
      deleteParams.RequestItems[config.wordTableName] = wordBatch
	.map ((word) => ({
	  DeleteRequest: { Key: word }
	}));
      let deleteResult = await dynamoPromise('batchWriteItem') (deleteParams);
      let failed = {};
      if (deleteResult.UnprocessedItems)
	deleteResult.UnprocessedItems.forEach ((item) => { failed[item.name] = true; });
      let putParams = { RequestItems: {} };
      deleteParams.RequestItems[config.wordTableName] = wordBatch
	.filter ((word) => !failed[word])
	.map ((word) => ({
	  PutRequest: { Item: { word: word,
				symbols: pagesContainingWord[word] } }
	}));
      let putResult = await dynamoPromise('batchWriteItem') (putParams);
      if (putResult.UnprocessedItems)
	putResult.UnprocessedItems.forEach ((item) => { failed[item.name] = true; });
      wordBatch
	.filter ((word) => !failed[word])
	.forEach ((word) => delete pagesContainingWord[word]);
      if (Object.keys(failed).length)
	await util.promiseDelay (backoffDelay *= backoffMultiplier);
    }
    
  } catch (e) {
    console.error (e);
    throw e;
  }
};
