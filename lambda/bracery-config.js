module.exports = {
  // API Gateway
  baseUrl: 'https://bracery.org',
  viewPrefix: '/',
  storePrefix: '/store/',
  assetPrefix: '/asset/',
  expandPrefix: '/expand/',
  loginPrefix: '/auth/login/',
  logoutPrefix: '/auth/logout/',
  twitterPrefix: '/auth/twitter/',
  
  // DynamoDB tables
  tableName: 'BraceryTable',
  bookmarkTableName: 'BraceryBookmarkTable',
  revisionsTableName: 'BraceryRevisionsTable',
  twitterTableName: 'BraceryTwitterTable',
  sessionTableName: 'BracerySessionTable',
  wordTableName: 'BraceryWordTable',

  // DynamoDB attributes & default values
  // BraceryTable
  updateIndexName: 'visibility-updated-index',
  defaultVisibility: 'public',
  recentlyUpdatedLimit: 5,
  // BracerySessionTable
  cookieName: 'bracery_session',

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
