# Bracery microsite

This directory contains several AWS Lambda functions for implementing the Bracery micro-wiki at https://bracery.org/

- [bracery-store.js](bracery-store.js) is a tiny RESTful microservice for storing & retrieving Bracery code in DynamoDB
- [bracery-expand.js](bracery-expand.js) pulls code from DynamoDB, expands it in AWS Lambda (possibly involving more calls to DynamoDB), and returns
- [bracery-view.js](bracery-view.js) presents a static page for storing/retrieving/editing/expanding a Bracery expression
- [bracery-asset.js](bracery-asset.js) serves up some of the static assets for the view
- [bracery-login.js](bracery-login.js) redirects to/from Amazon Cognito for login & logout, handles session
- [bracery-twitter.js](bracery-twitter.js) redirects to/from Twitter for 3-legged OAuth
- [bracery-bot.js](bracery-bot.js) triggered by a CloudWatch alarm; posts Bracery-generated tweets
