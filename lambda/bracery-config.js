module.exports = {
  // Routes
  baseUrl: 'https://bracery.org',
  storePrefix: '/store/',
  assetPrefix: '/asset/',
  expandPrefix: '/expand/',
  viewPrefix: '/',

  // Files
  templateHtmlFilename: 'index.html',
  viewAssetStub: 'bracery-view',
  
  // DynamoDB
  tableName: 'BraceryTable',

  // Encoding
  stringEncoding: 'utf-8',

  // Default page
  defaultSymbolName: 'welcome',
};
