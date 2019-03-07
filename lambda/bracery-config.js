module.exports = {
  // Routes
  baseUrl: 'https://bracery.org',
  viewPrefix: '/',
  storePrefix: '/store/',
  assetPrefix: '/asset/',
  expandPrefix: '/expand/',
  twitterPrefix: '/twitter/login/',

  // Files
  templateHtmlFilename: 'index.html',
  viewAssetStub: 'bracery-view',
  
  // DynamoDB
  tableName: 'BraceryTable',
  updateIndexName: 'visibility-updated-index',
  defaultVisibility: 'public',
  recentlyUpdatedLimit: 5,

  revisionsTableName: 'BraceryRevisionsTable',
  twitterTableName: 'BraceryTwitterTable',
  
  // Encoding
  stringEncoding: 'utf-8',

  // Default page
  defaultSymbolName: 'welcome',
};
