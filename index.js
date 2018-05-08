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

Bracery.prototype.maxExpandCalls = 5  // max number of &eval{} calls per expansion
Bracery.prototype.maxRecursionDepth = 3  // max number of recursive expansions of the same symbol
Bracery.prototype.defaultSymbol = ['origin', 'sentence']
Bracery.prototype.rng = Math.random

Bracery.prototype.toJSON = function() {
  var bracery = this
  var result = {}
  var names = (arguments.length
               ? Array.prototype.slice.call (arguments, 0)
               : Object.keys(this.rules).sort())
  names.forEach (function (name) {
    result[name] = bracery.rules[name].map (function (rhs) {
      return ParseTree.makeRhsText (rhs, makeSymbolName)
    })
  })
  return result
}

function parseRhs (rhsText) {
  var result
  try {
    result = RhsParser.parse (rhsText)
  } catch (e) {
    console.warn(e)
    result = [rhsText]
  }
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
  this.rules[name] = (this.rules[name] || []).concat (rules.map (parseRhs))
  return { name: this.rules[name] }
}

Bracery.prototype.deleteRules = function (name) {
  name = validateSymbolName (name)
  delete this.rules[name]
}

Bracery.prototype.addRule = Bracery.prototype.addRules
Bracery.prototype.deleteRule = Bracery.prototype.deleteRules

Bracery.prototype._expandSymbol = function (config) {
  var bracery = this
  var symbolName = config.name.toLowerCase()
  var depth = config.depth || {}
  var symbolDepth = depth[symbolName] || 0
  var expansion
  var rules = this.rules[symbolName]
  if (rules) {
    var rhs = ParseTree.randomElement (rules, this.rng)
    var newDepth = extend ({}, depth)
    newDepth[symbolName] = symbolDepth + 1
    expansion = bracery._expandRhs (extend ({}, config, { rhs: rhs, depth: newDepth }))
  }
  return expansion
}

Bracery.prototype._expandRhs = function (config) {
  var sampledTree = ParseTree.sampleParseTree (config.rhs)
  this._expandAllSymbols (extend ({}, config, { rhs: sampledTree }))
  return sampledTree
}

Bracery.prototype._expandAllSymbols = function (config) {
  var bracery = this
  unexpandedSymbols (config.rhs).forEach (function (node) {
    var nextConfig = extend ({}, config, { name: node.name })
    if (!atRecursionLimit (bracery, nextConfig)) {
      var expansion = bracery._expandSymbol (nextConfig)
      if (expansion)
        node.rhs = expansion
      else {
        node.rhs = []
        node.not_found = true
      }
    } else {
      node.rhs = []
      node.maxRecursionDepth = true
    }
  })
}

function atRecursionLimit (bracery, config) {
  var symbolName = config.name
  var depth = config.depth || {}
  var symbolDepth = depth[symbolName] || 0
  var maxRecursionDepth = config.maxRecursionDepth || bracery.maxRecursionDepth
  return symbolDepth >= maxRecursionDepth
}

function validateSymbolName (name) {
  if (typeof(name) !== 'string')
    throw new Error ('name must be a string')
  if (!name.match(/^[A-Za-z_][A-Za-z0-9_]*$/))
    throw new Error ('name must be a valid variable name (alphanumeric/underscore, first char non-numeric)')
  return name.toLowerCase()
}

function unexpandedSymbols (rhs) {
  return ParseTree.getSymbolNodes (rhs)
    .filter (function (node) { return !node.rhs })
}

function throwCallback (info) {
  info.inThrowCallback = true  // hack hack hack
  throw info
  return null
}

function makeSymbolName (node) {
  return node.name
}

function hasIncompleteExpansions (rhs) {
  return unexpandedSymbols (rhs).length > 0
}

function hasIncompleteEvaluations (rhs) {
  return nextEvalOrExpansion ({ rhs: rhs }).eval ? true : false
}

function nextEvalOrExpansion (config) {
  var rhs = config.rhs
  var initNode = { type: 'root', rhs: rhs }
  var expansion
  try {
    expansion = ParseTree.makeExpansionText ({ node: initNode,
                                               vars: {},
                                               expandCallback: throwCallback,
                                               makeSymbolName: makeSymbolName })
  } catch (e) {
    if (!e.inThrowCallback) {  // disgusting hack
      console.error (e)
      throw e
    }
    return { eval: e }
  }
  return { expansion: expansion }
}

function defaultSymbol (bracery) {
  if (typeof(bracery.defaultSymbol) === 'string')
    return bracery.defaultSymbol
  for (var n = 0; n < bracery.defaultSymbol.length; ++n) {
    var name = bracery.defaultSymbol[n]
    if (bracery.rules[name])
      return name
  }
  return Object.keys(bracery.rules).sort()[0]
}

Bracery.prototype._doAllEvaluations = function (config) {
  var bracery = this
  var rhs = config.rhs
  var initNode = { type: 'root', rhs: rhs }
  var expansion
  var expandCalls = 0
  var maxExpandCalls = config.maxExpandCalls || bracery.maxExpandCalls
  while (typeof(expansion) === 'undefined') {
    var next = nextEvalOrExpansion (config)
    if (next.eval) {
      var e = next.eval
      var expandNode = e.node, expandText = e.text
      if (expandCalls < maxExpandCalls) {
        var parsedExpandText = parseRhs (expandText)
        expandNode.evaltext = parsedExpandText
        expandNode.value = bracery._expandRhs (extend ({}, config, { rhs: parsedExpandText }))
        ++expandCalls
      } else {
        expandNode.evalText = []
        expandNode.value = []
        expandNode.maxExpandCalls = true
      }
    } else
      expansion = next.expansion  // may be falsy
  }
}

Bracery.prototype._expandAndEvaluate = function (config) {
  var expansion = config.expansion
  while (hasIncompleteExpansions (expansion) || hasIncompleteEvaluations (expansion)) {
    this._expandAllSymbols (extend ({}, config, { rhs: expansion }))
    this._doAllEvaluations (extend ({}, config, { rhs: expansion }))
  }
  var text = ParseTree.makeRhsExpansionText ({ rhs: expansion,
                                               vars: {},
                                               expandCallback: throwCallback,
                                               makeSymbolName: makeSymbolName })
  return { text: text,
           tree: { type: 'root', rhs: expansion } }
}

Bracery.prototype.expand = function (braceryText, config) {
  braceryText = braceryText || ('$' + defaultSymbol(this))
  if (typeof(braceryText) !== 'string')
    throw new Error ('the text to be expanded must be a string')
  var expansion = parseRhs (braceryText)
  return this._expandAndEvaluate (extend (config || {}, { expansion: expansion }))
}

Bracery.prototype.expandSymbol = function (symbolName, config) {
  symbolName = symbolName || defaultSymbol(this)
  symbolName = validateSymbolName (symbolName)
  var expansion = [{ type: 'sym', name: symbolName }]
  return this._expandAndEvaluate (extend (config || {}, { expansion: expansion }))
}

module.exports = { Bracery: Bracery,
                   ParseTree: ParseTree,
                   RhsParser: RhsParser,
                   nlp: nlp }
