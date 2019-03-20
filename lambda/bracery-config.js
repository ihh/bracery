module.exports = {
  // API Gateway
  baseUrl: 'https://bracery.org',
  viewPrefix: '/',
  storePrefix: '/api/v1/store/',
  assetPrefix: '/api/v1/asset/',
  expandPrefix: '/api/v1/expand/',
  loginPrefix: '/api/v1/login/',
  logoutPrefix: '/api/v1/logout/',
  twitterPrefix: '/api/v1/twitter/',
  bookmarkPrefix: '/api/v1/bookmark/',
  
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
  sessionExpirationSeconds: 24*60*60,  // 1 day

  // AWS Cognito
  cognitoDomain: 'auth.bracery.org',
  
  // Filenames and virtual paths
  templateHtmlFilename: 'index.html',
  viewAssetStub: 'bracery-view',
  
  // Encoding
  stringEncoding: 'utf-8',
};
