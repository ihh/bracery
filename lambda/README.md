# Bracery microsite

This directory contains several AWS Lambda functions for implementing the Bracery micro-wiki at https://bracery.org/

## AWS Lambda functions

- [bracery-store.js](bracery-store.js) is a tiny RESTful microservice for storing & retrieving Bracery code in DynamoDB
- [bracery-expand.js](bracery-expand.js) pulls code from DynamoDB, expands it in AWS Lambda (possibly involving more calls to DynamoDB), and returns
- [bracery-view.js](bracery-view.js) presents a single-page app for storing/retrieving/editing/expanding a Bracery expression. POSTing to this script creates a URL-shortened bookmark
- [bracery-asset.js](bracery-asset.js) serves up some of the static assets for the view
- [bracery-login.js](bracery-login.js) redirects to/from Amazon Cognito for login & logout, handles session
   - uses environment variables `COGNITO_APP_CLIENT_ID`, `COGNITO_APP_SECRET`, `COGNITO_USER_POOL_ID`
- [bracery-twitter.js](bracery-twitter.js) redirects to/from Twitter for 3-legged OAuth
   - uses environment variables `TWITTER_CONSUMER_KEY`, `TWITTER_CONSUMER_SECRET`
- [bracery-bot.js](bracery-bot.js) triggered by a CloudWatch alarm; posts Bracery-generated tweets
   - uses environment variables `TWITTER_CONSUMER_KEY`, `TWITTER_CONSUMER_SECRET`
- [bracery-news.js](bracery-news.js) triggered by a CloudWatch alarm; polls [NewsAPI.org](https://newsapi.org/) and writes to ~[news_story](https://bracery.org/news_story)
   - uses environment variable `NEWS_API_KEY`

## Other files

- [bracery-config.js](bracery-config.js) contains configuration parameters
- [bracery-util.js](bracery-util.js) contains utility functions used by the AWS Lambda functions
- [bracery-web.js](bracery-web.js) contains utility functions used by both AWS Lambda and the client
- [index.html](index.html) is a template HTML page for the single-page client app
- [asset/view.js](asset/view.js) contains JavaScript for the single-page client
- [asset/bracery-view.css](asset/bracery-view.css) contains CSS for the single-page client
- [Makefile](Makefile) bundles up zipfiles for AWS Lambda (type `make publish` to upload)
- [Makefile.keys](Makefile.keys) is the place for secrets
- [upload.js](upload.js) uploads corpora files of the form found in [../import](../import)


## API Gateway

The API Gateway is organized as follows

| Path | Method | Function |
| ---- | ------ | -------- |
| `/` | `GET` | [bracery-view.js](bracery-view.js) |
| `/` | `POST` | [bracery-view.js](bracery-view.js) |
| `/{name}` | `GET` | [bracery-view.js](bracery-view.js) |
| `/asset/{filename}` | `GET` | [bracery-asset.js](bracery-asset.js) |
| `/auth/login` | `GET` | [bracery-login.js](bracery-login.js) |
| `/auth/twitter` | `GET` | [bracery-twitter.js](bracery-twitter.js) |
| `/expand/{name}` | `GET` | [bracery-expand.js](bracery-expand.js) |
| `/store/{name}` | `ANY` | [bracery-store.js](bracery-store.js) |

## DynamoDB

The following tables are used

| Table | Primary key | Sort key | Index | Index primary | Index sort | Description |
| ----- | ----------- | -------- | ----- | ------------- | ---------- | ----------- |
| `BraceryTable` | `name` | n/a | `visibility-updated-index` | `visibility` | `updated` | Main symbol definition table, one entry per symbol |
| `BraceryRevisionsTable` | `name` | `updated` | n/a | n/a | n/a | Symbol revisions table, multiple entries per symbol, same attributes as `BraceryTable` |
| `BracerySessionTable` | `cookie` | n/a | n/a | n/a | n/a | Stores information about the session, e.g. whether user has logged on |
| `BraceryTwitterTable` | `user` | `requestToken` | n/a | n/a | n/a | Stores information about pending & granted Twitter authorization requests, and their associated user accounts & symbols |
| `BraceryBookmarkTable` | `id` | n/a | n/a | n/a | n/a | A table for saving application state (current source & expanded text) for URL-shortening purposes |


## Cognito

The Cognito user pool `BraceryUserPool` has the following properties

- Authorization code grant flow for client apps
- Custom domain `auth.bracery.org` (DNS handled by Route53, SSL cert by AWS Certificate Manager)
- Email required for all accounts & used as a username
- Allowed OAuth scopes: all (phone, email, openid, aws.cognito.signin.user.admin, profile)
- Login callback & logout signout URL are both https://bracery.org/auth/login/

## Twitter

- Callback URL is https://bracery.org/auth/twitter/
