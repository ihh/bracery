var Template = require('./template')
var ParseTree = require('./parsetree')
// var Validator = require('./validator')
var Chomsky = require('./chomsky')
var RhsParser = ParseTree.RhsParser
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

Bracery.prototype.toText = function() {
  var bracery = this
  var names = (arguments.length
               ? Array.prototype.slice.call (arguments, 0)
               : bracery.symbolNames())
  return names.map (function (name) {
    return '>' + name + '\n'
      + bracery.rules[name].map (function (rhs) {
        var text = ParseTree.makeRhsText (rhs)
        text = text.replace(/\n/g, function() { return '\\n' })
        if (!text.match(/\S/))
          text = '[|]'
        else if (text[0] === '>')
          text = '\\' + text
        return text + '\n'
      }).join('') + '\n'
  }).join('')
}

Bracery.prototype.toBracery = function() {
  var bracery = this
  return Object.keys(this.rules).sort()
    .map (function (symbol) {
      var rhsList = bracery.rules[symbol]
      if (typeof(rhsList) === 'function')
        throw new Error ("Can't convert JavaScript function to Bracery")
      return ParseTree.leftSquareBraceChar
        + symbol + '=>'
        + (typeof(rhsList) === 'string'
           ? rhsList
           : rhsList.map (function (rhs) { return ParseTree.makeRhsText(rhs) }).join (ParseTree.pipeChar))
        + ParseTree.rightSquareBraceChar
        + '\n'
    }).join('')
}

Bracery.prototype.varsToBracery = function (vars) {
  var bracery = this
  return Object.keys(vars).sort()
    .map (function (name) {
      return ParseTree.leftSquareBraceChar
        + name + ':'
        + ParseTree.escapeString (vars[name])
        + ParseTree.rightSquareBraceChar
        + '\n'
    }).join('')
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
  var oldRules = this.rules.hasOwnProperty(name) ? this.rules[name] : null
  if (typeof(rules) === 'function') {
    if (oldRules)
      throw new Error ('symbols with bound functions cannot have any other rules')
    this.rules[name] = rules
  } else {
    if (oldRules && oldRules.filter (function (oldRule) { return typeof(oldRule) === 'function' }).length)
      throw new Error ('symbols with bound functions cannot have any other rules')
    if (!ParseTree.isArray(rules))
      throw new Error ('rules must be an array')
    if (rules.filter (function (rule) { return typeof(rule) !== 'string' }).length)
      throw new Error ('rules array must contain strings')
    this.rules[name] = (oldRules || []).concat (rules.map (ParseTree.parseRhs))
  }
  var result = {}
  result[name] = this.rules[name]
  return result
}

Bracery.prototype.getRules = function (name) {
  return this.rules[name] || []
}

Bracery.prototype.deleteRules = function (name) {
  var bracery = this
  var result
  if (arguments.length > 1)
    result = Array.prototype.reduce.call (arguments, function (deleted, name) { return extend (deleted, bracery.deleteRules (name)) }, {})
  else if (!arguments.length) {
    result = this.rules
    this.rules = {}
  } else {
    name = validateSymbolName (name)
    result = {}
    result[name] = this.rules[name]
    delete this.rules[name]
  }
  return result
}

Bracery.prototype.setRules = function (name, rules) {
  this.rules[name] = rules
}

Bracery.prototype.addRule = Bracery.prototype.addRules
Bracery.prototype.deleteRule = Bracery.prototype.deleteRules
Bracery.prototype.setRule = Bracery.prototype.setRules

Bracery.prototype._expandRhs = function (config) {
  var result = this.expandParsed (config)
  return config.callback ? result.then(stringifyText) : stringifyText(result)
}

Bracery.prototype._expandSymbol = function (config) {
  var symbolName = config.node.name.toLowerCase()
  var rhs
  var rules = this.rules[symbolName]
  if (rules) {
    if (typeof(rules) === 'function') {
      // call dynamically bound function
      rhs = rules.apply (this, [extend ({ random: this.rng }, config)].concat (config.vars[ParseTree.varChar+'0'] || []))
      // if result is a string, forgivingly wrap it as a single-element array
      if (typeof(rhs) === 'string')
        rhs = [rhs]
      else if (rhs && typeof(rhs.then) === 'function') {
        rhs = rhs.then (function (result) {
          return typeof(result) === 'string' ? [result] : result
        })
      }
    } else {
      rhs = ParseTree.sampleParseTree (ParseTree.deepCopy (ParseTree.randomElement (rules, this.rng)), config)
    }
  } else
    rhs = []
  return rhs
}

Bracery.prototype._getSymbol = function (config) {
  var symbolName = config.symbolName || config.node.name
  var result
  symbolName = validateSymbolName (symbolName)
  var rules = this.getRules (symbolName)
  if (typeof(rules) !== 'function') {
    var rulesRhs = rules.map (function (rule) { return ParseTree.makeRhsText (rule) })
    result = (rulesRhs.length
              ? (rulesRhs.length === 1
                 ? rulesRhs
                 : [ParseTree.leftSquareBraceChar + rulesRhs.join (ParseTree.pipeChar) + ParseTree.rightSquareBraceChar])
              : [''])
  }
  return result
}

function stringifyText (expansion) {
  if (expansion)
    expansion.text = ParseTree.makeString (expansion.text)
  return expansion
}

Bracery.prototype.makeConfig = function (config) {
  return extend ({ expand: this._expandSymbol.bind (this),
                   get: this._getSymbol.bind (this),
                   set: function() { return [] } },
                 config)
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

Bracery.prototype.expandParsed = function (config) {
  var newConfig = this.makeConfig (config)
  if (newConfig.callback) {
    var promise = ParseTree.makeRhsExpansionPromise (newConfig)
    if (typeof(newConfig.callback) === 'function')
      promise = promise.then (newConfig.callback)
    return promise
  }
  return ParseTree.makeRhsExpansionSync (newConfig)
}

Bracery.prototype.expand = function (braceryText, config) {
  if (config && config.rules)
    return new Bracery (config.rules).expand (braceryText, extend ({}, config, {rules:null}))
  braceryText = braceryText || (ParseTree.symChar + this.getDefaultSymbol())
  if (typeof(braceryText) !== 'string')
    throw new Error ('the text to be expanded must be a string')
  return this._expandRhs (extend ({ vars: {} }, config, { rhsText: braceryText }))
}

Bracery.prototype.expandSymbol = function (symbolName, config) {
  symbolName = symbolName || this.getDefaultSymbol()
  symbolName = validateSymbolName (symbolName)
  return this._expandRhs (extend ({ vars: {} }, config, { rhs: [{ name: symbolName }] }))
}

Bracery.prototype.getSymbol = function (symbolName, config) {
  return this._getSymbol (extend ({}, config, { symbolName: symbolName }))
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
//                   Validator: Validator,
		   Chomsky: { makeGrammar: Chomsky.makeGrammar.bind (Chomsky, ParseTree),
		              parseInside: Chomsky.parseInside.bind (Chomsky, ParseTree) },
                   Template: Template,
                   Promise: Promise,
                   nlp: nlp }
