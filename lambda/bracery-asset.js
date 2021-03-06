/* This is a small AWS lambda function for wrapping static assets
   (probably a better way to deliver them in practice is via S3,
   this is just here for a Lambda solution).
*/

//console.log('Loading function');

const fs = require('fs');

const config = require('./bracery-config');
const stringEncoding = config.stringEncoding;

// Static files should be uploaded as static files in the AWS Lambda zip
const staticFileDir = 'asset';

// MIME types by filename suffix
const suffixMimeType = { '.js': 'application/javascript',
                         '.css': 'text/css' };

// The Lambda function
exports.handler = (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get filename parameter
  const filename = event.pathParameters.filename;

  // MIME type
  let mimeType = 'text/plain';
  const suffixRegex = new RegExp ('(\.[^\.]+)$');
  const match = suffixRegex.exec (filename);
  if (match)
    mimeType = suffixMimeType[match[1]];

  // Response headers
  let headers = {
    'Content-Type': mimeType + '; charset=' + stringEncoding
  };
  
  // Set up response callback
  const done = (err, res) => callback (null, {
    statusCode: err ? (err.statusCode || '404') : '200',
    body: err ? `File "${filename}" not found`  : res,
    headers: headers
  });

  // Handle the request by serving up the file
  let filePath = staticFileDir + '/' + filename;
  fs.readFile (filePath, stringEncoding, done);
};
