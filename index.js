var Promise = require('bluebird')
var nlp = require('compromise')

var RhsParser = require('./grammar/rhs')
var ParseTree = require('./parsetree')
var extend = ParseTree.extend

var Bracery = function (rules, config) {
  extend (this,
          { rules: {} },
          config || {})
  if (rules)
    this.addRules (rules)
  return this
}

Bracery.prototype.defaultSymbol = ['origin', 'sentence']
Bracery.prototype.rng = Math.random

Bracery.prototype.symbolNames = function() {
  return Object.keys(this.rules).sort()
}

Bracery.prototype.toJSON = function() {
  var bracery = this
  var result = {}
  var names = (arguments.length
               ? Array.prototype.slice.call (arguments, 0)
               : bracery.symbolNames())
  names.forEach (function (name) {
    result[name] = bracery.rules[name].map (function (rhs) {
      return ParseTree.makeRhsText (rhs)
    })
  })
  return result
}

Bracery.prototype.addRules = function (name, rules) {
  var bracery = this
  // convert addRules({name1:[rhs1a,rhs1b,...],name2:[rhs2a,rhs2b...],...}) to a series of addRules(name,[rhsText,...]) calls
  // this handles Tracery-style JSON
  if (arguments.length === 1 && typeof(arguments[0]) === 'object') {
    var name_rules_map = arguments[0]
    return Object.keys(name_rules_map).reduce (function (all, name) {
      return extend (all, bracery.addRules (name, name_rules_map[name]))
    }, {})
  }
  // convert addRules(name,rhs1,rhs2...) to addRules(name,[rhs1,rhs2...])
  if (arguments.length !== 2 || typeof(rules) === 'string')
    rules = Array.prototype.splice.call (arguments, 1)
  // check types
  name = validateSymbolName (name)
  if (!ParseTree.isArray(rules))
    throw new Error ('rules must be an array')
  if (rules.filter (function (rule) { return typeof(rule) !== 'string' }).length)
    throw new Error ('rules array must contain strings')
  // execute
  this.rules[name] = (this.rules[name] || []).concat (rules.map (ParseTree.parseRhs))
  return { name: this.rules[name] }
}

Bracery.prototype.getRules = function (name) {
  return this.rules[name] || []
}

Bracery.prototype.deleteRules = function (name) {
  name = validateSymbolName (name)
  delete this.rules[name]
}

Bracery.prototype.addRule = Bracery.prototype.addRules
Bracery.prototype.deleteRule = Bracery.prototype.deleteRules

Bracery.prototype._expandSymbol = function (config) {
  var symbolName = config.name.toLowerCase()
  var rhs
  var rules = this.rules[symbolName]
  if (rules)
    rhs = ParseTree.sampleParseTree (ParseTree.randomElement (rules, this.rng))
  else
    rhs = []
  return rhs
}

Bracery.prototype._expandRhs = function (config) {
  var newConfig = extend ({}, config, { expand: this._expandSymbol.bind (this) })
  if (newConfig.callback)
    return ParseTree.makeRhsExpansionPromise (newConfig).then (newConfig.callback)
  return ParseTree.makeRhsExpansionSync (newConfig)
}

function validateSymbolName (name) {
  if (typeof(name) !== 'string')
    throw new Error ('name must be a string')
  if (!name.match(/^[A-Za-z_][A-Za-z0-9_]*$/))
    throw new Error ('name must be a valid variable name (alphanumeric/underscore, first char non-numeric)')
  return name.toLowerCase()
}

Bracery.prototype.getDefaultSymbol = function() {
  var bracery = this
  if (typeof(bracery.defaultSymbol) === 'string')
    return bracery.defaultSymbol
  for (var n = 0; n < bracery.defaultSymbol.length; ++n) {
    var name = bracery.defaultSymbol[n]
    if (bracery.rules[name])
      return name
  }
  return bracery.symbolNames()[0]
}

Bracery.prototype.expand = function (braceryText, config) {
  braceryText = braceryText || ('$' + this.getDefaultSymbol())
  if (typeof(braceryText) !== 'string')
    throw new Error ('the text to be expanded must be a string')
  return this._expandRhs (extend ({}, config, { rhsText: braceryText }))
}

Bracery.prototype.expandSymbol = function (symbolName, config) {
  symbolName = symbolName || this.getDefaultSymbol()
  symbolName = validateSymbolName (symbolName)
  return this._expandRhs (extend ({}, config, { rhs: [{ name: symbolName }] }))
}

Bracery.prototype.parse = function (text) {
  return ParseTree.makeRoot (ParseTree.parseRhs (text))
}

Bracery.prototype.unparse = function (root) {
  return ParseTree.makeRhsText ([root])
}

Bracery.prototype.normalize = function (text) {
  return this.unparse (this.parse (text))
}

module.exports = { Bracery: Bracery,
                   ParseTree: ParseTree,
                   RhsParser: RhsParser,
                   Promise: Promise,
                   nlp: nlp }
