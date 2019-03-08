module.exports = {
  // API Gateway
  baseUrl: 'https://bracery.org',
  viewPrefix: '/',
  storePrefix: '/store/',
  assetPrefix: '/asset/',
  expandPrefix: '/expand/',
  twitterPrefix: '/auth/twitter/',
  
  // DynamoDB
  tableName: 'BraceryTable',
  updateIndexName: 'visibility-updated-index',
  defaultVisibility: 'public',
  recentlyUpdatedLimit: 5,

  revisionsTableName: 'BraceryRevisionsTable',
  twitterTableName: 'BraceryTwitterTable',
  sessionTableName: 'BracerySessionTable',

  // AWS Cognito
  cognitoDomain: 'auth.bracery.org',

  // Filenames and virtual paths
  templateHtmlFilename: 'index.html',
  viewAssetStub: 'bracery-view',
  
  // Encoding
  stringEncoding: 'utf-8',

  // Default page
  defaultSymbolName: 'welcome',
};
