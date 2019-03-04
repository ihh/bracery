/* This is a small AWS lambda function for presenting a page associated with a (named) Bracery symbol.
*/

//console.log('Loading function');

const fs = require('fs');
const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

const util = require('./bracery-util');
const config = require('./bracery-config');
const tableName = config.tableName;
const updateIndexName = config.updateIndexName;
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
const templateVarsVar = 'VARS';
const templateRecentVar = 'RECENT_SYMBOLS';

// The Lambda function
exports.handler = (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get the symbol name
  const name = (event && event.pathParameters && event.pathParameters.name) || defaultName;

  // Get initial vars as query parameters, if supplied
  const vars = util.getVars (event);

  // Add the name & a dummy empty definition to the template var->val map
  let tmpMap = util.extend ({}, templateVarValMap);
  tmpMap[templateNameVar] = name;
  tmpMap[templateDefVar] = '';
  tmpMap[templateRecentVar] = '[]';
  tmpMap[templateVarsVar] = JSON.stringify (vars);

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
  let symbolPromise = new Promise ((resolve, reject) => {
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
                         tmpMap[templateDefVar] = result.bracery;
                     }
                     resolve();
                   });
  });

  // Query the database for recently-updated symbols
  let newsPromise = new Promise ((resolve, reject) => {
    dynamo.query({ TableName: tableName,
                   IndexName: updateIndexName,
                   ScanIndexForward: false,
                   Limit: config.recentlyUpdatedLimit,
                   KeyConditionExpression: "#viskey = :visval",
                   ExpressionAttributeNames:{
                     "#viskey": "visibility"
                   },
                   ExpressionAttributeValues: {
                     ":visval": config.defaultVisibility
                   }}, (err, res) => {
                     if (!err && res.Items)
                       tmpMap[templateRecentVar] = JSON.stringify (res.Items.map ((item) => item.name));
                     resolve();
                   });
  });

  symbolPromise
    .then (() => newsPromise)
    .then (() => {
      // Read the file, do the %VAR%->val template substitutions, and return
      fs.readFile (templateHtmlFilename, templateHtmlFileEncoding, (err, templateHtml) => {
        if (err)
          done (err)
        else
          ok (Object.keys (tmpMap).reduce ((text, templateVar) => {
            const templateVal = tmpMap[templateVar];
            const escapedTemplateVal = util.sanitize (templateVal);
            return text
              .replace (new RegExp ('%' + templateVar + '%', 'g'), templateVal)
              .replace (new RegExp ('%ESCAPED_' + templateVar + '%', 'g'), escapedTemplateVal);
          }, templateHtml));
      });
    });

};
