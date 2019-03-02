/* This is a small AWS lambda function for presenting a page associated with a (named) Bracery symbol.
*/

//console.log('Loading function');

// The following template file should be uploaded with the AWS zip.
const templateHtmlFilename = "index.html";
const templateHtmlFileEncoding = "utf8";

// The static assets pointed to by these template substitutions
// should be uploaded in the Lambda zip of bracery-asset.js (or to S3, or wherever)
var storePrefix = '/bracery-store/';
var assetPrefix = '/bracery-asset/';
var viewAssetStub = 'bracery-view';
const templateVarValMap = { 'JAVASCRIPT_FILE': assetPrefix + viewAssetStub + '.js',
                            'STYLE_FILE': assetPrefix + viewAssetStub + '.css',
                            'STORE_PATH_PREFIX': storePrefix };
const templateNameVar = 'SYMBOL_NAME';

// The Lambda function
exports.handler = (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get the symbol name
  const name = event.pathParameters.name;

  // Set up some returns
  const done = (err, res) => callback (null, {
    statusCode: err ? (err.statusCode || '500') : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const ok = (result) => done (null, result);

  // Add the name to the template var->val map
  var tmpMap = {}
  Object.keys (templateVarValMap).forEach ((templateVar) => {
    tmpMap[templateVar] = templateVarValMap[templateVar]
  })
  tmpMap[templateNameVar] = name;
    
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
  
};
