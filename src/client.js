var https = require('https')
var Bracery = require('./bracery')
var extend = Bracery.ParseTree.extend

// async https.request
async function httpsRequest (opts, formData) {
  return new Promise
  ((resolve, reject) => {
    let req = https.request (opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
	resolve ([res, data]);
      });
    });
    if (formData)
      req.write (formData);
    req.end();
  });
}

var BraceryClient = function (config) {
  config = config || {}
  Bracery.Bracery.call (this, null, config)
  this.serverDomain = config.serverDomain || 'bracery.org'
  this.getUrlPrefix = config.getUrlPrefix || '/store/'
  this.expandUrlPrefix = config.expandUrlPrefix || '/expand/'
  this.symbolDefinitionCache = {}
  this.cacheSymbolDefinitions = !!config.cacheSymbolDefinitions
  return this
}

Object.setPrototypeOf (BraceryClient.prototype, Bracery.Bracery.prototype)

BraceryClient.prototype._getBracery = function (config) {
  var symbolName = config.symbolName || config.node.name
  var cached
  if (this.cacheSymbolDefinitions && (cached = this.symbolDefinitionCache[symbolName]))
    return Promise.resolve (cached)
  var opts = {
    hostname: this.serverDomain,
    port: 443,
    path: this.getUrlPrefix + symbolName,
    method: 'GET',
  };
  return httpsRequest (opts)
    .then (function (res_data) {
      var [res, data] = res_data
      if (res.statusCode == 200) {
        var result = JSON.parse (data)
        return [result.bracery]
      } else
        return ''
    })
}

BraceryClient.prototype._expandBracery = function (config) {
  var symbolName = config.symbolName || config.node.name
  if (this.cacheSymbolDefinitions && this.symbolDefinitionCache[symbolName]) {
    var def = symbolDefinitionCache[symbolName]
    return Promise.resolve(def).then (function() { callback (def); return def })
  }
  var opts = {
    hostname: this.serverDomain,
    port: 443,
    path: this.expandUrlPrefix + symbolName
      + (config.vars ? ("?vars=" + encodeURIComponent (JSON.stringify (config.vars))) : ''),
    method: 'GET',
  };
  return httpsRequest (opts)
    .then (function (res_data) {
      var [res, data] = res_data
      if (res.statusCode == 200) {
        var expansion = JSON.parse (data)
        return [expansion.text]
      } else
        return []
    })
}

BraceryClient.prototype.makeConfig = function (config) {
  return extend ({ callback: config.callback || true,
                   expand: this._expandBracery.bind (this),
                   get: this._getBracery.bind (this),
                   set: function() { return [] } },
                 config)
}

BraceryClient.prototype.getDefaultSymbol = function() { return 'welcome' }

module.exports = extend ({}, Bracery, { BraceryClient })

