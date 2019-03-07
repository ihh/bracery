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
  revisionsTableName: 'BraceryRevisionsTable',
  defaultVisibility: 'public',
  updateIndexName: 'visibility-updated-index',
  recentlyUpdatedLimit: 5,
  
  // Encoding
  stringEncoding: 'utf-8',

  // Default page
  defaultSymbolName: 'welcome',
};
