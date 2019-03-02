/* This is a small AWS lambda function for presenting a page associated with a (named) Bracery symbol.
*/

//console.log('Loading function');

const fs = require('fs');
const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

const config = require('./bracery-config');
const tableName = config.tableName;
const defaultName = config.defaultSymbolName;

// The template file should be uploaded with the AWS lambda zip archive for this function.
const templateHtmlFilename = config.templateHtmlFilename;
const templateHtmlFileEncoding = config.stringEncoding;

const baseUrl = config.baseUrl;
const storePrefix = config.storePrefix;
const assetPrefix = config.assetPrefix;
const expandPrefix = config.expandPrefix;
const viewAssetStub = config.viewAssetStub;
const viewPrefix = config.viewPrefix;

// The static assets pointed to by these template substitutions
// should be uploaded in the Lambda zip of bracery-asset.js (or to S3, or wherever)
const templateVarValMap = { 'JAVASCRIPT_FILE': assetPrefix + viewAssetStub + '.js',
                            'STYLE_FILE': assetPrefix + viewAssetStub + '.css',
                            'BASE_URL': baseUrl,
                            'STORE_PATH_PREFIX': storePrefix,
                            'VIEW_PATH_PREFIX': viewPrefix,
                            'EXPAND_PATH_PREFIX': expandPrefix };
const templateNameVar = 'SYMBOL_NAME';
const templateDefVar = 'SYMBOL_DEFINITION';

// The Lambda function
exports.handler = (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get the symbol name
  const name = (event && event.pathParameters && event.pathParameters.name) || defaultName;

  // Set up some returns
  const done = (err, res) => callback (null, {
    statusCode: err ? (err.statusCode || '500') : '200',
    body: err ? err.message : res,
    headers: {
      'Content-Type': 'text/html; charset=' + templateHtmlFileEncoding,
    },
  });

  const ok = (result) => done (null, result);

  // Query the database for the given symbol definition
  var symbolPromise = new Promise ((resolve, reject) => {
    dynamo.query({ TableName: tableName,
                   KeyConditionExpression: "#nkey = :nval",
                   ExpressionAttributeNames:{
                     "#nkey": "name"
                   },
                   ExpressionAttributeValues: {
                     ":nval": name.toLowerCase()
                   }}, (err, res) => {
                     if (!err) {
                       const result = res.Items && res.Items.length && res.Items[0];
                       if (result && result.bracery)
                         resolve (result.bracery);
                     }
                     resolve ('');
                   });
  });

  symbolPromise.then ((def) => {
    // Add the name & definition to the template var->val map
    var tmpMap = {}
    Object.keys (templateVarValMap).forEach ((templateVar) => {
      tmpMap[templateVar] = templateVarValMap[templateVar]
    })
    tmpMap[templateNameVar] = name;
    tmpMap[templateDefVar] = def;
    
    // Read the file, do the %VAR%->val template substitutions, and return
    fs.readFile (templateHtmlFilename, templateHtmlFileEncoding, (err, templateHtml) => {
      if (err)
        done (err)
      else
        ok (Object.keys (tmpMap).reduce ((text, templateVar) => {
          var templateVal = tmpMap[templateVar];
          return text.replace (new RegExp ('%' + templateVar + '%', 'g'), templateVal);
        }, templateHtml));
    });
  });

};
