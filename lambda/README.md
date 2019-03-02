# Bracery microsite

This directory contains four AWS Lambda functions for implementing the Bracery micro-wiki at https://bracery.org/

- [bracery-store.js](bracery-store.js) is a tiny RESTful microservice for storing & retrieving Bracery code in DynamoDB
- [bracery-expand.js](bracery-expand.js) pulls code from DynamoDB, expands it in AWS Lambda (possibly involving more calls to DynamoDB), and returns
- [bracery-view.js](bracery-view.js) presents a static page for storing/retrieving/editing/expanding a Bracery expression
- [bracery-asset.js](bracery-asset.js) serves up some of the static assets for the view
