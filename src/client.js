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
  this.getUrlPrefix = config.getUrlPrefix || '/api/v1/store/'
  this.expandUrlPrefix = config.expandUrlPrefix || '/api/v1/expand/'
  this.symbolDefinitionCache = {}
  this.cacheSymbolDefinitions = !config.neverCacheSymbolDefinitions
  this.expandRemotely = !!config.expandRemotely
  return this
}

Object.setPrototypeOf (BraceryClient.prototype, Bracery.Bracery.prototype)

BraceryClient.prototype._getBracery = function (config) {
  var bc = this
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
      var ret = ['']
      if (res.statusCode == 200) {
        var result = JSON.parse (data), text = result.bracery
        ret = [text]
      }
      if (res.statusCode == 200 || res.statusCode == 404)
	if (bc.cacheSymbolDefinitions)
	  bc.symbolDefinitionCache[symbolName] = ret
      return ret
    }).catch (function() {
      return ['']
    })
}

BraceryClient.prototype._expandBracery = function (config) {
  var symbolName = config.symbolName || config.node.name
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
  var newConfig = extend ({ callback: config.callback || true,
			    expand: null,
			    get: this._getBracery.bind (this),
			    set: function() { return [] } },
			  config)
  if (this.expandRemotely)
    newConfig.expand = this._expandBracery.bind (this)
  return newConfig
}

BraceryClient.prototype.getDefaultSymbol = function() { return 'welcome' }

module.exports = extend ({}, Bracery, { BraceryClient })

