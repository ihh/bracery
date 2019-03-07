module.exports = {
  // Routes
  baseUrl: 'https://bracery.org',
  storePrefix: '/store/',
  assetPrefix: '/asset/',
  expandPrefix: '/expand/',
  twitterPrefix: '/twitter/',
  viewPrefix: '/',

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
