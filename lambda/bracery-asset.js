/* This is a small AWS lambda function for wrapping static assets
   (probably a better way to deliver them in practice is via S3,
   this is just here for a Lambda solution).
*/

//console.log('Loading function');

// Static files should be uploaded as static files in the AWS Lambda zip
const staticFileDir = 'asset';

// String encoding for static files
const stringEncoding = 'utf8';

// The Lambda function
exports.handler = (event, context, callback) => {
  //console.log('Received event:', JSON.stringify(event, null, 2));

  // Get filename parameter
  const filename = event.pathParameters.filename;

  // Set up some returns
  const done = (err, res) => callback (null, {
    statusCode: err ? (err.statusCode || '404') : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Handle the request by serving up the file
  const staticFilePath = staticFileDir + '/' + filename;
  fs.readFile (staticFilePath, stringEncoding, done);
};
