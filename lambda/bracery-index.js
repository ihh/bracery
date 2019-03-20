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
    let currentSymbolList = Object.create(null);  // avoid giving this a 'constructor' property
    let oldSymbolStr = Object.create(null);
    let lastWord = null;
    do {
      let wordScanParams = { TableName: config.wordTableName };
      if (lastWord)
	wordScanParams.ExclusiveStartKey = lastWord;
      let wordScanResult = await dynamoPromise('scan') (wordScanParams);
      lastWord = wordScanResult.LastEvaluatedKey;
      wordScanResult.Items.forEach ((wordItem) => {
	if (wordItem.word) {
	  oldSymbolStr[wordItem.word] = wordItem.symbols;
	  currentSymbolList[wordItem.word] = [];
	}
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
	  if (word)
	    currentSymbolList[word] = (currentSymbolList[word] || []).concat ([name]);
	});
      });
    } while (lastName);

    let currentSymbolStr = Object.create(null);
    let unchanged = 0;
    Object.keys(currentSymbolList).forEach ((word) => {
      const syms = currentSymbolList[word].sort().join(' ');
      if (syms !== oldSymbolStr[word])
	currentSymbolStr[word] = syms;
      else
	++unchanged;
    });
    Object.keys(oldSymbolStr).forEach ((word) => {
      if (!currentSymbolList[word])
	currentSymbolStr[word] = null;
    });
    console.warn (unchanged + ' entries in the word table are unchanged; ' + Object.keys(currentSymbolStr).length + ' are in need of update');
     
    let wordsLeft = null, backoffDelay = 100, backoffMultiplier = 1.5;
    let nBatch = 0;
    while ((wordsLeft = Object.keys(currentSymbolStr)).length) {
      ++nBatch;
      const wordBatch = wordsLeft.slice (0, dynamoBatchSize);
      console.warn('Processing batch #' + nBatch + ' (' + wordsLeft.length + ' remaining): ' + wordBatch.join(', '));
      let deleteParams = { RequestItems: {} };
      deleteParams.RequestItems[config.wordTableName] = wordBatch
	.filter ((word) => oldSymbolStr[word])
	.map ((word) => ({
	  DeleteRequest: { Key: { word: word } }
	}));
      let failed = Object.create (null);
      if (deleteParams.RequestItems[config.wordTableName].length) {
	let deleteResult = await dynamoPromise('batchWriteItem') (deleteParams);
	if (deleteResult.UnprocessedItems && deleteResult.UnprocessedItems[config.wordTableName])
	  deleteResult.UnprocessedItems[config.wordTableName].forEach ((item) => { failed[item.name] = true; });
      }
      let putParams = { RequestItems: {} };
      putParams.RequestItems[config.wordTableName] = wordBatch
	.filter ((word) => currentSymbolStr[word])
	.filter ((word) => !failed[word])
	.map ((word) => ({
	  PutRequest: { Item: { word: word,
				symbols: currentSymbolStr[word] } }
	}));
      if (putParams.RequestItems[config.wordTableName].length) {
	let putResult = await dynamoPromise('batchWriteItem') (putParams);
	if (putResult.UnprocessedItems && putResult.UnprocessedItems[config.wordTableName])
	  putResult.UnprocessedItems[config.wordTableName].forEach ((item) => { failed[item.name] = true; });
      }
      wordBatch
	.filter ((word) => !failed[word])
	.forEach ((word) => delete currentSymbolStr[word]);
      if (Object.keys(failed).length)
	await util.promiseDelay (backoffDelay *= backoffMultiplier);
    }
    
  } catch (e) {
    console.error (e);
    throw e;
  }
};
