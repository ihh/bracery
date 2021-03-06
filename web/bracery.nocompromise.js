(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
var Template = require('./template')
var ParseTree = require('./parsetree')
// var Validator = require('./validator')
var Chomsky = require('./chomsky')
var RhsParser = ParseTree.RhsParser
var extend = ParseTree.extend
var nlp = ParseTree.nlp

var Bracery = function (rules, config) {
  this.rules = {}
  if (rules)
    this.addRules (rules)
  if (config) {
    // Several ways of doing text->phoneme conversions:
    // 1) Specify the function directly as config.textToPhonemes. It takes a string as input, and should return an array of phonemes.
    // 2) Pass in a link to RiTa, as config.rita: http://rednoise.org/rita/
    // 3) Pass in a function, config.cmuDict, that returns the CMU Pronunciation Dictionary as a string (function will only get called when needed: avoids the hit of loading the dictionary each time)
    if (config.textToPhonemes)
      this.textToPhonemes = config.textToPhonemes
    else if (config.rita)
      this.textToPhonemes = function (text) {
        return ParseTree.textToWords (text)
          .reduce (function (phonemeArray, word) {
            return phonemeArray.concat (config.rita.getPhonemes(word).split(/-/));
          }, []);
      }
    else if (config.cmuDict) {
      var isWord = new RegExp ('^[a-z]')
      var word2phonemes = null
      function loadDictionary() {
        word2phonemes = {}
        config.cmuDict().toLowerCase()
          .split (/\n/)
          .forEach (function (line) {
            line = line
              .replace (/^\s+/, '')
              .replace (/\s+$/, '')
              .replace(/[^a-z0-9\s]/g,'')  // these are the characters we keep
            if (isWord.exec (line)) {
              var fields = line.split (/\s+/)
              word2phonemes[fields[0]] = fields.slice(1)
                .map (function (phoneme) {
                  return phoneme.replace (/[0-9]/g, '')  // removing numerical digits elides the syllabic emphasis
                })
            }
          })
      }
      function convertToPhonemes (word) {
        if (!word2phonemes)
          loadDictionary()
        for (var i = 0; i < word.length; ++i) {
          var phonemes = word2phonemes[word.substr(i)]
          if (phonemes)
            return (i ? convertToPhonemes (word.substr(0,i)) : []).concat (phonemes)
        }
        return 'xxx'  // dummy placeholder
      }
      this.textToPhonemes = function (text) {
        return ParseTree.textToWords (text)
          .reduce (function (phonemeArray, word) {
            return phonemeArray.concat (convertToPhonemes (word));
          }, []);
      }
    }
  }
  return this
}

Bracery.prototype.textToPhonemes = ParseTree.textToWords

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
  if (!config.node.name)
    console.error('Bad expandSymbol node:',JSON.stringify(config.node))
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
  return extend ({ textToPhonemes: this.textToPhonemes.bind (this),
		   expand: this._expandSymbol.bind (this),
		   get: this._getSymbol.bind (this),
		   set: function() { return [] },
		 },
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
  if (typeof(bracery.defaultSymbol) === 'string' || typeof(bracery.defaultSymbol) === 'undefined')
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
  if (config.expand === null || newConfig.expand === null)
    newConfig.expand = function (expandConfig) {
      var getResult = newConfig.get (expandConfig)
      function parseAndSample (def) {
	return ParseTree.sampleParseTree (ParseTree.parseRhs (def[0]))
      }
      if (expandConfig.callback)
	return getResult.then (parseAndSample)
      else
	return parseAndSample (getResult)
    }
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
  var defaultSymbolName = this.getDefaultSymbol()
  if (defaultSymbolName && typeof(braceryText) === 'undefined')
    braceryText = ParseTree.symChar + defaultSymbolName
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

},{"./chomsky":2,"./parsetree":3,"./template":6}],2:[function(require,module,exports){
// set config.normal to force max two symbols on RHS of any rule (despite the name, this isn't quite Chomsky normal form, as it includes empty rules, transitions, multi-character terminal strings...)
function makeGrammar (ParseTree, config) {
  var vars = config.vars || {}, root = config.root
  var cfg = {}
  return makeGrammarSymbol (ParseTree, config, cfg, [typeof(root) === 'string' ? ParseTree.parseRhs(root) : root], 'start')
    .then (function (start) {
      if (!start)
        return null
      var toposort = toposortSymbols (cfg, start.name)
      var sortOrder = toposort.sort || Object.keys(cfg).sort()
      var symbolRank = {}
      sortOrder.forEach (function (sym, n) { symbolRank[sym] = n })
      sortOrder.forEach (function (sym) {
        if (cfg[sym].opts)
          cfg[sym].opts.forEach (function (opt) {
            opt.rhs.forEach (function (node) {
              if (node.type === 'nonterm')
                node.rank = symbolRank[node.name]
            })
          })
      })
      return { stateByName: cfg,
               stateByRank: sortOrder.map (function (sym) { return cfg[sym] }),
               rankByName: symbolRank,
	       nameByRank: sortOrder,
	       cyclic: toposort.cyclic,
	       empties: toposort.empties,
	       start: start.name }
    })
}

function makeGrammarRules (ParseTree, config, cfg, name, checkVars, checkSym, expand) {
  var vars = config.vars || {}
  var resolve = config.sync ? ParseTree.syncPromiseResolve : Promise.resolve.bind(Promise)
  var symCheckedPromise
  var opts, symDef, cfgName
  if (checkVars && vars[name]) {
    symDef = vars[name]
    cfgName = expand ? (ParseTree.funcChar + ParseTree.varChar + name) : (ParseTree.varChar + name)
    symCheckedPromise = resolve()
  } else if (checkSym && config.get) {
    symCheckedPromise = resolve (config.get (ParseTree.extend ({}, config, { symbolName: name })))
      .then (function (getResult) {
        if (getResult)
          symDef = getResult.join('')
        cfgName = expand ? (ParseTree.symChar + name) : (ParseTree.funcChar + 'xget' + ParseTree.symChar + ParseTree.name)
      })
  }
  return symCheckedPromise.then (function() {
    if (symDef) {
      if (checkVars && checkSym)
        cfgName = ParseTree.traceryChar + name + ParseTree.traceryChar
      opts = expand ? [ParseTree.parseRhs (symDef)] : [symDef]
    } else
      opts = []
    return makeGrammarSymbol (ParseTree, config, cfg, opts, 'sym', cfgName)
  })
}

function makeGrammarSymbol (ParseTree, config, cfg, rhsList, type, name, weight) {
//  console.warn ('makeGrammarSymbol', type, name, JSON.stringify(rhsList))
  var vars = config.vars || {}
  var resolve = config.sync ? ParseTree.syncPromiseResolve : Promise.resolve.bind(Promise)
  var gotSymbolPromise
  name = name || (Object.keys(cfg).filter(function(name){return name.match(/^[0-9]+$/)}).length + 1).toString()
  if (typeof(cfg[name]) === 'undefined') {
    cfg[name] = true  // placeholder
    gotSymbolPromise = rhsList.reduce (function (optsPromise, rhs, node) {
      return optsPromise.then (function (opts) {
        var revRhs = (typeof(rhs) === 'string' ? [rhs] : rhs).slice(0).reverse()
        return revRhs.reduce (function (gramRhsPromise, node) {
          return gramRhsPromise.then (function (gramRhs) {
	    var cfgNodePromise
	    if (gramRhs) {
	      if (typeof(node) === 'string')
		cfgNodePromise = resolve ({ type: 'term', text: node })
	      else if (node.type === 'term' || node.type === 'nonterm')
		cfgNodePromise = resolve (node)
	      else if (node.type === 'alt')
		cfgNodePromise = makeGrammarSymbol (ParseTree, config, cfg, node.opts, 'alt')
	      else if (node.type === 'sym')
		cfgNodePromise = makeGrammarRules (ParseTree, config, cfg, node.name, false, true, true)
	      else if (node.type === 'lookup')
		cfgNodePromise = makeGrammarRules (ParseTree, config, cfg, node.varname, true, false, false)
	      else if (ParseTree, ParseTree.isTraceryExpr (node))
		cfgNodePromise = makeGrammarRules (ParseTree, config, cfg, node.test[0].varname, true, true, true)
	      else if (ParseTree, ParseTree.isEvalVar (node))
		cfgNodePromise = makeGrammarRules (ParseTree, config, cfg, node.args[0].varname, true, false, true)
	      else {
                var warning = "Can't convert to context-free grammar: " + ParseTree.makeRhsText ([node])
                console.warn (warning)
		throw new Error (warning)
              }
	    }
            return cfgNodePromise.then (function (cfgNode) {
              if (cfgNode) {
                if (config.normal && gramRhs.rhs.length === 2) {
                  return makeGrammarSymbol (ParseTree, config, cfg, [gramRhs.rhs], 'elim')
                    .then (function (elimNode) {
                      return { rhs: [cfgNode, elimNode],
			       weight: gramRhs.weight }
                    })
                } else
                  return { rhs: [cfgNode].concat (gramRhs.rhs),
			   weight: gramRhs.weight }
              }
              return null
            })
          })
	}, resolve ({ rhs: [], weight: 1 / rhsList.length }))
          .then (function (gramRhs) {
            return opts.concat (gramRhs)
          })
      })
    }, resolve([]))
      .then (function (opts) {
        cfg[name] = { type: type, opts: opts }
        return resolve()
      })
  } else
    gotSymbolPromise = resolve()
  return gotSymbolPromise.then (function() {
    return resolve (cfg[name] ? { type: 'nonterm', name: name } : null)
  })
}

function getSymbols (cfg) {
  return Object.keys(cfg).sort()
}

function getSources (cfg) {
  var isSource = {}, symbols = getSymbols (cfg)
  symbols.forEach (function (sym) {
    cfg[sym].opts.forEach (function (rhs) {
      rhs.rhs.forEach (function (node) {
	if (node.type === 'nonterm') {
	  isSource[node.name] = isSource[node.name] || {}
	  isSource[node.name][sym] = true
	}
      })
    })
  })
  var sources = {}
  symbols.forEach (function (sym) {
    sources[sym] = isSource[sym] ? Object.keys(isSource[sym]).sort() : []
  })
  return sources
}

function nodeIsNonempty (cfg, flaggedAsEmpty, node) {
  return (node.type === 'term' ? (node.text.length > 0) : (cfg[node.name] && !flaggedAsEmpty[node.name]))
}

function symIsEmpty (cfg, flaggedAsEmpty, sym) {
  return cfg[sym].opts.reduce (function (foundEmptyRhs, rhs) {
    return foundEmptyRhs || !rhs.rhs.filter (nodeIsNonempty.bind (null, cfg, flaggedAsEmpty)).length
  }, false)
}

function getEmptyFlags (cfg) {
  var sources = getSources (cfg), symbols = getSymbols (cfg)
  var flaggedAsEmpty = {}
  do {
    var foundEmpties = false
    symbols.forEach (function (sym) {
      if (!flaggedAsEmpty[sym] && symIsEmpty(cfg,flaggedAsEmpty,sym)) {
	flaggedAsEmpty[sym] = true
	foundEmpties = true
      }
    })
  } while (foundEmpties)
  return flaggedAsEmpty
}

function getNullTransitions (cfg) {
  var isEmpty = getEmptyFlags (cfg), symbols = getSymbols (cfg)
  var isSource = {}, isSink = {}
  symbols.forEach (function (sym) {
    isSource[sym] = {}
    isSink[sym] = {}
  })
  symbols.forEach (function (source) {
    cfg[source].opts.forEach (function (rhs) {
      rhs.rhs.forEach (function (node) {
	if (node.type === 'nonterm' && !rhs.rhs.filter (function (otherNode) {
	  return otherNode !== node && nodeIsNonempty (cfg, isEmpty, otherNode)
	}).length) {
	var sink = node.name
	  isSink[source][sink] = true
	  isSource[sink][source] = true
	}
      })
    })
  })
  var sinks = {}, sources = {}
  symbols.forEach (function (sym) {
    sinks[sym] = Object.keys (isSink[sym]).sort()
    sources[sym] = Object.keys (isSource[sym]).sort()
  })
  return { empties: Object.keys(isEmpty).sort(), sinks: sinks, sources: sources }
}

function toposortSymbols (cfg, start) {
  var symbols = getSymbols (cfg), trans = getNullTransitions (cfg)
  // Kahn, Arthur B. (1962), "Topological sorting of large networks", Communications of the ACM 5 (11): 558–562, doi:10.1145/368996.369025
  // https://en.wikipedia.org/wiki/Topological_sorting
  var S = [], L = []
  var nParents = [], edges = 0
  symbols.forEach (function (c) {
    nParents[c] = trans.sources[c].length
    edges += nParents[c]
    if (nParents[c] == 0)
      (c === start ? S.unshift : S.push).call (S, c)  // ensure start goes at the beginning
  })
  while (S.length > 0) {
    var n = S.shift()
    L.push (n)
    trans.sinks[n].forEach (function(m) {
      --edges
      if (--nParents[m] == 0)
        S.push (m)
    })
  }

  if (edges > 0) {
    trans.cyclic = true
    // make a good-faith effort at an "approximate" topological sort by doing a breadth-first search from the start state and whatever we've covered already
    var queue = [start].concat (L), visited = {}
    L = []
    while (queue.length) {
      var current = queue.shift()
      if (!visited[current]) {
        L.push (current)
        trans.sinks[current].forEach (function (next) {
          queue.push (next)
        })
        visited[current] = true
      }
    }
    L = L.concat (symbols.filter (function (sym) { return !visited[sym] }).sort())
  }

  trans.sort = L
  return trans
}

// Inside algorithm c.f. Durbin, Eddy, Krogh & Mitchison (1998) "Biological Sequence Analysis"
// or other sources e.g. https://en.wikipedia.org/wiki/Inside%E2%80%93outside_algorithm
function ruleWeight (inside, text, maxSubseqLen, i, j, k, opt) {
  var rhsLen = opt.rhs.length
  if ((rhsLen === 0 && i !== j) || (rhsLen === 1 && k < j))
    return 0
  var w = opt.weight
  for (var pos = 0; w && pos < rhsLen; ++pos) {
    var node = opt.rhs[pos]
    var start = pos ? k : i, len = pos ? (j-k) : (k-i), idx = len
    if (start && len > maxSubseqLen) {
      if (start + len === text.length)
        idx = maxSubseqLen + 1
      else
        return 0
    }
    var insideCell
    w *= (node.type === 'term'
	  ? (node.text.length === len && node.text === text.substr(start,len) ? 1 : 0)
	  : (((insideCell = inside[start][idx]) && insideCell[node.rank]) || 0))
  }
  return w
}

function sampleTrace (config, cfg, text, inside, i, j, lhs, rng) {
  rng = rng || Math.random
  var applications = [], weights = [], totalWeight = 0
  for (var k = i; k <= j; ++k) {
    cfg.stateByRank[lhs].opts.forEach (function (rhs) {
      var w = ruleWeight (inside, text, config.maxSubsequenceLength || text.length, i, j, k, rhs)
      applications.push ({ k: k, rhs: rhs })
      weights.push (w)
      totalWeight += w
    })
  }
  var r = rng() * totalWeight, n
  for (n = 0; n < applications.length - 1; ++n)
    if ((r -= weights[n]) <= 0)
      break
  var app = applications[n], k = app.k, opt = app.rhs
  return [cfg.nameByRank[lhs]].concat (opt.rhs.map (function (node, pos) {
    return (node.type === 'term'
            ? node.text
            : sampleTrace (config, cfg, text, inside, pos ? k : i, pos ? j : k, node.rank, rng))
  }))
}

function transformTrace (ParseTree, config, cfg, trace) {
  return trace.slice(1).reduce (function (t, node) {
    if (typeof(node) === 'string')
      return t.concat ([node])
    var name = node[0], type = cfg.stateByName[name].type, rest = transformTrace (ParseTree, config, cfg, node).slice(1)
    switch (type) {
    case 'sym':
      return t.concat ([[name].concat (rest)])
    case 'alt':
      return t.concat ([['alt'].concat (rest)])
    case 'elim':
      return t.concat (rest)
    default:
      throw new Error ('unknown node type')
      break
    }
  }, [trace[0]])
}

function fillInside (config, cfg, text) {
  if (config.verbose)
    console.warn('fillInside.grammar',JSON.stringify(cfg,null,2))
  var len = text.length, nSym = cfg.nameByRank.length
  var maxSubseqLen = config.maxSubsequenceLength || len
  var isTerm = {}, optsByMaxRhsLen = [[], [], []]
  cfg.stateByRank.forEach (function (state, s) {
    state.opts.forEach (function (opt) {
      var rhs = opt.rhs
      rhs.forEach (function (node) {
        if (node.type === 'term')
          isTerm[node.text] = true
      })
      opt.lhsRank = s
      for (var maxRhsLen = rhs.length; maxRhsLen <= 2; ++maxRhsLen)
        optsByMaxRhsLen[maxRhsLen].push (opt)
    })
  })
  if (config.verbose)
    console.warn('fillInside.optsByMaxRhsLen',JSON.stringify(optsByMaxRhsLen))

  var inside = new Array(len+1).fill(0).map (function (_, i) {
    // if an (i,j) cell is null, it's definitely not in the parse tree and can be skipped
    // if an (i,j) cell is false, then text[i..j] is a terminal, but no cells have yet been filled
    return new Array(i === 0 ? (len+1) : Math.min(maxSubseqLen+2,len+1-i)).fill(null)
  })
  for (var i = len; i >= 0; --i) {
    var jStop = undefined, jStart = undefined
    if (i > 0 && i < len - maxSubseqLen) {
      jStop = i + maxSubseqLen
      jStart = len
    }
    for (var j = i; j <= len; ++j) {
      var kStop = undefined, kStart = undefined
      if (i === 0) {
        if (j < len && j > maxSubseqLen + 1) {
          kStop = 0
          kStart = j - maxSubseqLen
        }
      } else if (j === len) {
        if (i < len - maxSubseqLen - 1) {
          kStop = i + maxSubseqLen
          kStart = j
        }
      }
      var ijIndex = i === 0 ? j : Math.min (j - i, maxSubseqLen + 1)
      var ijText = text.substr (i, j - i)
      var inside_ij = inside[i][ijIndex]
      if (isTerm[ijText])
        inside_ij = inside[i][ijIndex] = false
      for (var k = i; k <= j; ++k) {
        var ikIndex = i === 0 ? k : Math.min (k - i, maxSubseqLen + 1)
        if (inside[i][ikIndex] !== null) {
          var kjIndex = k === 0 ? j : Math.min (j - k, maxSubseqLen + 1)
          var inside_kj = inside[k][kjIndex]
          if (inside_kj !== null || k === j) {  // allow the case where k===j just in case opt.rhs.length === 1 later
            var opts = optsByMaxRhsLen[i === j ? 0 : (inside_kj === null ? 1 : 2)]
            for (var nOpt = opts.length - 1; nOpt >= 0; --nOpt) {
              var opt = opts[nOpt], s = opt.lhsRank
	      var weight = ruleWeight (inside, text, maxSubseqLen, i, j, k, opt)
              if (config.verbose)
                console.warn ('fillInside.rule', 'weight='+weight, 'i='+i, 'j='+j, 'k='+k, 'ij='+text.substr(i,j-i), 'jk='+text.substr(j,k-j), 'lhs='+cfg.nameByRank[s], 'opt='+JSON.stringify(opt))
              if (weight) {
                if (!inside_ij)
                  inside_ij = inside[i][ijIndex] = new Array(nSym).fill(0)
	        inside_ij[s] += weight
              }
            }
            if (k === kStop)
              k = kStart - 1
	  }
        }
      }
      if (j === jStop)
        j = jStart - 1
    }
  }
  return inside
}

function parseInside (ParseTree, config) {
  return makeGrammar (ParseTree, ParseTree.extend ({}, config, { normal: true }))
    .then (function (cfg) {
      var text = config.text, rng = config.rng
      var inside = fillInside (config, cfg, text)
      var startCell = inside[0][text.length], startState = cfg.rankByName[cfg.start]
      if (!(startCell && startCell[startState]))
        return ''
      var trace = sampleTrace (config, cfg, text, inside, 0, text.length, startState, rng)
      return ['root'].concat (transformTrace (ParseTree, ParseTree, cfg, trace).slice(1))
    })
}

module.exports = { makeGrammar: makeGrammar,
		   parseInside: parseInside }

},{}],3:[function(require,module,exports){
var RhsParser = require('./rhs')
var Chomsky = require('./chomsky')

//var nlp = require('compromise')

function isTruthy (x) { return makeString(x).match(/\S/) }
var trueVal = '1'  // truthy value used when a result should be truthy but the default result in this context would otherwise be an empty string e.g. &same{}{} or &not{}
var falseVal = ''  // falsy value
var zeroVal = '0'  // default zero value for arithmetic operators

// General helper functions
function isArray (obj) { return Object.prototype.toString.call(obj) === '[object Array]' }

function extend (dest) {
  dest = dest || {}
  Array.prototype.slice.call (arguments, 1).forEach (function (src) {
    if (src)
      Object.keys(src).forEach (function (key) { dest[key] = src[key] })
  })
  return dest
}

function deepCopy (orig) {
  var result
  if (isArray(orig))
    result = orig.map (deepCopy)
  else if (typeof(orig) === 'object') {
    result = {}
    Object.keys(orig).forEach (function (key) { result[key] = deepCopy (orig[key]) })
  } else
    result = orig
  return result
}

// randomness
function randomIndex (array, rng) {
  rng = rng || Math.random
  return Math.floor (rng() * array.length)
}

function randomElement (array, rng) {
  return array[randomIndex (array, rng)]
}

function nRandomElements (array, n, rng) {
  rng = rng || Math.random
  var result = []
  var index = array.map (function (_dummy, k) { return k })
  for (var i = 0; i < n && i < array.length - 1; ++i) {
    var j = Math.floor (rng() * (array.length - i)) + i
    result.push (array[index[j]])
    index[j] = index[i]
  }
  return result
}

// Parser
var parseCache = {}
function parseRhs (rhsText) {
  var cached
  if (parseCache.hasOwnProperty(rhsText))
    cached = parseCache[rhsText]
  else {
    try {
      cached = RhsParser.parse (rhsText)
    } catch (e) {
      console.warn ('parse error', e)
      cached = [rhsText]
    }
    parseCache[rhsText] = cached
  }
  return deepCopy (cached)
}

function makeRoot (rhs) {
  return { type: 'root',
           rhs: rhs }
}

var newSymbolDefReg = /^>([A-Za-z_]\w*)\s*$/;
var commentReg = /^ *#([^#]*|[^#]* .*)$/;
var commandReg = /^ *## +(\S+)\s?(.*?)\s*$/;
var localSymbolReg = /~[~\*]([A-Za-z0-9_]+)/g;
var localTagInBodyReg = /#[#\*](\S+)/g;
function parseTextDefs (text) {
  var initCommandParam = { PREFIX: '',
                           SUFFIX: '' },
      commandParam = extend ({}, initCommandParam)
  var rules = {}
  try {
    var currentRules, newSymbolDefMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        if (commandMatch = commandReg.exec (line)) {
	  var param = commandMatch[1], value = commandMatch[2]
	  if (param === 'RESET') {
	    if (value)  // RESET XXX resets the param setting for XXX
	      commandParam[value] = initCommandParam[value]
	    else  // RESET without an argument resets all params
	      commandParam = extend ({}, initCommandParam)
	  } else
	    commandParam[param] = value
        } else if (commentReg.exec (line)) {
          /* comment, do nothing */
        } else if (currentRules) {
          line = line.replace (localSymbolReg, function (_m, sym) {
            var newSym = commandParam['PREFIX'] + sym + commandParam['SUFFIX']
            if (sym.toUpperCase() === sym)
              newSym = newSym.toUpperCase()
            else if (sym[0].toUpperCase() === sym[0])
              newSym = newSym[0].toUpperCase() + newSym.substr(1).toLowerCase()
            else
              newSym = newSym.toLowerCase()
            return "~" + newSym
          })
          line = line.replace (localTagInBodyReg, function (_m, tag) { return commandParam['PREFIX'] + tag + commandParam['SUFFIX'] })
          currentRules.push (line)
        } else if (newSymbolDefMatch = newSymbolDefReg.exec (line))
          rules[commandParam['PREFIX'] + newSymbolDefMatch[1] + commandParam['SUFFIX']] = currentRules = []
        else
          console.warn ("Can't parse symbol definition line: " + line)
      } else {
        // line is empty
        currentRules = undefined
      }
    })
  } catch(e) { console.log(e) }
  return rules
}

// Parse tree constants
var symChar = '~', varChar = '$', funcChar = '&', leftBraceChar = '{', rightBraceChar = '}', leftSquareBraceChar = '[', rightSquareBraceChar = ']', pipeChar = '|', assignChar = '=', traceryChar = '#', defaultMapVar = '_'
var nodeArgKeys = ['rhs','args','unit','value','local','cond','t','f','bind']
var nodeListArgKeys = ['opts']
var defaultUser = 'guest'

// Footers
var defaultFooterVarName = 'footer'
function makeFooter (footerVarName) {
  return [ { type: 'func',
             footer: true,
             funcname: 'eval',
             args: [ { type: 'lookup',
                       footer: true,
                       varname: footerVarName || defaultFooterVarName } ] } ]
}

function stripFooter (rhs) {
  return rhs.filter (function (node) { return !node.footer })
}

function addFooter (rhs, footerVarName) {
  var strippedRhs = footerVarName ? rhs : stripFooter(rhs)
  return strippedRhs.concat (makeFooter (footerVarName))
}

// Parse tree manipulations.

// There are two methods for expanding a template into a fully-expanded parse tree.
// The first, synchronous method is sampleParseTree, which expands any constructs (alternations, repetitions)
// whose syntactic expansion can be performed immediately, without reference to the symbol store.
// The second, asynchronous method is makeRhsExpansionPromise, which returns a promise of an expansion,
// once all remote calls to the symbol store have been performed.
// Typically, these methods must both be called, one after the other
// (NB makeRhsExpansionPromise recursively calls itself and sampleParseTree, which recursively calls itself).

// sampleParseTree is the main method for constructing a new, clean parse tree from a template.
// in the process, it samples any alternations or repetitions
function sampleParseTree (rhs, config) {
  var pt = this
  var rng = (config ? config.rng : null) || Math.random
  if (typeof(rhs.map) !== 'function')
    console.error ('sampleParseTree type error: rhs (' + typeof(rhs) + ') = ' + JSON.stringify(rhs))
  return rhs.map (function (node, n) {
    var result, index
    if (typeof(node) === 'string')
      result = node
    else if (config && config.quoteLevel > 0) {
      if (node.type === 'func' && node.funcname === 'unquote')
	result = { type: 'func',
                   funcname: 'unquote',
                   args: pt.sampleParseTree (node.args, extend ({}, config, { quoteLevel: config.quoteLevel - 1 })) }
      else {
        result = extend ({}, node)
        if (node.type === 'func' && node.funcname === 'quote')
          config = extend ({}, config, { quoteLevel: config.quoteLevel + 1 })
        nodeArgKeys.forEach (function (key) {
          if (node[key])
            result[key] = pt.sampleParseTree (node[key], config)
        })
        if (node.opts)
          result.opts = node.opts.map (function (opt) { return pt.sampleParseTree (opt, config) })
      }
    } else {
      switch (node.type) {
      case 'root':
        result = { type: node.type,
                   rhs: pt.sampleParseTree (node.rhs, config) }
        break
      case 'assign':
	result = { type: 'assign',
                   varname: node.varname,
		   value: pt.sampleParseTree (node.value, config),
                   local: node.local ? pt.sampleParseTree (node.local, config) : undefined,
                   visible: node.visible }
        break
      case 'alt':
        index = pt.randomIndex (node.opts, rng)
	result = { type: 'alt_sampled',
                   n: index,
                   rhs: pt.sampleParseTree (node.opts[index], config) }
        break
      case 'alt_sampled':
        result = { type: 'alt_sampled',
                   n: node.n,
                   rhs: pt.sampleParseTree (node.rhs, config) }
        break
      case 'rep':
        var n = Math.min (Math.floor (rng() * (node.max + 1 - node.min)) + node.min,
                          config && config.maxReps ? config.maxReps : pt.maxReps)
	result = { type: 'rep_sampled',
                   n: n,
		   reps: new Array(n).fill().map (function() { return pt.sampleParseTree (node.unit, config) }) }
        break
      case 'rep_sampled':
        result = { type: 'rep_sampled',
                   n: node.n,
                   reps: node.reps.map (function (rep) { return pt.sampleParseTree (rep, config) }) }
        break
      case 'cond':
	result = { type: 'cond',
                   test: node.test,
		   t: pt.sampleParseTree (node.t, config),
                   f: pt.sampleParseTree (node.f, config) }
        break
      case 'func':
	result = { type: 'func',
                   funcname: node.funcname,
		   args: (node.funcname === 'strictquote'
                          ? node.args
                          : (node.funcname === 'quote'
                             ? pt.sampleParseTree (node.args, extend ({}, config, { quoteLevel: (config && config.quoteLevel || 0) + 1 }))
                             : pt.sampleParseTree (node.args, config))) }
        break
      case 'lookup':
	result = node
        break
      default:
      case 'sym':
	result = { type: 'sym' };
        ['name','id','method','user'].forEach (function (key) {
          if (typeof(node[key]) !== 'undefined')
            result[key] = node[key]
        })
        if (node.bind)
          result.bind = pt.sampleParseTree (node.bind, config)
	break
      }
      if (node.footer)
        result.footer = node.footer
    }
    return result
  })
}

// config = {
//  excludeSubtree (boolean),
//  nodePredicate ([config,node] => foundNode),
//  makeChildConfig ([config,node,nChild] => childConfig)
// }
function findNodes (rhs, config) {
  var pt = this
  config = config || {}
  if (config.excludeSubtree)
    return []
  config.nodePredicate = config.nodePredicate || function (config, node) { return node }
  config.makeChildConfig = config.makeChildConfig || function (config, node, nChild) { return config }
  var nodePredicate = config.nodePredicate, makeChildConfig = config.makeChildConfig
  return rhs.reduce (function (result, node) {
    var foundNode = nodePredicate (config, node)
    var childConfig = function (n) { return makeChildConfig (config, node, n) }
    var r = null
    if (typeof(node) === 'object')
      switch (node.type) {
      case 'lookup':
        break
      case 'assign':
        r = pt.findNodes ((node.value || []).concat (node.local || []), childConfig())
        break
      case 'alt':
        r = node.opts.reduce (function (altResults, opt) {
          return altResults.concat (pt.findNodes (opt, childConfig()))
        }, [])
        break
      case 'rep':
        r = pt.findNodes (node.unit, childConfig())
        break
      case 'func':
	switch (node.funcname) {
	case 'eval':
	  r = pt.findNodes (node.args.concat (node.value || []), childConfig())
	  break
	case 'link':
	  r = pt.findNodes ([node.args[0]], childConfig(0))
	    .concat (pt.findNodes ([node.args[1]], childConfig(1)))
	  break
	case 'strictquote':
	case 'quote':
	case 'unquote':
        default:
	  r = pt.findNodes (node.args, childConfig())
          break
	}
        break
      case 'cond':
        r = pt.findNodes (node.test.concat (node.t, node.f), childConfig())
        break
      case 'root':
      case 'alt_sampled':
        r = pt.findNodes (node.rhs, childConfig())
        break
      case 'rep_sampled':
        r = pt.findNodes (node.reps.reduce (function (all, rep) { return all.concat(rep) }, []), childConfig())
        break
      default:
      case 'sym':
        r = pt.findNodes (node.rhs || node.bind || [], childConfig())
        break
      }
    return result.concat(foundNode ? [foundNode] : []).concat(r || []);
  }, [])
}

// Specialized findNodes for symbol nodes
// Somewhat misnamed, as it does not just return symbol nodes;
// it can also be configured to return &link{source}{target}, &layout&link{src}{targ}, #symbol#, &eval$x, $x, etc.
// In other words it's a general Swiss Army knife for IDEs that do static analysis of Bracery.
function getSymbolNodes (rhs, gsnConfig) {
  gsnConfig = gsnConfig || {}
  return this.findNodes (rhs, {
    nodePredicate: function (nodeConfig, node) {
      function addLinkInfo (foundNode) {
	return (gsnConfig.addParentLinkInfo
                ? extend (foundNode,
                          nodeConfig.inLink
                          ? { inLink: true,
                              linkText: nodeConfig.linkText,
                              link: nodeConfig.link }
                          : { inLink: false })
                : foundNode)
      }
      if (typeof(node) === 'object')
        switch (node.type) {
        case 'cond':
	  if (isTraceryExpr (node)
	      && !gsnConfig.ignoreTracery)
	    return addLinkInfo (node.f[0])
          break
        case 'sym':
          if (!gsnConfig.ignoreSymbols)
	    return addLinkInfo (node)
          break
        case 'lookup':
          if (gsnConfig.reportLookups)
	    return addLinkInfo (node)
          break
        case 'assign':
          if (gsnConfig.reportAssigns)
	    return addLinkInfo (node)
          break
        case 'func':
          if (((isLinkExpr(node) && !nodeConfig.parentLayoutLink)
               || isLayoutLinkExpr(node))
              && gsnConfig.reportLinks) {
            return addLinkInfo (node)
          }
          if (isEvalVar(node) && gsnConfig.reportEvals)
            return addLinkInfo (node)
          break
        default:
          break
        }
      return false
    },
    makeChildConfig: function (nodeConfig, node, nChild) {
      if (typeof(node) === 'object') {
        switch (node.type) {
        case 'func':
          if (node.funcname === 'link')
            return (gsnConfig.ignoreLinkSubtrees && nChild === 1
                    ? { excludeSubtree: true }
                    : extend ({},
                              nodeConfig,
                              { inLink: true,
                                linkText: node.args[0],
                                link: nodeConfig.parentLayoutLink || node },
                              nodeConfig.parentLayoutLink
                              ? { parentLayoutLink: null }
                              : {}))
          else if (isLayoutLinkExpr(node) && gsnConfig.reportLinks)
            return extend ({},
                           nodeConfig,
                           { parentLayoutLink: node });
          break
        case 'cond':
          if (isTraceryExpr(node))
            return { excludeSubtree: true }
          break
        default:
          break
        }
      }
      return nodeConfig
    }
  })
}

// parseTreeEmpty returns true if a tree contains no nonwhite characters OR unexpanded symbols
// TODO: rewrite using findNodes
function parseTreeEmpty (rhs) {
  var pt = this
  return rhs.reduce (function (result, node) {
    if (result) {
      if (typeof(node) === 'string')
	result = !isTruthy (node)
      else {
        switch (node.type) {
        case 'assign':
          result = pt.parseTreeEmpty (node.value) && (!node.local || pt.parseTreeEmpty (node.local))
          break
        case 'alt':
          result = node.opts.reduce (function (r, opt) {
	    return r && pt.parseTreeEmpty (opt)
          }, true)
          break
        case 'cond':
          result = pt.parseTreeEmpty (node.t) && pt.parseTreeEmpty (node.f)   // this will miss some empty trees, oh well
          break
        case 'func':
          result = pt.parseTreeEmpty (node.args)
          break
        case 'lookup':
          result = false  // we aren't checking variable values, so just assume any referenced variable is nonempty (yes this will miss some empty trees)
          break
        case 'root':
        case 'alt_sampled':
	  if (node.rhs)
	    result = pt.parseTreeEmpty (node.rhs)
	  break
        case 'rep_sampled':
          if (node.reps)
            return node.reps.reduce (function (all, rep) { return all && pt.parseTreeEmpty(rep) }, true)
        default:
        case 'sym':
	  result = node.rhs && pt.parseTreeEmpty (node.rhs)
	  break
        }
      }
    }
    return result
  }, true)
}

function isEvalVar (node) {
  return (typeof(node) === 'object' && node.type === 'func'
          && ((node.funcname === 'eval' && node.args.length === 1)
              || (node.funcname === 'call' && node.args[1].type === 'func' && node.args[1].funcname === 'list' && node.args[1].args.length === 0)
              || (node.funcname === 'apply' && node.args[1].type === 'root' && node.args[1].rhs.length === 0))
          && node.args[0].type === 'lookup')
}

function getEvalVar (node) {
  return node.args[0].varname
}

function makeEvalVar (name) {
  return { type: 'func',
           funcname: 'eval',
           args: [{ type: 'lookup',
                    varname: name }] }
}

function isPlainSymExpr (node) {
  return typeof(node) === 'object' && node.type === 'sym' && !(node.bind && node.bind.length && node.bind[0].args && node.bind[0].args.length)
}

// #x# expands to &if{$x}{&eval{$x}}{~x}
function isTraceryExpr (node, makeSymbolName) {
  makeSymbolName = makeSymbolName || defaultMakeSymbolName
  return typeof(node) === 'object' && node.type === 'cond'
    && node.test.length === 1 && typeof(node.test[0]) === 'object' && node.test[0].type === 'lookup'
    && node.t.length === 1 && isEvalVar (node.t[0])
    && node.f.length === 1 && isPlainSymExpr (node.f[0])
    && node.test[0].varname.toLowerCase() === node.t[0].args[0].varname.toLowerCase()
    && node.test[0].varname.toLowerCase() === makeSymbolName (node.f[0]).toLowerCase()
}

function makeTraceryExpr (name) {
  return { type: 'cond',
           test: [{ type: 'lookup', varname: name }],
           t: [makeEvalVar (name)],
           f: [{ type: 'sym', name: name }] }
}

function traceryVarName (traceryNode) {
  return traceryNode.test[0].varname.toLowerCase()
}

// &prob{p}{x}{y} expands to &if{&lt{&random{1}}{p}}{x}{y}
function isProbExpr (node) {
  return typeof(node) === 'object' && node.type === 'cond'
    && node.test.length === 1 && typeof(node.test[0]) === 'object' && node.test[0].type === 'function' && node.test[0].funcname === 'lt' && node.test[0].args.length === 2
    && typeof(node.test[0].args[0]) === 'object' && node.test[0].args[0].type === 'function' && node.test[0].args[0].funcname === 'random' && node.test[0].args[0].args.length === 1
    && typeof(node.test[0].args[0].args[0]) === 'string' && node.test[0].args[0].args[0] === '1'
}

// &accept{x} expands to $accept=&quote{$x}
// similarly &reject{x}, &status{x}, and &footer{x}
function isQuoteAssignKeywordExpr (node) {
  return isQuoteAssignExpr (node)
    && (node.varname === 'accept' || node.varname === 'reject' || node.varname === 'status' || node.varname === 'footer')
}

function isQuoteAssignExpr (node) {
  return typeof(node) === 'object' && node.type === 'assign' && !node.local
    && node.value.length === 1 && node.value[0].type === 'func' && node.value[0].funcname === 'quote'
}

function getQuoteAssignRhsNode (node) {
  return node.value[0]
}

function getQuoteAssignRhs (node) {
  return getQuoteAssignRhsNode(node).args
}

// &tag{x} expands to $tags={$tags x}
function isTagExpr (node) {
  return typeof(node) === 'object' && node.type === 'assign' && !node.local
    && node.varname === 'tags'
    && node.value.length > 2
    && node.value[0].type === 'lookup' && node.value[0].varname === 'tags'
    && node.value[1] === ' '
}

function getTagExprRhs (node) {
  return node.value.slice(2)
}

// &meter{x}{y}    expands to &push$meters&list{&value{x}&strictquote&math{y}
// &meter{x}{y}{z} expands to &push$meters&list{&value{x}&strictquote&math{y}&strictquote{z}}
function isMeterExpr (node) {
  return typeof(node) === 'object' && node.type === 'func' && node.funcname === 'push'
    && node.args[0].args[0].varname === 'meters'
    && typeof(node.args[1]) === 'object' && node.args[1].type === 'func' && node.args[1].funcname === 'list'
    && (node.args[1].args[0].args.length === 2 || node.args[1].args[0].args.length === 3)
    && typeof(node.args[1].args[0].args[1]) === 'object' && node.args[1].args[0].args[1].type === 'func'
    && node.args[1].args[0].args[1].funcname === 'strictquote' && node.args[1].args[0].args[1].args.length === 1
    && typeof(node.args[1].args[0].args[1].args[0]) === 'object' && node.args[1].args[0].args[1].args[0].type === 'func'
    && node.args[1].args[0].args[1].args[0].funcname === 'math'
    && (node.args[1].args[0].args.length === 2
        || (typeof(node.args[1].args[0].args[2]) === 'object' && node.args[1].args[0].args[2].type === 'func'
            && node.args[1].args[0].args[2].funcname === 'strictquote'))
}

function getMeterIcon (node) {
  return node.args[1].args[0].args[0]
}

function getMeterLevel (node) {
  return node.args[1].args[0].args[1].args[0].args
}

function getMeterStatus (node) {
  return node.args[1].args[0].args.length === 3 ? node.args[1].args[0].args[2].args : ''
}

// &layout{x,y}{args}
function isLayoutExpr (node) {
  return typeof(node) === 'object' && node.type === 'func' && node.funcname === 'layout'
}

function getLayoutCoord (node) {
  return node.args[0]
}

function getLayoutContentNode (node) {
  return node.args[1]
}

function getLayoutContent (node) {
  var content = getLayoutContentNode (node)
  return (typeof(content) === 'object' && content.type === 'func' && content.funcname === 'quote'
          ? content.args
          : [content])
}

// &layout{x,y}&link{src}{target}

function isLinkExpr (node) {
    return typeof(node) === 'object' && node.type === 'func' && node.funcname === 'link'
}

function getLinkText (node) {
  return node.args[0]
}

function getLinkTargetRhsNode (node) {
  return node.args[1]
}

function getLinkTargetRhs (node) {
  return getLinkTargetRhsNode(node).args
}

function isLayoutLinkExpr (node) {
  return isLayoutExpr(node) && getLayoutContent(node).length === 1 && isLinkExpr(getLayoutContent(node)[0])
}

function getLayoutLink (node) {
  return getLayoutContent(node)[0]
}

// $var=&layout{X,Y}{...}
function isLayoutAssign (node) {
  return typeof(node) === 'object' && node.type === 'assign' && !node.local && !node.visible && node.value.length === 1 && isLayoutExpr(node.value[0])
}

function getLayoutExpr (node) {
  return node.value[0]
}

// &placeholder$var{X,Y} or &placeholder~sym{X,Y}
function isPlaceholderExpr (node) {
  return typeof(node) === 'object' && node.type === 'func' && node.funcname === 'placeholder'
}

function getPlaceholderNode (node) {
  return node.args[0].args[0]
}

function getPlaceholderCoord (node) {
  return node.args[1]
}

// Misc text rendering
function makeFuncArgTree (pt, args, makeSymbolName, forceBraces, allowNakedSymbol) {
  var noBraces = !forceBraces && args.length === 1 && (args[0].type === 'func' || args[0].type === 'lookup' || args[0].type === 'alt' || (allowNakedSymbol && isPlainSymExpr(args[0])))
  return [noBraces ? '' : leftBraceChar, pt.makeRhsTree (args, makeSymbolName), noBraces ? '' : rightBraceChar]
}

function escapeString (text) {
  return text.replace(/[\$&\~#\{\}\[\]\|\\]/g,function(m){return'\\'+m})
}

function makeMathExpr (pt, args, op, makeSymbolName) {
  return [makeMathTree (pt, args[0], makeSymbolName), ' ', op, ' ', makeMathTree (pt, args[1], makeSymbolName)]
}
  
function makeMathTree (pt, tok, makeSymbolName) {
  if (typeof(tok) !== 'string' && tok.type === 'func') {
    switch (tok.funcname) {
    case 'add': return makeMathExpr (pt, tok.args, '+', makeSymbolName)
    case 'subtract': return makeMathExpr (pt, tok.args, '-', makeSymbolName)
    case 'multiply': return makeMathExpr (pt, tok.args, '*', makeSymbolName)
    case 'divide': return makeMathExpr (pt, tok.args, '/', makeSymbolName)
    case 'value':
      if (tok.args.length === 1)
        return ['(', makeMathTree (pt, tok.args[0], makeSymbolName), ')']
    default:
      break
    }
  }
  return makeRhsTree.call (pt, [tok], makeSymbolName)
}

function makeRhsText (rhs, makeSymbolName) {
  return makeString (this.makeRhsTree (rhs, makeSymbolName))
}

function makeRhsTree (rhs, makeSymbolName, nextSiblingIsAlpha) {
  var pt = this
  makeSymbolName = makeSymbolName || defaultMakeSymbolName
  return stripFooter(rhs).map (function (tok, n) {
    var result
    if (typeof(tok) === 'string')
      result = escapeString (tok)
    else {
      var nextTok = (n < rhs.length - 1) ? rhs[n+1] : undefined
      var nextIsAlpha = !!(typeof(nextTok) === 'undefined'
                           ? nextSiblingIsAlpha
                           : (typeof(nextTok) === 'string' && nextTok.match(/^[A-Za-z0-9_]/)))
      switch (tok.type) {
      case 'unquote':
        result = tok.text
        break
      case 'root':
        result = pt.makeRhsTree (tok.rhs, makeSymbolName)
        break
      case 'lookup':
        result = (nextIsAlpha
                  ? [varChar, [leftBraceChar, tok.varname, rightBraceChar]]
                  : [varChar, tok.varname])
	break
      case 'assign':
        if (isQuoteAssignKeywordExpr (tok))
          result = [funcChar, tok.varname, [leftBraceChar, pt.makeRhsTree(getQuoteAssignRhs(tok),makeSymbolName), rightBraceChar]]
        else if (isTagExpr (tok))
          result = [funcChar, 'tag', [leftBraceChar, pt.makeRhsTree(getTagExprRhs(tok),makeSymbolName), rightBraceChar]]
	else if (isLayoutExpr (tok))
          result = [funcChar, 'xy', [leftBraceChar, getLayoutCoord(tok), rightBraceChar], [leftBraceChar, pt.makeRhsTree (getLayoutContent(tok), makeSymbolName), rightBraceChar]]
	else if (isLayoutAssign (tok)) {
	  var content = getLayoutContent(getLayoutExpr(tok))
          result = [leftSquareBraceChar, tok.varname, '@', getLayoutCoord(getLayoutExpr(tok)), '=>']
	    .concat (content.length === 1 && typeof(content[0]) === 'object' && content[0].type === 'alt'
		     ? content[0].opts.map (makeOptTree.bind(pt,makeSymbolName,content[0].opts.length))
		     : pt.makeRhsTree(content,makeSymbolName))
	    .concat ([rightSquareBraceChar])
        } else {
          var assign = [varChar, tok.varname, (tok.visible ? ':' : '') + assignChar, [leftBraceChar, pt.makeRhsTree(tok.value,makeSymbolName), rightBraceChar]]
          if (tok.local)
            result = [funcChar, 'let'].concat (assign, [[leftBraceChar, pt.makeRhsTree(tok.local,makeSymbolName), rightBraceChar]])
          else
            result = assign
        }
	break
      case 'alt':
        result = [leftSquareBraceChar,
                  tok.opts.map (makeOptTree.bind(pt,makeSymbolName,tok.opts.length)),
                  rightSquareBraceChar]
	break
      case 'rep':
        result = [funcChar, 'rep', makeFuncArgTree (pt, tok.unit, makeSymbolName), [leftBraceChar, tok.min + (tok.max !== tok.min ? (',' + tok.max) : ''), rightBraceChar]]
	break
      case 'cond':
        var isTracery = isTraceryExpr (tok, makeSymbolName), isProb = isProbExpr (tok)
        result = (isTracery
                  ? [traceryChar, tok.test[0].varname, traceryChar]
                  : [(isProb ? ['prob',tok.test.args[1]] : ['if',tok.test]),
		     [isProb ? '' : 'then',tok.t],
		     [isProb ? '' : 'else',tok.f]].reduce (function (memo, keyword_arg, n) {
                       return memo.concat ([(n ? '' : funcChar) + keyword_arg[0], [leftBraceChar, pt.makeRhsTree (keyword_arg[1], makeSymbolName), rightBraceChar]])
                     }, []))
        break;
      case 'func':
        if (isMeterExpr (tok)) {
          var status = getMeterStatus (tok)
          result = [funcChar, 'meter',
                    [leftBraceChar, pt.makeRhsTree ([getMeterIcon (tok)], makeSymbolName), rightBraceChar],
                    [leftBraceChar, pt.makeRhsTree (getMeterLevel (tok), makeSymbolName), rightBraceChar],
                    status ? [leftBraceChar, pt.makeRhsTree (status, makeSymbolName), rightBraceChar] : ' ']
        } else
          switch (funcType (tok.funcname)) {
          case 'layout':
            result = [funcChar, tok.funcname].concat ([[getLayoutCoord(tok)], getLayoutContent(tok)].map (function (args) { return makeFuncArgTree (pt, args, makeSymbolName, true) }))
            break
          case 'link':
            result = [funcChar, tok.funcname].concat ([[tok.args[0]], tok.args[1].args].map (function (args) { return makeFuncArgTree (pt, args, makeSymbolName, true) }))
            break
          case 'reveal':
            result = [funcChar, tok.funcname].concat (tok.args.map (function (arg) { return makeFuncArgTree (pt, [arg], makeSymbolName, true) }))
            break
          case 'placeholder':
            result = [funcChar, tok.funcname].concat ([tok.args[0].args, [tok.args[1]]].reduce (function (arr, args, n) { return (n || args.length
                                                                                                                                 ? arr.concat ([makeFuncArgTree (pt, args, makeSymbolName, n > 0, n === 0)])
                                                                                                                                  : arr.concat ([[pt.leftBraceChar, pt.rightBraceChar]])) }, []))
            break
          case 'parse':
            result = [funcChar, tok.funcname].concat ([tok.args[0].args, [tok.args[1]]].map (function (args) { return makeFuncArgTree (pt, args, makeSymbolName, nextIsAlpha) }))
            break
          case 'apply':
            result = [funcChar, tok.funcname].concat (tok.args.map (function (arg) { return makeFuncArgTree (pt, [arg], makeSymbolName, nextIsAlpha) }))
            break
          case 'push':
            result = [funcChar, tok.funcname, varChar, tok.args[0].args[0].varname].concat (tok.args.length > 1 ? [makeFuncArgTree (pt, tok.args.slice(1), makeSymbolName, nextIsAlpha)] : (nextIsAlpha ? [' '] : []))
            break
          case 'match':
            result = [funcChar, tok.funcname, '/', tok.args[0], '/', pt.makeRhsTree ([tok.args[1]], makeSymbolName, nextIsAlpha)]
              .concat (tok.args.slice(2).map (function (arg, n) { return makeFuncArgTree (pt, n>0 ? arg.args : [arg], makeSymbolName, nextIsAlpha) }))
            break
          case 'map':
          case 'reduce':
            result = [funcChar, tok.funcname, (tok.args[0].varname === defaultMapVar ? '' : [varChar, tok.args[0].varname, ':']), makeFuncArgTree (pt, tok.args[0].value, makeSymbolName)]
              .concat (tok.funcname === 'reduce'
                       ? [varChar, tok.args[0].local[0].varname, '=', makeFuncArgTree (pt, tok.args[0].local[0].value, makeSymbolName), makeFuncArgTree (pt, tok.args[0].local[0].local[0].args, makeSymbolName, nextIsAlpha)]
                       : [makeFuncArgTree (pt, tok.args[0].local[0].args, makeSymbolName, nextIsAlpha)])
            break
          case 'vars':
            result = [funcChar, tok.funcname]
            break
          case 'call':
            result = [funcChar, tok.funcname, makeFuncArgTree (pt, [tok.args[0]], makeSymbolName)].concat (makeArgList.call (pt, tok.args, 1, makeSymbolName))
            break
          case 'quote':
            result = [funcChar, tok.funcname, makeFuncArgTree (pt, tok.args, makeSymbolName, tok.funcname === 'unquote' || nextIsAlpha)]
            break
          case 'math':
            result = [funcChar, tok.funcname, [leftBraceChar, makeMathTree (pt, tok.args[0], makeSymbolName, nextIsAlpha), rightBraceChar]]
            break
          default:
	    var sugaredName = pt.makeSugaredName (tok, makeSymbolName, nextIsAlpha)
            if (sugaredName) {
	      result = sugaredName
            } else {
              result = [funcChar, tok.funcname, makeFuncArgTree (pt, tok.args, makeSymbolName, nextIsAlpha)]
            }
            break
          }
	break
      case 'alt_sampled':
      case 'rep_sampled':
        break
      default:
      case 'sym':
        if (tok.method === 'get' || tok.method === 'set') {
          result = [funcChar, 'x' + tok.method, [symChar, ((nextIsAlpha || tok.user)
                                                           ? [leftBraceChar, makeSymbolName(tok), rightBraceChar]
                                                           : makeSymbolName(tok))]]
        } else {
          var hasArgList = tok.bind && tok.bind.length && tok.bind[0] && tok.bind[0].type === 'func' && tok.bind[0].funcname === 'list'
          var hasNonemptyArgList = hasArgList && tok.bind[0].args.length
          var isApply = tok.bind && !hasArgList
          result = (isApply
                    ? [funcChar + 'xapply' + symChar, makeSymbolName(tok), makeFuncArgTree (pt, tok.bind, nextIsAlpha)]
                    : (((nextIsAlpha && !hasNonemptyArgList) || tok.user)
                       ? [symChar, [leftBraceChar, makeSymbolName(tok), rightBraceChar]]
                       : (hasNonemptyArgList ? [funcChar] : []).concat ([symChar, makeSymbolName(tok)], [makeArgList.call (pt, tok.bind, 0, makeSymbolName)])))
        }
	break
      }
    }
    return result
  })
}

function makeOptTree (makeSymbolName, nOpts, opt, n) {
  var optTree = this.makeRhsTree (opt, makeSymbolName)
  if (n === 0 && optTree.length && typeof(optTree[0]) === 'string')
    optTree[0] = optTree[0].replace (/(:|=>)/g, function (_m, g) { return '\\' + g })
  return [optTree].concat (n < nOpts - 1 ? [pipeChar] : [])
}

function makeArgList (args, n, makeSymbolName) {
  var pt = this
  return (args && args.length && args[n].args && args[n].args.length
          ? args[n].args.map (function (arg) { return [leftBraceChar].concat (pt.makeRhsTree ([arg], makeSymbolName)).concat ([rightBraceChar]) })
          : [])
}

function makeSugaredName (funcNode, makeSymbolName, nextIsAlpha) {
  var name, sugaredName, prefixChar
  makeSymbolName = makeSymbolName || defaultMakeSymbolName
  if (funcNode.args.length === 1 && typeof(funcNode.args[0]) === 'object') {
    if (funcNode.args[0].type === 'sym') {
      name = makeSymbolName(funcNode.args[0])
      prefixChar = symChar
    } else if (funcNode.args[0].type === 'lookup') {
      name = funcNode.args[0].varname
      prefixChar = varChar
    }
    if (name) {
      name = name.toLowerCase()
      var s
      if (funcNode.funcname === 'cap' && name.match(/[a-z]/))
        s = name.replace(/[a-z]/,function(c){return c.toUpperCase()})
      else if (funcNode.funcname === 'uc' && name.match(/[a-z]/))
        s = name.toUpperCase()
      if (s)
        sugaredName = nextIsAlpha ? [prefixChar, [leftBraceChar, s, rightBraceChar]] : [prefixChar, s]
    }
  }
  return sugaredName
}

var defaultSummaryLen = 64
function summarize (text, summaryLen) {
  summaryLen = summaryLen || defaultSummaryLen
  return text.replace(/^\s*/,'').substr (0, summaryLen)
}
function summarizeExpansion (expansion, summaryLen) {
  return this.summarize (this.makeExpansionText ({ node: expansion }), summaryLen)
}
function summarizeRhs (rhs, makeSymbolName, summaryLen) {
  return this.summarize (this.makeRhsText(rhs,makeSymbolName), summaryLen)
}

function defaultMakeSymbolName (node) {
  return (node.user ? (node.user + '/') : '') + node.name
}

function throwSymbolError (method, config) {
  throw new Error ('unhandled method (' + method + ') for symbol ' + symChar + (config.symbolName || config.node.name))
}

function syncPromiseResolve() {
  // returns a dummy Promise-like (thenable) object that will call the next then'd Promise or function immediately
  var result = Array.prototype.splice.call (arguments, 0)
  if (result.length === 1 && result[0] && typeof(result[0].then) === 'function')  // if we're given one result & it looks like a Promise, return that
    return result[0]
  return { result: result,  // for debugging inspection
           then:
           function (next) {  // next can be a function or another thenable
             if (typeof(next.then) === 'function')  // thenable?
               return next
             // next is a function, so call it
             var nextResult = next.apply (next, result)
             if (nextResult && typeof(nextResult.then) !== 'undefined')  // thenable?
               return nextResult
             // create a Promise-like wrapper for the result
             return syncPromiseResolve (nextResult)
           },
           catch: function (errorCallback) { /* errorCallback will never be called */ } }
}

function makeSyncResolver (config, callback) {
  return function() { return syncPromiseResolve (callback.apply (config, arguments)) }
}

function makeSyncResolverMap (config, obj) {
  var result = {}
  Object.keys(obj).forEach (function (key) { result[key] = makeSyncResolver (config, obj[key]) })
  return result
}

function makeSyncConfig (config) {
  return extend ({},
                 config,
                 { sync: true,
                   before: (config.beforeSync
                            ? makeSyncResolverMap (config, config.beforeSync)
                            : config.before),
                   after: (config.afterSync
                           ? makeSyncResolverMap (config, config.afterSync)
                           : config.after),
                   expand: (config.expandSync
                            ? makeSyncResolver (config, config.expandSync)
                            : (config.expand || throwSymbolError.bind(null,'expand'))),
                   get: (config.getSync
                         ? makeSyncResolver (config, config.getSync)
                         : (config.get || throwSymbolError.bind(null,'get'))),
                   set: (config.setSync
                         ? makeSyncResolver (config, config.setSync)
                         : (config.set || throwSymbolError.bind(null,'set'))) })
}

function makeRhsExpansionSync (config) {
  var result
  this.makeRhsExpansionPromise (makeSyncConfig (config))
    .then (function (expansion) {
      result = expansion
    })
  return result
}

function makeExpansionSync (config) {
  var result
  this.makeExpansionPromise (makeSyncConfig (config))
    .then (function (expansion) {
      result = expansion
    })
  return result
}

function textReducer (expansion, childExpansion) {
  var leftVal = expansion.value, rightVal = childExpansion.value
  var leftText = expansion.text, rightText = childExpansion.text
  var value = (typeof(leftVal) === 'undefined'
               ? (typeof(rightVal) === 'undefined'
                  ? rightText
                  : rightVal)
               : (typeof(leftVal) === 'string'
                  ? (leftVal + (typeof(rightVal) === 'undefined'
                                ? rightText
                                : makeString(rightVal)))
                  : (leftVal.concat ((typeof(rightVal) === 'undefined' || typeof(rightVal) === 'string')
                                     ? [rightText]
                                     : rightVal))))
  return extend (expansion,
                 childExpansion,
                 { text: leftText + rightText,
                   value: value,
                   tree: expansion.tree.concat (childExpansion.tree),
                   nodes: expansion.nodes + childExpansion.nodes })
}

function listReducer (expansion, childExpansion) {
  var leftVal = expansion.value, rightVal = childExpansion.value
  var leftText = expansion.text, rightText = childExpansion.text
  var value = leftVal.concat ((typeof(rightVal) === 'undefined' || typeof(rightVal) === 'string')
                              ? [rightText]
                              : [rightVal])
  return extend (expansion,
                 childExpansion,
                 { text: leftText + rightText,
                   value: value,
                   tree: expansion.tree.concat (childExpansion.tree),
                   nodes: expansion.nodes + childExpansion.nodes })
}

function mapReducer (expansion, childExpansion, config) {
  var pt = this
  var mapRhs = config.mapRhs
  var mapVarName = config.mapVarName

  return makeAssignmentPromise.call (pt,
                                     extend ({},
                                             config,
                                             { reduce: textReducer,
                                               init: {} }),
                                     [[mapVarName, [childExpansion.value || childExpansion.text]]],
                                     pt.sampleParseTree (mapRhs, config))
    .then (function (mappedChildExpansion) {
      return listReducer.call (pt, expansion, mappedChildExpansion, config)
    })
}

function forReducer (expansion, childExpansion, config) {
  var pt = this
  var mapRhs = config.mapRhs
  var mapVarName = config.mapVarName

  return makeAssignmentPromise.call (pt,
                                     extend ({},
                                             config,
                                             { reduce: textReducer,
                                               init: {} }),
                                     [[mapVarName, [childExpansion.value || childExpansion.text]]],
                                     pt.sampleParseTree (mapRhs, config))
    .then (function (mappedChildExpansion) {
      return expansion
    })
}

function filterReducer (expansion, childExpansion, config) {
  var pt = this
  var mapRhs = config.mapRhs
  var mapVarName = config.mapVarName

  return makeAssignmentPromise.call (pt,
                                     extend ({},
                                             config,
                                             { reduce: textReducer,
                                               init: {} }),
                                     [[mapVarName, [childExpansion.value || childExpansion.text]]],
                                     pt.sampleParseTree (mapRhs, config))
    .then (function (mappedChildExpansion) {
      return isTruthy (mappedChildExpansion.text) ? listReducer.call (pt, expansion, childExpansion, config) : expansion
    })
}

function reduceReducer (expansion, childExpansion, config) {
  var pt = this
  var mapVarName = config.mapVarName
  var resultVarName = config.resultVarName
  var resultRhs = config.resultRhs

  return makeAssignmentPromise.call (pt,
                                     extend ({},
                                             config,
                                             { reduce: textReducer,
                                               init: {} }),
                                     [[mapVarName, [childExpansion.value || childExpansion.text]],
                                      [resultVarName, [expansion.value || expansion.text]]],
                                     pt.sampleParseTree (resultRhs, config))
}

// makeRhsExpansionPromise is the main method for asynchronously expanding a template
// that may already have been partially expanded using sampleParseTree.
function makeRhsExpansionPromise (config) {
  var pt = this
  var rhs = config.rhs || this.sampleParseTree (config.parsedRhsText || parseRhs (config.rhsText), config)
  var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
  var maxLength = config.maxLength || pt.maxLength
  var maxNodes = config.maxNodes || pt.maxNodes
  var reduce = config.reduce || textReducer
  var makeExpansionPromise = config.makeExpansionPromise || pt.makeExpansionPromise
  var init = extend ({ text: '',
                       vars: config.vars,
                       tree: [],
                       nodes: 0 },
                     config.init)
  return rhs.reduce (function (promise, child) {
    return promise.then (function (expansion) {
      if ((expansion.text && expansion.text.length >= maxLength)
          || (expansion.nodes && expansion.nodes >= maxNodes)) {
        return expansion
      }
      return makeExpansionPromise.call (pt,
                                        extend ({},
                                                config,
                                                { node: child,
                                                  vars: expansion.vars }))
        .then (function (childExpansion) {
          return reduce.call (pt, expansion, childExpansion, config)
        })
    })
  }, resolve (init))
}

function makeRhsExpansionPromiseForConfig (config, resolve, rhs, contextKey) {
  var pt = this, atLimit = false
  var newConfig = extend ({},
                          config,
                          { rhs: rhs,
                            depth: extend ({},
                                           config.depth || {}) })

  var totalDepth = newConfig.totalDepth || 0
  var maxTotalDepth = Math.min (config.maxDepth || pt.maxDepth)
  if (totalDepth >= maxTotalDepth) {
    atLimit = true
  }
  newConfig.totalDepth = totalDepth + 1

  if (contextKey && !atLimit) {
    var recursionDepth = newConfig.depth[contextKey] || 0
    var maxRecursionDepth = Math.min (config.maxRecursion || pt.maxRecursion)
    if (recursionDepth >= maxRecursionDepth)
      atLimit = true
    newConfig.depth[contextKey] = recursionDepth + 1
  }

  if (atLimit) {
    return resolve ({ text: '',
                      tree: [],
                      vars: config.vars,
                      nodes: 0 })
  }

  return this.makeRhsExpansionPromise (newConfig)
}

function handlerPromise (args, resolvedPromise, handler) {
  var pt = this
  var types = Array.prototype.slice.call (arguments, 3)
  var promise = resolvedPromise
  if (handler)
    types.forEach (function (type) {
      if (handler[type]) {
        promise = promise.then (handler[type].apply (pt, args))
      }
    })
  return promise
}

function nlpWrap (text) {
  text = text.replace (/^[ \t]*\./, '0.')  // ugh, nlp doesn't recognize '.5' as '0.5'
  return nlp(text)
}

function toNumber (text) {
  return nlpWrap(text).values().numbers()[0] || 0
}

function cloneItem (item) {
  return (typeof(item) === 'undefined'
          ? undefined
          : (typeof(item) === 'string'
             ? item
             : (isArray(item)
                ? item.map(cloneItem)
                : (typeof(item) === 'object'
                   ? Object.keys(item).sort().map (function (key) { return [key,cloneItem(item[key])] })
                   : item.toString()))))
}

function makeArray (item) {
  return (item
          ? (typeof(item) === 'string'
             ? [item]
             : cloneItem(item))
          : [])
}

function makeString (item) {
  return (item
          ? (typeof(item) === 'string'
             ? item
             : (isArray(item)
                ? item
                : item.rhs)
             .map(makeString).join(''))
          : '')
}

function makeQuoted (item, prev) {
  var result
  if (typeof(item) === 'string')
    result = (typeof(prev) === 'string' ? (funcChar + ',') : '') + escapeString(item)
  else if (item) {
    var prevChild
    result = (funcChar + leftBraceChar
              + item.map (function (child, n) {
                var childQuoted = makeQuoted (child, prevChild)
                prevChild = child
                return childQuoted
              }).join('') + rightBraceChar)
  } else
    result = ''
  return result
}

function shuffleArray (a, rng) {
  for (var n = 0; n < a.length - 1; ++n) {
    var m = n + Math.floor (rng() * (a.length - n))
    var tmp = a[n]
    a[n] = a[m]
    a[m] = tmp
  }
  return a
}

// pseudoRotateArray moves first item to somewhere in the back half
function pseudoRotateArray (a, rng) {
  var halfLen = a.length / 2, insertAfter = Math.ceil(halfLen) + Math.floor (rng() * Math.floor(halfLen))
  var result = a.slice(1)
  result.splice (insertAfter, 0, a[0])
  return result
}

function makeAlternation (item) {
  return (item
          ? (typeof(item) === 'string'
             ? item
             : (item.length > 1
                ? (leftSquareBraceChar + item.map(makeAlternation).join(pipeChar) + rightSquareBraceChar)
                : (item.length ? makeAlternation(item[0]) : '')))
          : '')
}

function valuesEqual (a, b) {
  if (typeof(a) !== typeof(b))
    return false
  if (typeof(a) === 'string')
    return a === b
  if (a.length !== b.length)
    return false
  return a.reduce (function (equal, a_item, n) {
    return equal && valuesEqual (a_item, b[n])
  }, true)
}

function makeGroupVarName (n) { return varChar + n }

var varFunction = {
  push: function (name, varVal, l, r, lv, rv, config) {
    varVal[name] = makeArray(lv).concat (makeArray(rv))
  },
  pop: function (name, varVal, l, lv, config) {
    var a = makeArray(lv)
    varVal[name] = a
    return a.pop()
  },
  unshift: function (name, varVal, l, r, lv, rv, config) {
    varVal[name] = makeArray(rv).concat (makeArray(lv))
  },
  shift: function (name, varVal, l, lv, config) {
    var a = makeArray (lv)
    varVal[name] = a
    return a.shift()
  },
  inc: function (name, varVal, l) {
    varVal[name] = binaryFunction.add (l, '1')
  },
  dec: function (name, varVal, l) {
    varVal[name] = binaryFunction.subtract (l, '1')
  }
}

var regexFunction = {
  match: function (regex, text, expr, config) {
    var pt = this
    var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
    var expansion = { text: '', vars: config.vars, nodes: 1, tree: [], value: [] }
    var promise = resolve (expansion)
    var match
    while (match = regex.exec (text)) {
      promise = (function (match) {
	return promise.then (function (expansion) {
          var sampledExprTree = pt.sampleParseTree (expr, config)
          return makeAssignmentPromise.call (pt, config, match.map (function (group, n) { return [makeGroupVarName(n), [group]] }), sampledExprTree)
            .then (function (exprExpansion) {
              return listReducer (expansion, exprExpansion, config)
            })
	})
      }) (match)
      if (!regex.global)
        break
    }
    return promise
  },
  replace: function (regex, text, expr, config) {
    var pt = this
    var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
    var expansion = { text: '', vars: config.vars, nodes: 1, tree: [] }
    var promise = resolve (expansion)
    var match, nextIndex = 0, endText = text
    while (match = regex.exec (text)) {
      promise = (function (match) {
	var skippedText = text.substr (nextIndex, match.index - nextIndex)
	nextIndex = match.index + match[0].length
	endText = text.substr (nextIndex)
	return promise.then (function (expansion) {
          var sampledExprTree = pt.sampleParseTree (expr, config)
          return makeAssignmentPromise.call (pt, config, match.map (function (group, n) { return [makeGroupVarName(n), [group]] }), sampledExprTree)
            .then (function (exprExpansion) {
              return textReducer (textReducer (expansion, { text: skippedText, nodes: 0 }), exprExpansion)
            })
	})
      }) (match)
      if (!regex.global)
        break
    }
    return promise.then (function() {
      return textReducer (expansion, { text: endText, nodes: 0 })
    })
  },
  split: function (regex, text, _expr, config) {
    var pt = this
    var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
    var split = text.split (regex)
    var expansion = { text: makeString (split), vars: config.vars, nodes: 1, value: split }
    return resolve (expansion)
  },
  grep: function (regex, list, _expr, config) {
    var pt = this
    var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
    var grepped = list.filter (regex.test.bind (regex))
    var expansion = { text: makeString (grepped), vars: config.vars, nodes: 1, value: grepped }
    return resolve (expansion)
  }
}

var lazyBinaryPredicate = {
  // if these return a defined value, the corresponding binaryFunction will return that value after expanding the first argument
  and: function (value) { return isTruthy(value) ? undefined : falseVal },
  or: function (value) { return isTruthy(value) ? value : undefined },
};

var binaryFunction = {
  same: function (l, r, lv, rv) {
    return valuesEqual (lv, rv) ? (isTruthy(l) ? lv : trueVal) : falseVal
  },
  and: function (l, r) {
    return isTruthy(l) && isTruthy(r) ? (l + r) : falseVal
  },
  or: function (l, r) {
    return isTruthy(l) ? l : r
  },
  add: function (l, r) {
    var lVals = nlpWrap(l).values()
    return binaryFunction.or (lVals.length ? lVals.add(toNumber(r)).out() : r, zeroVal)
  },
  subtract: function (l, r) {
    var lVals = nlpWrap(l).values()
    return binaryFunction.or (lVals.length ? lVals.subtract(toNumber(r)).out() : r, zeroVal)
  },
  multiply: function (l, r) {
    return (toNumber(l) * toNumber(r)).toString()
  },
  divide: function (l, r) {
    return (toNumber(l) / toNumber(r)).toString()
  },
  pow: function (l, r) {
    return Math.pow (toNumber(l), toNumber(r)).toString()
  },
  gt: function (l, r) {
    return nlpWrap(l).values().greaterThan(toNumber(r)).out()
  },
  lt: function (l, r) {
    return nlpWrap(l).values().lessThan(toNumber(r)).out()
  },
  eq: function (l, r) {
    return toNumber(l) === toNumber(r) ? binaryFunction.or (binaryFunction.or (l, r), 'eq') : falseVal
  },
  neq: function (l, r) {
    return toNumber(l) === toNumber(r) ? falseVal : binaryFunction.or (binaryFunction.or (l, r), 'neq')
  },
  leq: function (l, r) {
    return binaryFunction.or (binaryFunction.eq(l,r), binaryFunction.lt(l,r))
  },
  geq: function (l, r) {
    return binaryFunction.or (binaryFunction.eq(l,r), binaryFunction.gt(l,r))
  },
  min: function (l, r, lv, rv) {
    return isTruthy (binaryFunction.leq(l,r)) ? lv : rv
  },
  max: function (l, r, lv, rv) {
    return isTruthy (binaryFunction.geq(l,r)) ? lv : rv
  },
  cat: function (l, r, lv, rv) {
    return makeArray(lv).concat (makeArray(rv))
  },
  prepend: function (l, r, lv, rv) {
    return [cloneItem(lv)].concat (makeArray(rv))
  },
  append: function (l, r, lv, rv) {
    return makeArray(lv).concat ([cloneItem(rv)])
  },
  join: function (l, r, lv, rv) {
    return makeArray(lv).join (r)
  },
  nth: function (l, r, lv, rv) {
    var i = Math.floor (toNumber(l)), a = makeArray(rv)
    return (i < 0 || i >= a.length) ? '' : a[i]
  },
  indexof: function (l, r, lv, rv) {
    var idx = makeArray(rv).findIndex (function (element) {
      return valuesEqual (element, lv)
    })
    return idx >= 0 ? idx.toString() : falseVal
  },
  parse: function (l, r, lv, rv, config) {
    if (!unableToParse (this, config, r)) {
      try {
        return Chomsky.parseInside (this, extend ({}, config, { root: l,
                                                                text: r,
                                                                maxSubsequenceLength: config.maxSubsequenceLength || this.maxSubsequenceLength }))
          .then (function (parse) {
            return parse ? makeArray(parse) : ''
          })
      } catch (e) {
        if (config.verbose > 1 || true)
          console.warn (e)
        else
          console.warn ('(error during parse)')
      }
    }
    var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
    return resolve('')
  },
  assonance: function (l, r, lv, rv, config) {
    var textToPhonemes = config.textToPhonemes || textToWords
    var lPhones = textToPhonemes (l), rPhones = textToPhonemes (r)
    var lWords = lPhones.length, rWords = rPhones.length
    var match = 0
    while (match < lWords && match < rWords && lPhones[lWords-match-1] === rPhones[rWords-match-1])
      ++match;
    return (match === lWords && match === rWords ? '' : match) + ''
  },
  layout: function (l, r, lv, rv) {
    return rv
  },
  placeholder: function (l, r, lv, rv) {
    return []
  },
}

// funcType(funcname) returns the function that is the canonical example of how funcname's arguments are rendered
function funcType (funcname) {
  if (funcname === 'reduce' || funcname === 'vars' || funcname === 'math' || funcname === 'parse' || funcname === 'placeholder' || funcname === 'reveal' || funcname === 'layout')
    return funcname
  if (funcname === 'link')
    return 'link'
  if (funcname === 'call' || funcname === 'xcall')
    return 'call'
  if (binaryFunction[funcname] || funcname === 'apply' || funcname === 'xapply')
    return 'apply'
  if (varFunction[funcname])
    return 'push'
  if (regexFunction[funcname])
    return 'match'
  if (funcname === 'map' || funcname === 'filter' || funcname === 'numsort' || funcname === 'lexsort')
    return 'map'
  if (funcname === 'strictquote' || funcname === 'quote' || funcname === 'unquote')
    return 'quote'
  return 'list'
}

function unableToParse (pt, config, text) {
  return !(config.enableParse || pt.enableParse) || text.length > (config.maxParseLength || pt.maxParseLength)
}

function makeRhsExpansionReducer (pt, config, reduce, init) {
  var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
  return makeRhsExpansionPromiseForConfig.bind (pt,
                                                extend ({},
                                                        config,
                                                        { reduce: reduce,
                                                          init: init }),
                                                resolve)
}

function reduceQuasiquote (pt, config, rhs) {
  return makeRhsExpansionReducer (pt,
                                  extend ({},
                                          config,
                                          { makeExpansionPromise: makeQuasiquoteExpansionPromise }),
                                  quasiquoteReducer,
                                  []) (rhs)
}

function quasiquoteReducer (expansion, childExpansion, config, resolve) {
  return extend (expansion,
                 childExpansion,
                 { tree: expansion.tree.concat (childExpansion.tree),
                   nodes: expansion.nodes + childExpansion.nodes })
}

function makeQuasiquoteExpansionPromise (config) {
  var pt = this
  var node = config.node
  var varVal = config.vars || {}
  var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
  var expansion = { text: '', vars: varVal, nodes: 1 }
  function addExpansionNodes (x) { x.nodes += expansion.nodes; return extend (expansion, x) }
  if (node) {
    if (typeof(node) === 'string') {
      expansion.text = node
      expansion.tree = [node]
      return resolve (expansion)
    } else if (node.type === 'func' && node.funcname === 'quote') {
      config = extend ({}, config, { quoteLevel: config.quoteLevel + 1 })
    } else if (node.type === 'func' && node.funcname === 'unquote') {
      config = extend ({}, config, { quoteLevel: config.quoteLevel - 1 })
      if (config.quoteLevel <= 0)
        return makeRhsExpansionReducer (pt, extend (config, { makeExpansionPromise: null }), textReducer, {}) (node.args)
        .then (function (unquoteExpansion) {
          unquoteExpansion.tree = [{ type: 'unquote', text: unquoteExpansion.text }]
          return addExpansionNodes (unquoteExpansion)
        })
    }
  }
  var nodeCopy = extend ({}, node)
  return nodeArgKeys.reduce (function (promise, rhsKey) {
    var rhsVal = node[rhsKey]
    return (rhsVal
            ? promise.then (function() {
              return reduceQuasiquote (pt, config, rhsVal)
                .then (function (rhsCopy) {
                  nodeCopy[rhsKey] = rhsCopy.tree
                  expansion.nodes += rhsCopy.nodes
                })
            })
            : promise)
  }, resolve()).then (function() {
    return nodeListArgKeys.reduce (function (promise, optsKey) {
      var optsVal = node[optsKey]
      nodeCopy[optsKey] = []
      if (optsVal)
        optsVal.forEach (function (rhs) {
          promise = promise.then (function() {
            return reduceQuasiquote (pt, config, rhs)
              .then (function (rhsCopy) {
                nodeCopy[optsKey].push (rhsCopy.tree)
                expansion.nodes += rhsCopy.nodes
              })
          })
        })
      return promise
    }, resolve())
  }).then (function() {
    expansion.tree = [nodeCopy]
    return expansion
  })
}

function makeEvalPromise (config, makeSymbolName, evalNode, evalText, argsNodeRhs) {
  var pt = this
  var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
  var makeRhsExpansionPromiseFor = makeRhsExpansionReducer (pt, config, textReducer, {})
  if (typeof(evalNode.evaltext) === 'undefined') {
    evalNode.evaltext = evalText
    evalNode.evaltree = parseRhs (evalText)
    evalNode.value = pt.sampleParseTree (evalNode.evaltree, config)
  } else if (config.validateEvalText) {
    var storedEvalText = pt.makeRhsText (evalNode.evaltree, makeSymbolName)
    if (storedEvalText !== evalText) {
      if (config.invalidEvalTextCallback)
	config.invalidEvalTextCallback (evalNode, storedEvalText, evalText)
      else
        throw new Error ('evaltext mismatch')
    }
  }
  return (argsNodeRhs
          ? (makeRhsExpansionPromiseFor (argsNodeRhs)
             .then (function (argsExpansion) {
               return argsExpansion.value
             }))
          : resolve ([]))
    .then (function (args) {
      args = makeArray (args || [])
      return makeAssignmentPromise.call (pt,
                                         config,
                                         [[makeGroupVarName(0), null, args]]
                                         .concat (args.map (function (arg, n) {
                                           return [makeGroupVarName(n+1), null, arg]
                                         })),
                                         evalNode.value)
    })
}

function makeAssignmentPromise (config, nameValueList, local, visible) {
  var pt = this
  var varVal = config.vars || {}, oldVarVal = {}
  var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
  var expansion = { text: '', vars: varVal, nodes: 1 }
  var promise = resolve()
  nameValueList.forEach (function (nameValue) {
    var name = nameValue[0].toLowerCase(), value = nameValue[1], valueExpansion = nameValue[2]
    oldVarVal[name] = varVal[name]
    promise = promise.then (function() {
      return (typeof(valueExpansion) !== 'undefined'
              ? resolve ({ nodes: 0, value: valueExpansion })
              : makeRhsExpansionReducer (pt, config, textReducer, {}) (value))
    }).then (function (valExpansion) {
      extend (expansion.vars, valExpansion.vars)
      var newValue = valExpansion.value || valExpansion.text
      expansion.vars[name] = newValue
      expansion.nodes += valExpansion.nodes
      if (visible) {
        expansion.value = newValue
        expansion.text = makeString (newValue)
      }
    })
  })
  return promise.then (function() {
    if (local) {
      var localConfig = extend ({}, config, { vars: expansion.vars })
      return (typeof(local) === 'function'
              ? resolve (local (localConfig))
              : (makeRhsExpansionPromiseForConfig.call (pt, localConfig, resolve, local)
                 .then (function (localExpansion) {
                   extend (expansion.vars, localExpansion.vars, oldVarVal)
                   expansion.value = localExpansion.value
                   expansion.text = localExpansion.text
                   expansion.nodes += localExpansion.nodes
                   return expansion
                 }))).then (function (result) {
	           Object.keys(oldVarVal).forEach (function (name) {
	             if (typeof(oldVarVal[name]) === 'undefined')
	               delete expansion.vars[name]
	           })
                   return result
                 })
    } else
      return expansion
  })
}

function makeExpansionPromise (config) {
  var pt = this
  var node = config.node
  var varVal = config.vars || {}
  var depth = config.depth || {}
  var makeSymbolName = config.makeSymbolName || defaultMakeSymbolName
  var rng = config && config.rng ? config.rng : Math.random
  var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
  return handlerPromise ([node, varVal, depth], resolve(), config.before, node.type, 'all')
    .then (function() {
      var expansion = { text: '', vars: varVal, nodes: 1 }
      var expansionPromise = resolve (expansion), promise = expansionPromise
      var makeRhsExpansionPromiseFor = makeRhsExpansionReducer (pt, config, textReducer, {})
      var makeListExpansionPromiseFor = makeRhsExpansionReducer (pt, config, listReducer, { value: [] })
      var makeRhsExpansionPromiseForOwner = function (owner, rhs, contextKey) {
	return makeRhsExpansionReducer (pt, extend ({}, config, { defaultUser: owner }), textReducer, {}) (rhs, contextKey)
      }
      function addExpansionNodes (x) { x.nodes += expansion.nodes; return extend (expansion, x) }
      if (node) {
        if (typeof(node) === 'string') {
          expansion.text = node
        } else {
          switch (node.type) {
          case 'assign':
            promise = makeAssignmentPromise.call (pt, config, [[node.varname, node.value]], node.local, node.visible)
            break

          case 'lookup':
            var name = node.varname.toLowerCase()
            expansion.value = varVal[name] || ''
            expansion.text = makeString (expansion.value)
            node.value = expansion.value  // used by makeParseTree
            break

          case 'cond':
            promise = makeRhsExpansionPromiseFor (node.test)
              .then (function (testExpansion) {
                var testValue = isTruthy (testExpansion.text) ? true : false
                var testResult = testValue ? node.t : node.f
                node.value = testValue  // used by makeParseTree
                node.result = testResult  // used by makeParseTree
                expansion.nodes += testExpansion.nodes
                return makeRhsExpansionPromiseFor (testResult).then (addExpansionNodes)
              })
            break

          case 'func':
            // ensure expansion is reproducible by stashing/retrieving random numbers in node
            var nodeRng = node.rng ? node.rng.shift.bind(node.rng) : rng
            var rngCache = node.rng
            delete node.rng
            config.rngNode = node
            function rngSaver() { var r = nodeRng(); var node = config.rngNode; if (!node.rng) node.rng = []; node.rng.push(r); return r }
            config = extend ({}, config, { rng: rngSaver })
            // dispatch by funcname
	    if (node.funcname === 'strictquote') {
              // quote
              expansion.text = pt.makeRhsText (node.args, makeSymbolName)
            } else if (node.funcname === 'quote') {
              // quasiquote
              promise = reduceQuasiquote (pt, extend ({}, config, { quoteLevel: 1 }), node.args)
                .then (function (quasiquoteExpansion) {
                  addExpansionNodes (quasiquoteExpansion)
                  expansion.text = pt.makeRhsText (quasiquoteExpansion.tree, makeSymbolName)
                  delete expansion.value
                  return expansionPromise
                })
            } else if (node.funcname === 'list') {
              // list
              promise = makeListExpansionPromiseFor (node.args)
                .then (function (listExpansion) {
                  expansion.value = listExpansion.value
                  expansion.text = makeString (expansion.value)
                  return expansionPromise
                })
            } else if (node.funcname === 'json') {
              // json
              promise = makeListExpansionPromiseFor (node.args)
                .then (function (listExpansion) {
                  expansion.text = JSON.stringify (listExpansion.value)
                  return expansionPromise
                })
            } else if (node.funcname === 'map' || node.funcname === 'for') {
              // map/for. first arg is &let$VAR:LIST{&strictquote{EXPR}}
              promise = makeRhsExpansionPromiseFor (node.args[0].value)
                .then (function (listExpansion) {
                  return makeRhsExpansionReducer (pt,
                                                  extend ({},
                                                          config,
                                                          { mapVarName: node.args[0].varname,
                                                            mapRhs: node.args[0].local[0].args }),
                                                  node.funcname === 'map' ? mapReducer : forReducer,
                                                  { value: [] }) (makeArray (listExpansion.value))
                })
            } else if (node.funcname === 'numsort' || node.funcname === 'lexsort') {
              // numsort/lexsort. first arg is &let$VAR:LIST{&strictquote{EXPR}}
              promise = makeRhsExpansionPromiseFor (node.args[0].value)
                .then (function (listExpansion) {
                  var list = makeArray (listExpansion.value)
                  return makeRhsExpansionReducer (pt,
                                                  extend ({},
                                                          config,
                                                          { mapVarName: node.args[0].varname,
                                                            mapRhs: node.args[0].local[0].args }),
                                                  mapReducer,
                                                  { value: [] }) (list)
                    .then (function (weightListExpansion) {
                      var weights = makeArray (weightListExpansion.value).map (node.funcname === 'numsort' ? toNumber : makeString)
                      var indices = list.map (function (_val, n) { return n })
                      var sortedIndices = indices.sort (node.funcname === 'numsort'
                                                        ? function (a, b) { return weights[a] - weights[b] }
                                                        : function (a, b) { return String.prototype.localeCompare.call (weights[a], weights[b]) })
                      extend (expansion.vars, weightListExpansion.vars)
                      expansion.nodes += listExpansion.nodes + weightListExpansion.nodes
                      expansion.value = sortedIndices.map (function (index) { return list[index] })
                      expansion.text = makeString (expansion.value)
                      return expansion
                    })
                })
            } else if (node.funcname === 'filter') {
              // filter. first arg is &let$VAR:LIST{&strictquote{TEST}}
              promise = makeRhsExpansionPromiseFor (node.args[0].value)
                .then (function (listExpansion) {
                  return makeRhsExpansionReducer (pt,
                                                  extend ({},
                                                          config,
                                                          { mapVarName: node.args[0].varname,
                                                            mapRhs: node.args[0].local[0].args }),
                                                  filterReducer,
                                                  { value: [] }) (makeArray (listExpansion.value))
                })
            } else if (node.funcname === 'reduce') {
              // reduce. first arg is &let$VAR:LIST{&let$RESULT:INITIAL{&strictquote{REDUCE}}}
              promise = makeRhsExpansionPromiseFor (node.args[0].value)
                .then (function (listExpansion) {
                  return makeRhsExpansionPromiseFor (node.args[0].local[0].value)
                    .then (function (initExpansion) {
                      return makeRhsExpansionReducer (pt,
                                                      extend ({},
                                                              config,
                                                              { mapVarName: node.args[0].varname,
                                                                resultVarName: node.args[0].local[0].varname,
                                                                resultRhs: node.args[0].local[0].local[0].args }),
                                                      reduceReducer,
                                                      { value: initExpansion.value }) (makeArray (listExpansion.value))
                    })
                })
            } else if (regexFunction[node.funcname]) {
              // regex functions. arguments are (regex, flags, text, expression_to_evaluate)
              promise = makeRhsExpansionPromiseFor ([node.args[0]])
                .then (function (regexArg) {
                  return makeRhsExpansionPromiseFor ([node.args[1]])
                    .then (function (flagsArg) {
                      return makeRhsExpansionPromiseFor ([node.args[2]])
                        .then (function (textArg) {
                          expansion.nodes += regexArg.nodes + flagsArg.nodes + textArg.nodes
                          var arg = node.funcname === 'grep' ? textArg.value : textArg.text
                          return regexFunction[node.funcname].call (pt, new RegExp (regexArg.text, flagsArg.text), arg, node.args.length > 3 ? node.args[3].args : null, config)
                            .then (addExpansionNodes)
                        })
                    })
                })
            } else if (varFunction[node.funcname]) {
              // variable-modifying functions. first argument is &strictquote{$VAR}
              var name = node.args[0].args[0].varname, func = varFunction[node.funcname]
              var isUnary = node.args.length === 1
              var argPromise = (isUnary
                                ? syncPromiseResolve()
                                : makeRhsExpansionPromiseFor ([node.args[1]]))
              promise = argPromise
                .then (function (argExpansion) {
                  return makeRhsExpansionPromiseFor ([node.args[0].args[0]])
                    .then (function (varExpansion) {
                      expansion.nodes += varExpansion.nodes
                      if (isUnary)
                        return func.call (pt, name, varVal, varExpansion.text, varExpansion.value, config)
                      expansion.nodes += argExpansion.nodes
                      return func.call (pt, name, varVal, varExpansion.text, argExpansion.text, varExpansion.value, argExpansion.value, config)
                    })
                }).then (function (funcResult) {
                  if (typeof(funcResult) !== 'undefined') {
                    expansion.value = funcResult
                    expansion.text = makeString (funcResult)
                  }
                  return expansion
                })
            } else if (binaryFunction[node.funcname]) {
              // binary functions
	      var lazyPred = lazyBinaryPredicate[node.funcname]
              promise = makeRhsExpansionPromiseFor ([node.args[0]])
                .then (function (leftArg) {
		  var lazyResult = lazyPred && lazyPred (leftArg.value)
		  if (typeof(lazyResult) !== 'undefined') {
		    expansion.value = lazyResult
		    expansion.text = makeString (lazyResult)
		    return expansionPromise
		  }
                  return makeRhsExpansionPromiseFor ([node.args[1]])
                    .then (function (rightArg) {
                      expansion.nodes += leftArg.nodes + rightArg.nodes
                      return resolve (binaryFunction[node.funcname].call (pt, leftArg.text, rightArg.text, leftArg.value, rightArg.value, config))
                        .then (function (binaryResult) {
                          expansion.value = binaryResult
                          expansion.text = makeString (binaryResult)
                          return expansionPromise
                        })
                    })
                })
            } else if (node.funcname === 'link' || node.funcname === 'reveal') {
              promise = makeRhsExpansionPromiseFor ([node.args[0]])
                .then (function (textArg) {
                  return makeRhsExpansionPromiseFor ([node.args[1]])
                    .then (function (linkArg) {
                      expansion.nodes += textArg.nodes + linkArg.nodes
                      expansion.text = (config.makeLink
                                        ? config.makeLink (textArg, linkArg, node.funcname)
                                        : (funcChar + node.funcname
                                           + leftBraceChar + textArg.text + rightBraceChar
                                           + leftBraceChar + linkArg.text + rightBraceChar))
                      expansion.value = expansion.text
                      return expansionPromise
                    })
                })
	    } else {
              // unary functions
              if (node.funcname === 'call' || node.funcname === 'apply')
                promise = makeRhsExpansionPromiseFor ([node.args[0]])
                .then (function (evalExpansion) {
                  return makeEvalPromise.call (pt, config, makeSymbolName, node, evalExpansion.text, [node.args[1]])
                    .then (addExpansionNodes)
                })
              else
                promise = makeRhsExpansionPromiseFor (node.args)
                .then (function (argExpansion) {
                  var arg = argExpansion.text
                  expansion.nodes += argExpansion.nodes
                  switch (node.funcname) {

                    // eval
                  case 'eval':
                    return makeEvalPromise.call (pt, config, makeSymbolName, node, argExpansion.text, null)
                      .then (addExpansionNodes)
                    break

                    // tree
                  case 'tree':
                    expansion.value = ['root'].concat (makeParseTree (argExpansion.tree))
                    expansion.text = makeString (expansion.value)
                    break

                    // grammar
                  case 'grammar':
                    return Chomsky.makeGrammar (pt, extend ({}, config, { root: arg, normal: true }))
                      .then (function (cfg) {
                        function stateName (state, rank) { return '_' + (state.type === 'start' ? 'start' : rank) }
                        expansion.value = cfg.stateByRank.map (function (state, rank) {
                          return [leftSquareBraceChar,
                                  stateName (state, rank),
                                  '=>',
                                  state.opts.map (function (opt, n) {
                                    return makeOptTree.call (pt, makeSymbolName, state.opts.length, opt.rhs.map (function (node) {
                                      return (node.type === 'term'
                                              ? node.text
                                              : makeTraceryExpr (stateName (cfg.stateByName[node.name], node.rank)))
                                    }), n)
                                  }),
                                  rightSquareBraceChar]
                        })
                          expansion.text = makeString (expansion.value)
                        return expansion
                      }).catch (function (e) {
                        if (config.verbose > 1)
                          console.warn (e)
                        else
                          console.warn ('(error during syntactic analysis)')
                      })
                    break

                    // syntax
                  case 'syntax':
                    node.evaltree = parseRhs (arg)
                    expansion.value = pt.makeRhsTree (node.evaltree, makeSymbolName)
                    expansion.text = makeString (expansion.value)
                    break

                    // parse JSON
                  case 'parsejson':
                    try {
                      expansion.value = cloneItem (JSON.parse (arg))
                      expansion.text = makeString (expansion.value)
                    } catch (e) {
                      // do nothing, bad JSON not our problem, but maybe gripe a little
                      console.warn(e)
                    }
                    break
                    
                    // escape
                  case 'escape':
                    expansion.text = escapeString (arg)
                    break

                    // vars
                  case 'vars':
                    expansion.value = Object.keys (varVal).sort()
                    expansion.text = makeString (expansion.value)
                    break

                    // quotify
                  case 'quotify':
                    expansion.text = makeQuoted (argExpansion.value || argExpansion.text)
                    break

                    // alt
                  case 'alt':
                    expansion.text = makeAlternation (argExpansion.value || argExpansion.text)
                    break

                    // charclass
                  case 'charclass':
                    var range = arg.split('\\-').map (function (c) {
                      return c.replace(/(.)\-(.)/g,function(_m,l,r){
                        var cl = l.charCodeAt(0), cr = r.charCodeAt(0)
                        return [].concat.apply ([], new Array(cr+1-cl)).map (function(_c,n) {
                          return String.fromCharCode (cl + n)
                        }).join('')
                      })
                    }).join('-')
                      .split('')
                      .map (function (c) { return [c] })
                    expansion.text = pt.makeRhsText ([{ type: 'alt',
                                                        opts: range }],
                                                     makeSymbolName)
                    break
                    
                    // strlen, length, reverse, revstr
                  case 'strlen':
                    expansion.text = '' + argExpansion.text.length
                    break

                  case 'length':
                    expansion.text = '' + makeArray (argExpansion.value).length
                    break

                  case 'revstr':
                    expansion.text = argExpansion.text.split('').reverse().join('')
                    break

                  case 'reverse':
                    expansion.value = makeArray (argExpansion.value).reverse()
                    expansion.text = makeString (expansion.value)
                    break

                    // shuffle
                  case 'shuffle':
                    expansion.value = shuffleArray (makeArray (argExpansion.value), rngSaver)
                    expansion.text = makeString (expansion.value)
                    break

                    // bump (pseudo-rotate)
                  case 'bump':
                    expansion.value = pseudoRotateArray (makeArray (argExpansion.value), rngSaver)
                    expansion.text = makeString (expansion.value)
                    break

                    // value, unquote, math: identity functions
                  case 'value':
                  case 'unquote':
                  case 'math':
                    expansion.value = argExpansion.value
                    expansion.text = arg
                    break

                    // not
                  case 'not':
                    expansion.text = isTruthy (arg) ? falseVal : trueVal
                    break

                    // list functions
                  case 'islist':
                    expansion.text = isArray(argExpansion.value) ? JSON.stringify(argExpansion.value) : ''
                    break

                  case 'first':
                    expansion.text = makeString (makeArray (argExpansion.value)[0] || '')
                    break

                  case 'last':
                    var a = makeArray (argExpansion.value)
                    expansion.text = makeString (a[a.length-1] || '')
                    break

                  case 'notfirst':
                    var a = makeArray(argExpansion.value)
                    a.shift()
                    expansion.value = a
                    expansion.text = makeString(a)
                    break

                  case 'notlast':
                    var a = makeArray(argExpansion.value)
                    a.pop()
                    expansion.value = a
                    expansion.text = makeString(a)
                    break

                  case 'iota':
                    var n = toNumber(argExpansion.text)
                    expansion.value = new Array(n).fill(0).map (function (_item, i) { return i.toString() })
                    expansion.text = makeString(expansion.value)
                    break

                  case 'sample':
                    var weights = makeArray (argExpansion.value).map (toNumber)
                    var totalWeight = weights.reduce (function (total, w) { return total + w }, 0)
                    var w = totalWeight * rngSaver(), i = 0
                    while (i + 1 < weights.length && (w -= weights[i]) > 0)
                      ++i;
                    expansion.text = i.toString()
                    break

                    // basic text functions
                  case 'cap':
                    expansion.text = capitalize (arg)
                    break
                  case 'uc':
                    expansion.text = arg.toUpperCase()
                    break
                  case 'lc':
                    expansion.text = arg.toLowerCase()
                    break
                  case 'plural':
                    expansion.text = pluralForm(arg)
                    break
                  case 'a':
                    expansion.text = indefiniteArticle (arg)
                    break

                    // nlp: nouns
                  case 'nlp_plural':  // alternative to built-in plural
                    expansion.text = nlp(arg).nouns(0).toPlural().text()
                    break
                  case 'singular':
                    expansion.text = nlp(arg).nouns(0).toSingular().text()
                    break
                  case 'topic':
                    var nlpArg = nlp(arg)
                    expansion.text = nlpArg.topics(0).text() || nlpArg.nouns(0).text()
                    break
                  case 'person':
                    var nlpArg = nlp(arg)
                    expansion.text = nlp(arg).people(0).text() || nlpArg.nouns(0).text()
                    break
                  case 'place':
                    var nlpArg = nlp(arg)
                    expansion.text = nlp(arg).places(0).text() || nlpArg.nouns(0).text()
                    break

                    // nlp: verbs
                  case 'past':
                    expansion.text = nlp(arg).verbs(0).toPastTense().text()
                    break
                  case 'present':
                    expansion.text = nlp(arg).verbs(0).toPresentTense().text()
                    break
                  case 'future':
                    expansion.text = nlp(arg).verbs(0).toFutureTense().text()
                    break
                  case 'infinitive':
                    expansion.text = nlp(arg).verbs(0).toInfinitive().text()
                    break
                  case 'gerund':
                    expansion.text = nlp(arg).verbs(0).toGerund().text()
                    break
                  case 'adjective':
                    expansion.text = nlp(arg).verbs(0).asAdjective()[0] || ''
                    break
                  case 'negative':
                    expansion.text = nlp(arg).verbs(0).toNegative().text()
                    break
                  case 'positive':
                    expansion.text = nlp(arg).verbs(0).toPositive().text()
                    break

                    // nlp: numbers
                  case 'random':
                    expansion.text = (rngSaver() * toNumber(arg)) + ''
                    break

                  case 'floor':
                    expansion.text = Math.floor (toNumber(arg)) + ''
                    break

                  case 'ceil':
                    expansion.text = Math.ceil (toNumber(arg)) + ''
                    break

                  case 'round':
                    expansion.text = Math.round (toNumber(arg)) + ''
                    break

                  case 'abs':
                    expansion.text = Math.abs (toNumber(arg))
                    break

                  case 'percent':
                    expansion.text = Math.round (100 * toNumber(arg)) + '%'
                    break

                  case 'wordnum':
                    expansion.text = nlp(arg).values().toText().out()
                    break

                  case 'dignum':
                    expansion.text = nlp(arg).values().toNumber().out()
                    break

                  case 'ordinal':
                    expansion.text = nlp(arg).values().toOrdinal().out()
                    break

                  case 'cardinal':
                    expansion.text = nlp(arg).values().toCardinal().out()
                    break

                    // comment
                  case 'comment':
                    break
                    
                    // default
                  default:
                    expansion.text = arg
                    break
                  }
                }).then (function() {
                  return expansion
                })
            }
            break
          case 'sym':
            var symbolExpansionPromise
            var expr = symChar + (node.name || node.id)
            var method = node.method || 'expand'
	    var symOwner = node.user || config.defaultUser || pt.defaultUser
            if (!node.rhs && config[method])
              symbolExpansionPromise = handlerPromise ([node, varVal, depth], resolve(), config.before, method)
              .then (function() {
                return (node.bind
                        ? (makeRhsExpansionPromiseFor (node.bind)
                           .then (function (bindExpansion) {
                             expansion.nodes += bindExpansion.nodes
                             return makeArray (bindExpansion.value || bindExpansion.text)
                           }))
                        : resolve([]))
                  .then (function (args) {
                    return makeAssignmentPromise
                      .call (pt,
                             extend ({}, config, { vars: varVal }),
                             args.map (function (arg, n) { return [makeGroupVarName (n + 1), null, arg] })
                             .concat ([[makeGroupVarName(0),
                                        [{ type: 'func',
                                           funcname: 'list',
                                           args: args.map (function (_arg, n) { return { type: 'lookup', varname: makeGroupVarName (n + 1) } }) }]]]),
                             function (localConfig) {
                               // these callbacks should return rhs's, i.e. arrays
                               // config.expand should return the sampled tree, calling sampleParseTree() if necessary
                               // config.get should return a single-element list
                               // config.set should return an empty list
                               return config[method] (extend ({},
                                                              localConfig,
                                                              { node: node }))
                             })
                      .then (function (rhs) {
                        return (node.bind
                                ? args.reduce (function (result, arg, n) {
                                  return [{ type: 'assign',
                                            varname: makeGroupVarName (n + 1),
                                            value: [arg],
                                            local: result }]
                                }, [{ type: 'assign',
                                      varname: makeGroupVarName (0),
                                      value: args,
                                      local: rhs }])
                                : rhs)
                      })
                  })
              }).then (function (rhs) {
                node.rhs = rhs
                return handlerPromise ([node, varVal, depth, rhs], resolve(), config.after, method)
              })
            else
              symbolExpansionPromise = resolve()
            promise = symbolExpansionPromise.then (function() {
              return makeRhsExpansionPromiseForOwner (symOwner, node.rhs || [], expr)
		.then (addExpansionNodes)
            })
            break
          case 'root':
          case 'alt_sampled':
            promise = makeRhsExpansionPromiseFor (node.rhs || [])
              .then (addExpansionNodes)
            break
          case 'rep_sampled':
            promise = makeRhsExpansionPromiseFor ((node.reps || []).reduce (function (all, rep) { return all.concat(rep) }, []))
              .then (addExpansionNodes)
            break
          default:
            break
          }
        }
      }
      return promise
    }).then (function (expansion) {
      // clean up vars
      Object.keys(expansion.vars).forEach (function (name) {
	if (!expansion.vars[name])
	  delete expansion.vars[name]
      })
      // call post-expansion handler
      return handlerPromise ([node, varVal, depth, expansion], resolve(), config.after, 'all', node.type)
        .then (function() { return extend (expansion, { tree: node }) })
    })
}

function makeRhsExpansionText (config) {
  return this.makeRhsExpansionSync (config).text
}

function makeExpansionText (config) {
  return this.makeExpansionSync (config).text
}

function finalVarVal (config) {
  var node = config.node, initVarVal = config.initVarVal
  var varVal = {}
  if (initVarVal)
    extend (varVal, initVarVal)
  this.makeExpansionText ({ node: node,
                            vars: varVal,
                            DEBUG_vars: varVal,  // DEBUG
			    makeSymbolName: config.makeSymbolName })
  return varVal
}

function makeParseTree (rhs) {
  return rhs.reduce (function (tree, node) {
    if (typeof(node) === 'string')
      tree.push (node)
    else if (isTraceryExpr (node))
      tree.push ([traceryChar + traceryVarName(node) + traceryChar].concat (makeParseTree (node.value ? node.result[0].value : node.result[0].rhs)))
    else if (node.type === 'func' && node.funcname === 'eval' && node.args.length === 1 && node.args[0].type === 'lookup')
      tree.push ([funcChar + varChar + node.args[0].varname].concat (makeParseTree (node.value)))
    else if (node.type === 'sym')
      tree.push ([(node.method === 'get' ? (funcChar + 'xget') : '') + symChar + node.name].concat (makeParseTree (node.rhs)))
    else if (node.type === 'lookup')
      tree.push ([varChar + node.varname, makeString (node.value)])
    else if (node.type === 'alt_sampled')
      tree.push ([pipeChar].concat (makeParseTree (node.rhs)))
    else if (typeof(node) === 'string')
      tree.push (node)
    else if (node.expansion && node.expansion.text)
      tree.push (node.expansion.text)
    else
      console.error ("Can't handle node in makeParseTree", node)
    return tree
  }, [])
}

// English grammar helper functions

// Verb conjugation
// person can be 's1', 's2', 's3', 'p1', 'p2', 'p3'
//  for singular/plural and 1st/2nd/3rd person
// gender can be 'm' (Male), 'f' (Female), 'n' (Neuter), 'i' (Inanimate)
//  if 'n', will use 'They' form; if 'i' (or blank), will use 'It' form
var representativePronoun = { s1: 'i', s2: 'you', s3n: 'they', s3: 'it', p1: 'we', p2: 'you', p3: 'they' }
function makeRepresentativePronoun (person, gender) {
  return representativePronoun[person + (gender || '')] || representativePronoun[person]
}

function conjugate (infinitive, person, gender) {
  var form
  var rp = makeRepresentativePronoun (person, gender)
  switch (infinitive) {
  case 'have': form = (rp === 'it') ? 'has' : 'have'; break
  case 'be': form = (rp === 'i') ? 'am' : (rp === 'it' ? 'is' : 'are'); break
  case 'do': form = (rp === 'it') ? 'does' : 'do'; break
  case 'go': form = (rp === 'it') ? 'goes' : 'go'; break
  default: form = (rp === 'it') ? infinitive.replace (/.\b/i, function(c){return c + (c === 's' ? 'es' : 's')}) : infinitive; break
  }
  return form
}

function was (person, gender) {
  var rp = makeRepresentativePronoun (person, gender)
  return (rp === 'i' || rp === 'it') ? 'was' : 'were'
}

var irregularPastParticiple = { arise: "arisen", babysit: "babysat", be: "been", beat: "beaten", become: "become", bend: "bent", begin: "begun", bet: "bet", bind: "bound", bite: "bitten", bleed: "bled", blow: "blown", break: "broken", breed: "bred", bring: "brought", broadcast: "broadcast", build: "built", buy: "bought", catch: "caught", choose: "chosen", come: "come", cost: "cost", cut: "cut", deal: "dealt", dig: "dug", do: "done", draw: "drawn", drink: "drunk", drive: "driven", eat: "eaten", fall: "fallen", feed: "fed", feel: "felt", fight: "fought", find: "found", fly: "flown", forbid: "forbidden", forget: "forgotten", forgive: "forgiven", freeze: "frozen", get: "gotten", give: "given", go: "gone", grow: "grown", hang: "hung", have: "had", hear: "heard", hide: "hidden", hit: "hit", hold: "held", hurt: "hurt", keep: "kept", know: "known", lay: "laid", lead: "led", leave: "left", lend: "lent", let: "let", lie: "lain", light: "lit", lose: "lost", make: "made", mean: "meant", meet: "met", pay: "paid", put: "put", quit: "quit", read: "read", ride: "ridden", ring: "rung", rise: "risen", run: "run", say: "said", see: "seen", sell: "sold", send: "sent", set: "set", shake: "shaken", shine: "shone", shoot: "shot", show: "shown", shut: "shut", sing: "sung", sink: "sunk", sit: "sat", sleep: "slept", slide: "slid", speak: "spoken", spend: "spent", spin: "spun", spread: "spread", stand: "stood", steal: "stolen", stick: "stuck", sting: "stung", strike: "struck", swear: "sworn", sweep: "swept", swim: "swum", swing: "swung", take: "taken", teach: "taught", tear: "torn", tell: "told", think: "thought", throw: "thrown", understand: "understood", wake: "woken", wear: "worn", win: "won", withdraw: "withdrawn", write: "written" }
function pastParticiple (infinitive) {
  return irregularPastParticiple[infinitive] || infinitive.replace (/.\b/i, function(c){return c + (c === 'e' ? 'd' : 'ed')})
}

var irregularPastSimple = { arise: "arose", babysit: "babysat", be: "was", beat: "beat", become: "became", bend: "bent", begin: "began", bet: "bet", bind: "bound", bite: "bit", bleed: "bled", blow: "blew", break: "broke", breed: "bred", bring: "brought", broadcast: "broadcast", build: "built", buy: "bought", catch: "caught", choose: "chose", come: "came", cost: "cost", cut: "cut", deal: "dealt", dig: "dug", do: "did", draw: "drew", drink: "drank", drive: "drove", eat: "ate", fall: "fell", feed: "fed", feel: "felt", fight: "fought", find: "found", fly: "flew", forbid: "forbade", forget: "forgot", forgive: "forgave", freeze: "froze", get: "got", give: "gave", go: "went", grow: "grew", hang: "hung", have: "had", hear: "heard", hide: "hid", hit: "hit", hold: "held", hurt: "hurt", keep: "kept", know: "knew", lay: "laid", lead: "led", leave: "left", lend: "lent", let: "let", lie: "lay", light: "lit", lose: "lost", make: "made", mean: "meant", meet: "met", pay: "paid", put: "put", quit: "quit", read: "read", ride: "rode", ring: "rang", rise: "rose", run: "ran", say: "said", see: "saw", sell: "sold", send: "sent", set: "set", shake: "shook", shine: "shone", shoot: "shot", show: "showed", shut: "shut", sing: "sang", sink: "sank", sit: "sat", sleep: "slept", slide: "slid", speak: "spoke", spend: "spent", spin: "spun", spread: "spread", stand: "stood", steal: "stole", stick: "stuck", sting: "stung", strike: "struck", swear: "swore", sweep: "swept", swim: "swam", swing: "swung", take: "took", teach: "taught", tear: "tore", tell: "told", think: "thought", throw: "threw", understand: "understood", wake: "woke", wear: "wore", win: "won", withdraw: "withdrew", write: "wrote" }
function pastSimple (infinitive) {
  return irregularPastParticiple[infinitive] || infinitive.replace (/.\b/i, function(c){return c + (c === 'e' ? 'd' : 'ed')})
}

// Pronouns
var genderedNominative = { s1: 'i', s2: 'you', s3m: 'he', s3f: 'she', s3n: 'they', s3i: 'it', p1: 'we', p2: 'you', p3: 'they' },
    genderedOblique = { s1: 'me', s2: 'you', s3m: 'him', s3f: 'her', s3n: 'them', s3i: 'it', p1: 'us', p2: 'you', p3: 'them' },
    genderedPossessiveDeterminer = { s1: 'my', s2: 'your', s3m: 'his', s3f: 'her', s3n: 'their', s3i: 'its', p1: 'our', p2: 'your', p3: 'their' },
    genderedPossessivePronoun = { s1: 'mine', s2: 'yours', s3m: 'his', s3f: 'hers', s3n: 'theirs', s3i: 'its', p1: 'ours', p2: 'yours', p3: 'theirs' },
    genderedReflexive = { s1: 'myself', s2: 'yourself', s3m: 'himself', s3f: 'herself', s3n: 'themself', s3i: 'itself', p1: 'ourselves', p2: 'yourselves', p3: 'themselves' }

function getPronoun (table, person, gender) { return table[person + (gender || 'n')] || table[person] }

function nominative (person, gender) { return getPronoun (genderedNominative, person, gender) }
function oblique (person, gender) { return getPronoun (genderedOblique, person, gender) }
function possessiveDeterminer (person, gender) { return getPronoun (genderedPossessiveDeterminer, person, gender) }
function possessivePronoun (person, gender) { return getPronoun (genderedPossessivePronoun, person, gender) }
function reflexive (person, gender) { return getPronoun (genderedReflexive, person, gender) }

var possessivePronoun = { i: 'my', you: 'your', he: 'his', she: 'her', they: 'their', it: 'its', we: 'our' }
function possessiveApostrophe(noun) {
  var lc = noun.toLowerCase()
  return possessivePronoun[lc] ? possessivePronoun[lc] : (noun + (looksLikePlural(noun) ? "'" : "'s"))
}

// Articles
function indefiniteArticle (nounPhrase) {
  var article = nounPhrase.match(/^[^A-Za-z]*[aeiou]/i) ? 'an' : 'a'
  return article + ' ' + nounPhrase
}

// Misc.
function looksLikePlural(noun) {
  return noun.match(/[b-hj-np-rtv-z][s]$/i)
}

function lessOrFewer(noun) {
  return (looksLikePlural(noun) ? 'fewer' : 'less') + ' ' + noun
}

function guessPerson(noun) {
  return looksLikePlural(noun) ? 'p3' : 's3'
}

function nPlurals(num,singular) {
  if (num === 1)
    return '1 ' + singular
  return num + ' ' + this.pluralForm (singular)
}

// this list needs beefing up...
var irregularPlural = {
  addendum: 'addenda', alga: 'algae', alumnus: 'alumni', amoeba: 'amoebae', antenna: 'antennae', bacterium: 'bacteria', cactus: 'cacti', curriculum: 'curricula', datum: 'data', fungus: 'fungi', genus: 'genera', larva: 'larvae', memorandum: 'memoranda', stimulus: 'stimuli', syllabus: 'syllabi', vertebra: 'vertebrae',
  echo: 'echoes', embargo: 'embargoes', hero: 'heroes', potato: 'potatoes', tomato: 'tomatoes', torpedo: 'torpedoes', veto: 'vetoes', volcano: 'volcanoes',
  child: 'children', dormouse: 'dormice', foot: 'feet', goose: 'geese', louse: 'lice', man: 'men', mouse: 'mice', ox: 'oxen', tooth: 'teeth', woman: 'women',
  axis: 'axes', analysis: 'analyses', basis: 'bases', crisis: 'crises', diagnosis: 'diagnoses', ellipsis: 'ellipses', emphasis: 'emphases', hypothesis: 'hypotheses', neurosis: 'neuroses', oasis: 'oases', paralysis: 'paralyses', parenthesis: 'parentheses', thesis: 'theses',
  appendix: 'appendices', index: 'indices', matrix: 'matrices',
  barracks: 'barracks', deer: 'deer', fish: 'fish', gallows: 'gallows', means: 'means', offspring: 'offspring', series: 'series', sheep: 'sheep', species: 'species'
}

function pluralForm (singular) {
  var wm = this
  var match
  if ((match = singular.match(/^([\s\S]*)\b(\w+)(\s*)$/)) && irregularPlural[match[2]])
    return match[1] + matchCase (match[2], irregularPlural[match[2]]) + match[3]
  else if (singular.match(/(ch|sh|s|x|z)\s*$/i))
    return singular.replace(/(ch|sh|s|x|z)(\s*)$/i, function (match, ending, spacer) { return ending + matchCase(ending,'es') + spacer })
  else if (singular.match(/[aeiou]y\s*$/i))
    return singular.replace (/(y)(\s*)$/i, function (match, y, spacer) { return matchCase(y,'ys') + spacer })
  else if (singular.match(/y\s*$/i))
    return singular.replace (/(y)(\s*)$/i, function (match, y, spacer) { return matchCase(y,'ies') + spacer })
  else if (singular.match(/fe?\s*$/i))
    return singular.replace (/(fe?)(\s*)$/i, function (match, fe, spacer) { return matchCase(fe,'ves') + spacer })
  else if (singular.match(/o\s*$/i))
    return singular.replace (/(o)(\s*)$/i, function (match, o, spacer) { return matchCase(o,'os') + spacer })
  else if (singular.match(/[a-zA-Z]\s*$/i))
    return singular.replace (/([a-zA-Z])(\s*)$/i, function (match, c, spacer) { return c + matchCase(c,'s') + spacer })
  return singular
}

function matchCase (model, text) {
  return model.match(/[A-Z]/) ? text.toUpperCase() : text
}

// from http://stackoverflow.com/a/8843915
function countSyllables(word) {
  word = word.toLowerCase()
  if (word.length <= 3) return 1
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/i, '')
  word = word.replace(/^y/i, '')
  return word.match(/[aeiouy]{1,2}/gi).length
}

var irregularComparative = { good: 'better', well: 'better', bad: 'worse', far: 'farther', little: 'less', many: 'more' }
function makeComparativeAdjective(adj) {
  if (adj.match(/^[a-z]+\b./i)) return 'more ' + adj  // hyphenated or multiple words
  var lc = adj.toLowerCase()
  if (irregularComparative[lc]) return irregularComparative[lc]
  switch (countSyllables(adj)) {
  case 1: return (adj.match(/e$/) ? (adj+'r') : (adj.match(/ed$/) ? ('more '+adj) : (adj+((adj.match(/[b-df-hj-np-tv-z][aeiou][b-df-hj-np-tv-z]$/) ? adj.charAt(adj.length-1) : '') + 'er'))))
  case 2: return adj.match(/y$/) ? adj.replace(/y$/,'ier') : (adj.match(/le$/) ? (adj+'r') : (adj.match(/(er|ow)$/) ? (adj+'er') : ('more '+adj)))
  default: return 'more '+adj
  }
}

// Adjective -> Adverb
var adj2adv = { 'public': 'publicly' }
var adjectivesWithSameAdverb = ['early','fast','hard','high','late','near','straight','wrong','well']
adjectivesWithSameAdverb.forEach (function (adj) { adj2adv[adj] = adj })
function makeAdverb (adjective) {
  if (adj2adv[adjective]) return adj2adv[adjective]
  else if (adjective.match(/ic$/i)) return adjective + 'ally'
  else if (adjective.match(/le$/i)) return adjective.replace(/e$/i,'y')
  else if (adjective.match(/y$/i)) return adjective.replace(/y$/i,'ily')
  return adjective + 'ly'
}

function makeComparativeAdverb (adverb) {
  if (adj2adv[adverb] === adverb)
    return adverb + 'er'
  return 'more ' + adverb
}

// Capitalization of first letters in sentences
function capitalize (text) {
  return text
    .replace (/^([^A-Za-z]*)([a-z])/, function (m, g1, g2) { return g1 + g2.toUpperCase() })
    .replace (/([\.\!\?]\s*)([a-z])/g, function (m, g1, g2) { return g1 + g2.toUpperCase() })
}

// ordinal suffices http://stackoverflow.com/a/13627586
function ordinal(i) {
  var j = i % 10,
      k = i % 100;
  if (j == 1 && k != 11) {
    return i + "st";
  }
  if (j == 2 && k != 12) {
    return i + "nd";
  }
  if (j == 3 && k != 13) {
    return i + "rd";
  }
  return i + "th";
}

// Text to words
function textToWords (text) {
  return text.toLowerCase()
    .replace(/[^a-z\s]/g,'')  // these are the phoneme characters we keep
    .replace(/\s+/g,' ').replace(/^ /,'').replace(/ $/,'')  // collapse all runs of space & remove start/end space
    .split(' ');
}

// Externally exposed functions
module.exports = {
  // config
  maxDepth: 100,
  maxRecursion: 3,
  maxReps: 10,
  maxNodes: 1000,
  maxLength: 1000,

  enableParse: false,
  maxParseLength: undefined,
  maxSubsequenceLength: 100,

  // parsing
  RhsParser: RhsParser,
  parseRhs: parseRhs,
  parseTextDefs: parseTextDefs,
  makeRoot: makeRoot,

  // compromise
  nlp: nlp,
  
  // footers
  makeFooter: makeFooter,
  stripFooter: stripFooter,
  addFooter: addFooter,
  
  // parse tree constants
  symChar: symChar,
  varChar: varChar,
  funcChar: funcChar,
  leftBraceChar: leftBraceChar,
  rightBraceChar: rightBraceChar,
  leftSquareBraceChar: leftSquareBraceChar,
  rightSquareBraceChar: rightSquareBraceChar,
  pipeChar: pipeChar,
  assignChar: assignChar,
  traceryChar: traceryChar,
  defaultMapVar: defaultMapVar,
  defaultUser: defaultUser,
  
  // parse tree manipulations
  sampleParseTree: sampleParseTree,
  findNodes: findNodes,
  getSymbolNodes: getSymbolNodes,
  parseTreeEmpty: parseTreeEmpty,
  isPlainSymExpr: isPlainSymExpr,
  isTraceryExpr: isTraceryExpr,
  traceryVarName: traceryVarName,
  isProbExpr: isProbExpr,
  isQuoteAssignKeywordExpr: isQuoteAssignKeywordExpr,
  isQuoteAssignExpr: isQuoteAssignExpr,
  getQuoteAssignRhs: getQuoteAssignRhs,
  getQuoteAssignRhsNode: getQuoteAssignRhsNode,
  isTagExpr: isTagExpr,
  getTagExprRhs: getTagExprRhs,
  isMeterExpr: isMeterExpr,
  getMeterIcon: getMeterIcon,
  getMeterLevel: getMeterLevel,
  getMeterStatus: getMeterStatus,
  isLayoutExpr: isLayoutExpr,
  getLayoutCoord: getLayoutCoord,
  getLayoutContent: getLayoutContent,
  getLayoutContentNode: getLayoutContentNode,
  isLayoutAssign: isLayoutAssign,
  getLayoutExpr: getLayoutExpr,
  isLinkExpr: isLinkExpr,
  getLinkText: getLinkText,
  getLinkTargetRhs: getLinkTargetRhs,
  getLinkTargetRhsNode: getLinkTargetRhsNode,
  isLayoutLinkExpr: isLayoutLinkExpr,
  getLayoutLink: getLayoutLink,
  isPlaceholderExpr: isPlaceholderExpr,
  getPlaceholderNode: getPlaceholderNode,
  getPlaceholderCoord: getPlaceholderCoord,
  isEvalVar: isEvalVar,
  getEvalVar: getEvalVar,
  funcType: funcType,

  makeSugaredName: makeSugaredName,
  makeRhsText: makeRhsText,
  makeRhsTree: makeRhsTree,
  makeMathTree: makeMathTree,
  makeExpansionText: makeExpansionText,
  makeRhsExpansionText: makeRhsExpansionText,

  makeExpansionPromise: makeExpansionPromise,
  makeRhsExpansionPromise: makeRhsExpansionPromise,
  makeExpansionSync: makeExpansionSync,
  makeRhsExpansionSync: makeRhsExpansionSync,

  summarize: summarize,
  summarizeRhs: summarizeRhs,
  summarizeExpansion: summarizeExpansion,
  finalVarVal: finalVarVal,

  isTruthy: isTruthy,
  makeString: makeString,
  makeArray: makeArray,
  makeQuoted: makeQuoted,
  escapeString: escapeString,
  toNumber: toNumber,
  
  // English grammar
  conjugate: conjugate,
  was: was,
  pastParticiple: pastParticiple,
  pastSimple: pastSimple,
  possessiveApostrophe: possessiveApostrophe,
  indefiniteArticle: indefiniteArticle,
  lessOrFewer: lessOrFewer,
  makeComparativeAdjective: makeComparativeAdjective,
  makeComparativeAdverb: makeComparativeAdverb,
  makeAdverb: makeAdverb,
  capitalize: capitalize,
  countSyllables: countSyllables,
  pluralForm: pluralForm,
  textToWords: textToWords,
  // general numerics
  ordinal: ordinal,
  nPlurals: nPlurals,
  // general utility
  deepCopy: deepCopy,
  extend: extend,
  isArray: isArray,
  randomIndex: randomIndex,
  randomElement: randomElement,
  nRandomElements: nRandomElements,
  syncPromiseResolve: syncPromiseResolve
}

},{"./chomsky":2,"./rhs":4}],4:[function(require,module,exports){
/*
 * Generated by PEG.js 0.10.0.
 *
 * http://pegjs.org/
 */

"use strict";

function peg$subclass(child, parent) {
  function ctor() { this.constructor = child; }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
}

function peg$SyntaxError(message, expected, found, location) {
  this.message  = message;
  this.expected = expected;
  this.found    = found;
  this.location = location;
  this.name     = "SyntaxError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, peg$SyntaxError);
  }
}

peg$subclass(peg$SyntaxError, Error);

peg$SyntaxError.buildMessage = function(expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return "\"" + literalEscape(expectation.text) + "\"";
        },

        "class": function(expectation) {
          var escapedParts = "",
              i;

          for (i = 0; i < expectation.parts.length; i++) {
            escapedParts += expectation.parts[i] instanceof Array
              ? classEscape(expectation.parts[i][0]) + "-" + classEscape(expectation.parts[i][1])
              : classEscape(expectation.parts[i]);
          }

          return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
        },

        any: function(expectation) {
          return "any character";
        },

        end: function(expectation) {
          return "end of input";
        },

        other: function(expectation) {
          return expectation.description;
        }
      };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function classEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\]/g, '\\]')
      .replace(/\^/g, '\\^')
      .replace(/-/g,  '\\-')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = new Array(expected.length),
        i, j;

    for (i = 0; i < expected.length; i++) {
      descriptions[i] = describeExpectation(expected[i]);
    }

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }
      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ")
          + ", or "
          + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== void 0 ? options : {};

  var peg$FAILED = {},

      peg$startRuleFunctions = { RHS: peg$parseRHS },
      peg$startRuleFunction  = peg$parseRHS,

      peg$c0 = "\\n",
      peg$c1 = peg$literalExpectation("\\n", false),
      peg$c2 = function() { return "\n" },
      peg$c3 = "\\t",
      peg$c4 = peg$literalExpectation("\\t", false),
      peg$c5 = function() { return "\t" },
      peg$c6 = "\\",
      peg$c7 = peg$literalExpectation("\\", false),
      peg$c8 = peg$anyExpectation(),
      peg$c9 = function(escaped) { return escaped },
      peg$c10 = function(args) { return wrapNodes (args) },
      peg$c11 = /^[@~#&$+\-]/,
      peg$c12 = peg$classExpectation(["@", "~", "#", "&", "$", "+", "-"], false, false),
      peg$c13 = function(char) { return char },
      peg$c14 = function(nl) { return addLocation(nl) },
      peg$c15 = "&,",
      peg$c16 = peg$literalExpectation("&,", false),
      peg$c17 = function(tail) { return concatNodes (makeValue([]), tail) },
      peg$c18 = function(head, tail) { return concatNodes (makeValue([head]), tail.length ? tail : [makeValue([])]) },
      peg$c19 = function(head, tail) { return concatNodes (head, tail) },
      peg$c20 = function(head) { return [head] },
      peg$c21 = "",
      peg$c22 = function() { return [] },
      peg$c23 = "&let",
      peg$c24 = peg$literalExpectation("&let", false),
      peg$c25 = function(assigns, scope) { return makeLocalAssignChain (assigns, scope) },
      peg$c26 = "#",
      peg$c27 = peg$literalExpectation("#", false),
      peg$c28 = function(assigns, sym, mods) { return makeLocalAssignChain (assigns, [makeTraceryExpr (sym, mods)]) },
      peg$c29 = "&rep",
      peg$c30 = peg$literalExpectation("&rep", false),
      peg$c31 = "{",
      peg$c32 = peg$literalExpectation("{", false),
      peg$c33 = ",",
      peg$c34 = peg$literalExpectation(",", false),
      peg$c35 = "}",
      peg$c36 = peg$literalExpectation("}", false),
      peg$c37 = function(unit, min, max) { return validRange (min, max) ? makeRep (unit, min, max) : text() },
      peg$c38 = function(unit, min) { return makeRep (unit, min, min) },
      peg$c39 = "&if",
      peg$c40 = peg$literalExpectation("&if", false),
      peg$c41 = "then",
      peg$c42 = peg$literalExpectation("then", false),
      peg$c43 = "else",
      peg$c44 = peg$literalExpectation("else", false),
      peg$c45 = function(testArg, trueArg, falseArg) { return makeConditional (testArg, trueArg, falseArg) },
      peg$c46 = function(testArg, trueArg) { return makeConditional (testArg, trueArg, []) },
      peg$c47 = "&prob",
      peg$c48 = peg$literalExpectation("&prob", false),
      peg$c49 = function(probArg, trueArg, falseArg) { return makeProbExpr (probArg, trueArg, falseArg) },
      peg$c50 = function(sym, args) { return makeSugaredSymbol (sym, makeArgList (args)) },
      peg$c51 = function(sym, args) { return makeSugaredSymbol (sym, args) },
      peg$c52 = function(sym, mods) { return makeTraceryExpr (sym, mods) },
      peg$c53 = function(sym) { return makeGetSymbol (sym) },
      peg$c54 = function(sym, args) { return makeSetSymbol (sym, args) },
      peg$c55 = function(sym) { return makeSugaredSymbol (sym, makeArgList ([])) },
      peg$c56 = "&xcall",
      peg$c57 = peg$literalExpectation("&xcall", false),
      peg$c58 = function(sym) { return sym },
      peg$c59 = "&",
      peg$c60 = peg$literalExpectation("&", false),
      peg$c61 = "&xapply",
      peg$c62 = peg$literalExpectation("&xapply", false),
      peg$c63 = "&xget",
      peg$c64 = peg$literalExpectation("&xget", false),
      peg$c65 = "&xset",
      peg$c66 = peg$literalExpectation("&xset", false),
      peg$c67 = function(sym) { return addLocation (sym) },
      peg$c68 = "~",
      peg$c69 = peg$literalExpectation("~", false),
      peg$c70 = "~{",
      peg$c71 = peg$literalExpectation("~{", false),
      peg$c72 = function(name) { return addLocation ({ name: name }, 'sympos') },
      peg$c73 = "/",
      peg$c74 = peg$literalExpectation("/", false),
      peg$c75 = function(user, name) { return addLocation ({ user: user, name: name }, 'sympos') },
      peg$c76 = function(mod, mods) { return [mod].concat (mods) },
      peg$c77 = ".capitalizeAll",
      peg$c78 = peg$literalExpectation(".capitalizeAll", false),
      peg$c79 = function() { return "uc" },
      peg$c80 = ".capitalize",
      peg$c81 = peg$literalExpectation(".capitalize", false),
      peg$c82 = function() { return "cap" },
      peg$c83 = ".a",
      peg$c84 = peg$literalExpectation(".a", false),
      peg$c85 = function() { return "a" },
      peg$c86 = ".ed",
      peg$c87 = peg$literalExpectation(".ed", false),
      peg$c88 = function() { return "past" },
      peg$c89 = ".s",
      peg$c90 = peg$literalExpectation(".s", false),
      peg$c91 = function() { return "plural" },
      peg$c92 = function(name, varname, list, func) { return makeListFunction (name, varname, list, func) },
      peg$c93 = function(name, list, func) { return makeListFunction (name, defaultListVarName, list, func) },
      peg$c94 = function(name, list) { return makeListFunction (name, defaultListVarName, list, [makeQuote ([makeLookup (defaultListVarName)])]) },
      peg$c95 = "&reduce",
      peg$c96 = peg$literalExpectation("&reduce", false),
      peg$c97 = "=",
      peg$c98 = peg$literalExpectation("=", false),
      peg$c99 = function(varname, list, result, init, func) { return makeReduceFunction (varname, list, result, init, func) },
      peg$c100 = "map",
      peg$c101 = peg$literalExpectation("map", false),
      peg$c102 = "for",
      peg$c103 = peg$literalExpectation("for", false),
      peg$c104 = "filter",
      peg$c105 = peg$literalExpectation("filter", false),
      peg$c106 = "numsort",
      peg$c107 = peg$literalExpectation("numsort", false),
      peg$c108 = "lexsort",
      peg$c109 = peg$literalExpectation("lexsort", false),
      peg$c110 = ":",
      peg$c111 = peg$literalExpectation(":", false),
      peg$c112 = function(name) { return name },
      peg$c113 = function(name, pattern, text, expr) { return makeRegexFunction (name, pattern, text, expr) },
      peg$c114 = function(name, pattern, text) { return makeRegexFunction (name, pattern, text) },
      peg$c115 = "&split",
      peg$c116 = peg$literalExpectation("&split", false),
      peg$c117 = function(text) { return makeRegexFunction ('split', { body: [defaultSplitPattern], flags: [] }, text) },
      peg$c118 = "match",
      peg$c119 = peg$literalExpectation("match", false),
      peg$c120 = "replace",
      peg$c121 = peg$literalExpectation("replace", false),
      peg$c122 = "grep",
      peg$c123 = peg$literalExpectation("grep", false),
      peg$c124 = "split",
      peg$c125 = peg$literalExpectation("split", false),
      peg$c126 = "&unquote",
      peg$c127 = peg$literalExpectation("&unquote", false),
      peg$c128 = function(args) { return makeFunction ('unquote', args) },
      peg$c129 = "&call",
      peg$c130 = peg$literalExpectation("&call", false),
      peg$c131 = function(expr, args) { return makeFunction ('call', [wrapNodes (expr), makeFunction ('list', args.map (wrapNodes))]) },
      peg$c132 = function(lookup, args) { return makeFunction ('call', [lookup, makeFunction ('list', args.map (wrapNodes))]) },
      peg$c133 = "&function",
      peg$c134 = peg$literalExpectation("&function", false),
      peg$c135 = function(args, expr) { return makeDefineFunction (args, expr) },
      peg$c136 = "&function{}",
      peg$c137 = peg$literalExpectation("&function{}", false),
      peg$c138 = function(expr) { return makeDefineFunction ([], expr) },
      peg$c139 = function(head, tail) { return [head].concat (tail) },
      peg$c140 = function(func, left, right) { return makeFunction (func, [wrapNodes (left), wrapNodes (right)]) },
      peg$c141 = "&join",
      peg$c142 = peg$literalExpectation("&join", false),
      peg$c143 = function(left) { return makeFunction ('join', [wrapNodes (left), defaultJoinText]) },
      peg$c144 = function(func, args) { return makeFunction (func, args) },
      peg$c145 = "&rotate",
      peg$c146 = peg$literalExpectation("&rotate", false),
      peg$c147 = function(arg) { return makeRotate (arg) },
      peg$c148 = function(func) { return makeFunction (func, []) },
      peg$c149 = function(func, v, right) { return makeFunction (func, [wrapNodes (v), wrapNodes (right)]) },
      peg$c150 = function(func, right) { return makeFunction (func, [makeStrictQuote ([makeLookup (defaultListVarName)]), wrapNodes (right)]) },
      peg$c151 = function(func, v) { return makeFunction (func, v) },
      peg$c152 = function(func) { return makeFunction (func, [makeStrictQuote ([makeLookup (defaultListVarName)])] ) },
      peg$c153 = "++",
      peg$c154 = peg$literalExpectation("++", false),
      peg$c155 = function(v) { return wrapNodes ([makeFunction ('inc', v)].concat (v[0].args)) },
      peg$c156 = "--",
      peg$c157 = peg$literalExpectation("--", false),
      peg$c158 = function(v) { return wrapNodes ([makeFunction ('dec', v)].concat (v[0].args)) },
      peg$c159 = function(v) { return wrapNodes (v[0].args.concat ([makeFunction ('inc', v)])) },
      peg$c160 = function(v) { return wrapNodes (v[0].args.concat ([makeFunction ('dec', v)])) },
      peg$c161 = "&meter",
      peg$c162 = peg$literalExpectation("&meter", false),
      peg$c163 = function(icon, expr, status) { return makeMeter (icon, expr, status) },
      peg$c164 = function(icon, expr) { return makeMeter (icon, expr) },
      peg$c165 = "&cycle",
      peg$c166 = peg$literalExpectation("&cycle", false),
      peg$c167 = function(v, list) { return makeCycle (v, list, false) },
      peg$c168 = "&playlist",
      peg$c169 = peg$literalExpectation("&playlist", false),
      peg$c170 = function(v, list) { return makeCycle (v, list, true) },
      peg$c171 = "&queue",
      peg$c172 = peg$literalExpectation("&queue", false),
      peg$c173 = function(v, list) { return makeQueue (v, list) },
      peg$c174 = "&imp{",
      peg$c175 = peg$literalExpectation("&imp{", false),
      peg$c176 = "}{",
      peg$c177 = peg$literalExpectation("}{", false),
      peg$c178 = function(num, expr, template) { return makeImportanceSampler (num, expr, template) },
      peg$c179 = "&preserve",
      peg$c180 = peg$literalExpectation("&preserve", false),
      peg$c181 = function(arg) { return makePreserve (arg) },
      peg$c182 = "&rhyme{",
      peg$c183 = peg$literalExpectation("&rhyme{", false),
      peg$c184 = function(num, a, b) { return makeRhyme (a, b, num) },
      peg$c185 = "&rhyme",
      peg$c186 = peg$literalExpectation("&rhyme", false),
      peg$c187 = function(a, b) { return makeRhyme (a, b) },
      peg$c188 = "&math{",
      peg$c189 = peg$literalExpectation("&math{", false),
      peg$c190 = function(math) { return makeFunction ('math', [math]) },
      peg$c191 = "&math{}",
      peg$c192 = peg$literalExpectation("&math{}", false),
      peg$c193 = function() { return makeFunction ('math', []) },
      peg$c194 = "&link",
      peg$c195 = peg$literalExpectation("&link", false),
      peg$c196 = function(text, link) { return makeFunction ('link', [wrapNodes(text), pseudoQuote(link)]) },
      peg$c197 = "&link@",
      peg$c198 = peg$literalExpectation("&link@", false),
      peg$c199 = function(coord, text, link) { return makeLayoutNoQuote (coord, makeFunction ('link', [wrapNodes(text), pseudoQuote(link)])) },
      peg$c200 = "&reveal",
      peg$c201 = peg$literalExpectation("&reveal", false),
      peg$c202 = function(text, link) { return makeFunction ('reveal', [wrapNodes(text), wrapNodes(link)]) },
      peg$c203 = "[[",
      peg$c204 = peg$literalExpectation("[[", false),
      peg$c205 = "]]",
      peg$c206 = peg$literalExpectation("]]", false),
      peg$c207 = function(text) { return makeLinkShortcut (text) },
      peg$c208 = "[",
      peg$c209 = peg$literalExpectation("[", false),
      peg$c210 = "]@",
      peg$c211 = peg$literalExpectation("]@", false),
      peg$c212 = function(text, coord, link) { return makeLayoutNoQuote (coord, makeFunction ('link', [wrapNodes(text), pseudoQuote(link)])) },
      peg$c213 = "]",
      peg$c214 = peg$literalExpectation("]", false),
      peg$c215 = "&layout",
      peg$c216 = peg$literalExpectation("&layout", false),
      peg$c217 = function(coord, arg) { return makeLayoutNoQuote (coord, wrapNodes(arg)) },
      peg$c218 = "&placeholder",
      peg$c219 = peg$literalExpectation("&placeholder", false),
      peg$c220 = function(arg, coord) { return makePlaceholder (arg, coord) },
      peg$c221 = "@",
      peg$c222 = peg$literalExpectation("@", false),
      peg$c223 = function(coord, arg) { return makePlaceholder (arg, coord) },
      peg$c224 = function(r) { return addLocation(r) },
      peg$c225 = function(v) { return [v] },
      peg$c226 = function(s) { return [s] },
      peg$c227 = "{}",
      peg$c228 = peg$literalExpectation("{}", false),
      peg$c229 = ":START",
      peg$c230 = peg$literalExpectation(":START", false),
      peg$c231 = function(coord) { return coord },
      peg$c232 = function(x, comma, y) { return x + comma + y },
      peg$c233 = "&parse",
      peg$c234 = peg$literalExpectation("&parse", false),
      peg$c235 = function(grammar, text) { return makeFunction ('parse', [wrapNodes(grammar), wrapNodes(text)]) },
      peg$c236 = "&grammar",
      peg$c237 = peg$literalExpectation("&grammar", false),
      peg$c238 = function(grammar) { return makeFunction ('grammar', grammar) },
      peg$c239 = "&{",
      peg$c240 = peg$literalExpectation("&{", false),
      peg$c241 = function(args) { return makeFunction ('list', args) },
      peg$c242 = "&makelist",
      peg$c243 = peg$literalExpectation("&makelist", false),
      peg$c244 = function(args) { return makeFunction ('list', args.map (makeValue)) },
      peg$c245 = "&quotelist",
      peg$c246 = peg$literalExpectation("&quotelist", false),
      peg$c247 = function(args) { return makeFunction ('list', args.map (makeStrictQuote)) },
      peg$c248 = "add",
      peg$c249 = peg$literalExpectation("add", false),
      peg$c250 = "subtract",
      peg$c251 = peg$literalExpectation("subtract", false),
      peg$c252 = "multiply",
      peg$c253 = peg$literalExpectation("multiply", false),
      peg$c254 = "divide",
      peg$c255 = peg$literalExpectation("divide", false),
      peg$c256 = "pow",
      peg$c257 = peg$literalExpectation("pow", false),
      peg$c258 = "gt",
      peg$c259 = peg$literalExpectation("gt", false),
      peg$c260 = "geq",
      peg$c261 = peg$literalExpectation("geq", false),
      peg$c262 = "lt",
      peg$c263 = peg$literalExpectation("lt", false),
      peg$c264 = "leq",
      peg$c265 = peg$literalExpectation("leq", false),
      peg$c266 = "eq",
      peg$c267 = peg$literalExpectation("eq", false),
      peg$c268 = "neq",
      peg$c269 = peg$literalExpectation("neq", false),
      peg$c270 = "min",
      peg$c271 = peg$literalExpectation("min", false),
      peg$c272 = "max",
      peg$c273 = peg$literalExpectation("max", false),
      peg$c274 = "same",
      peg$c275 = peg$literalExpectation("same", false),
      peg$c276 = "and",
      peg$c277 = peg$literalExpectation("and", false),
      peg$c278 = "or",
      peg$c279 = peg$literalExpectation("or", false),
      peg$c280 = "cat",
      peg$c281 = peg$literalExpectation("cat", false),
      peg$c282 = "prepend",
      peg$c283 = peg$literalExpectation("prepend", false),
      peg$c284 = "append",
      peg$c285 = peg$literalExpectation("append", false),
      peg$c286 = "join",
      peg$c287 = peg$literalExpectation("join", false),
      peg$c288 = "nth",
      peg$c289 = peg$literalExpectation("nth", false),
      peg$c290 = "indexof",
      peg$c291 = peg$literalExpectation("indexof", false),
      peg$c292 = "apply",
      peg$c293 = peg$literalExpectation("apply", false),
      peg$c294 = "xapply",
      peg$c295 = peg$literalExpectation("xapply", false),
      peg$c296 = "assonance",
      peg$c297 = peg$literalExpectation("assonance", false),
      peg$c298 = "eval",
      peg$c299 = peg$literalExpectation("eval", false),
      peg$c300 = "syntax",
      peg$c301 = peg$literalExpectation("syntax", false),
      peg$c302 = "tree",
      peg$c303 = peg$literalExpectation("tree", false),
      peg$c304 = "jparse",
      peg$c305 = peg$literalExpectation("jparse", false),
      peg$c306 = "escape",
      peg$c307 = peg$literalExpectation("escape", false),
      peg$c308 = "quotify",
      peg$c309 = peg$literalExpectation("quotify", false),
      peg$c310 = "random",
      peg$c311 = peg$literalExpectation("random", false),
      peg$c312 = "floor",
      peg$c313 = peg$literalExpectation("floor", false),
      peg$c314 = "ceil",
      peg$c315 = peg$literalExpectation("ceil", false),
      peg$c316 = "round",
      peg$c317 = peg$literalExpectation("round", false),
      peg$c318 = "abs",
      peg$c319 = peg$literalExpectation("abs", false),
      peg$c320 = "percent",
      peg$c321 = peg$literalExpectation("percent", false),
      peg$c322 = "wordnum",
      peg$c323 = peg$literalExpectation("wordnum", false),
      peg$c324 = "dignum",
      peg$c325 = peg$literalExpectation("dignum", false),
      peg$c326 = "ordinal",
      peg$c327 = peg$literalExpectation("ordinal", false),
      peg$c328 = "cardinal",
      peg$c329 = peg$literalExpectation("cardinal", false),
      peg$c330 = "plural",
      peg$c331 = peg$literalExpectation("plural", false),
      peg$c332 = "singular",
      peg$c333 = peg$literalExpectation("singular", false),
      peg$c334 = "nlp_plural",
      peg$c335 = peg$literalExpectation("nlp_plural", false),
      peg$c336 = "topic",
      peg$c337 = peg$literalExpectation("topic", false),
      peg$c338 = "person",
      peg$c339 = peg$literalExpectation("person", false),
      peg$c340 = "place",
      peg$c341 = peg$literalExpectation("place", false),
      peg$c342 = "past",
      peg$c343 = peg$literalExpectation("past", false),
      peg$c344 = "present",
      peg$c345 = peg$literalExpectation("present", false),
      peg$c346 = "future",
      peg$c347 = peg$literalExpectation("future", false),
      peg$c348 = "infinitive",
      peg$c349 = peg$literalExpectation("infinitive", false),
      peg$c350 = "json",
      peg$c351 = peg$literalExpectation("json", false),
      peg$c352 = "parsejson",
      peg$c353 = peg$literalExpectation("parsejson", false),
      peg$c354 = "list",
      peg$c355 = peg$literalExpectation("list", false),
      peg$c356 = "value",
      peg$c357 = peg$literalExpectation("value", false),
      peg$c358 = "islist",
      peg$c359 = peg$literalExpectation("islist", false),
      peg$c360 = "first",
      peg$c361 = peg$literalExpectation("first", false),
      peg$c362 = "last",
      peg$c363 = peg$literalExpectation("last", false),
      peg$c364 = "notfirst",
      peg$c365 = peg$literalExpectation("notfirst", false),
      peg$c366 = "notlast",
      peg$c367 = peg$literalExpectation("notlast", false),
      peg$c368 = "iota",
      peg$c369 = peg$literalExpectation("iota", false),
      peg$c370 = "sample",
      peg$c371 = peg$literalExpectation("sample", false),
      peg$c372 = "strlen",
      peg$c373 = peg$literalExpectation("strlen", false),
      peg$c374 = "length",
      peg$c375 = peg$literalExpectation("length", false),
      peg$c376 = "shuffle",
      peg$c377 = peg$literalExpectation("shuffle", false),
      peg$c378 = "bump",
      peg$c379 = peg$literalExpectation("bump", false),
      peg$c380 = "reverse",
      peg$c381 = peg$literalExpectation("reverse", false),
      peg$c382 = "revstr",
      peg$c383 = peg$literalExpectation("revstr", false),
      peg$c384 = "not",
      peg$c385 = peg$literalExpectation("not", false),
      peg$c386 = "comment",
      peg$c387 = peg$literalExpectation("comment", false),
      peg$c388 = "charclass",
      peg$c389 = peg$literalExpectation("charclass", false),
      peg$c390 = "alt",
      peg$c391 = peg$literalExpectation("alt", false),
      peg$c392 = "gerund",
      peg$c393 = peg$literalExpectation("gerund", false),
      peg$c394 = "adjective",
      peg$c395 = peg$literalExpectation("adjective", false),
      peg$c396 = "negative",
      peg$c397 = peg$literalExpectation("negative", false),
      peg$c398 = "positive",
      peg$c399 = peg$literalExpectation("positive", false),
      peg$c400 = "uc",
      peg$c401 = peg$literalExpectation("uc", false),
      peg$c402 = "lc",
      peg$c403 = peg$literalExpectation("lc", false),
      peg$c404 = "cap",
      peg$c405 = peg$literalExpectation("cap", false),
      peg$c406 = "a",
      peg$c407 = peg$literalExpectation("a", false),
      peg$c408 = "q",
      peg$c409 = peg$literalExpectation("q", false),
      peg$c410 = "vars",
      peg$c411 = peg$literalExpectation("vars", false),
      peg$c412 = "push",
      peg$c413 = peg$literalExpectation("push", false),
      peg$c414 = "unshift",
      peg$c415 = peg$literalExpectation("unshift", false),
      peg$c416 = "shift",
      peg$c417 = peg$literalExpectation("shift", false),
      peg$c418 = "pop",
      peg$c419 = peg$literalExpectation("pop", false),
      peg$c420 = "inc",
      peg$c421 = peg$literalExpectation("inc", false),
      peg$c422 = "dec",
      peg$c423 = peg$literalExpectation("dec", false),
      peg$c424 = "strictquote",
      peg$c425 = peg$literalExpectation("strictquote", false),
      peg$c426 = "'",
      peg$c427 = peg$literalExpectation("'", false),
      peg$c428 = function() { return 'strictquote' },
      peg$c429 = "quote",
      peg$c430 = peg$literalExpectation("quote", false),
      peg$c431 = "`",
      peg$c432 = peg$literalExpectation("`", false),
      peg$c433 = function() { return 'quote' },
      peg$c434 = "unquote",
      peg$c435 = peg$literalExpectation("unquote", false),
      peg$c436 = function() { return 'unquote' },
      peg$c437 = function(func) { return [makeQuote (func)] },
      peg$c438 = function(func) { return [makeStrictQuote (func)] },
      peg$c439 = function(lookup) { return [makeStrictQuote ([lookup])] },
      peg$c440 = function(a) { return addLocation(a) },
      peg$c441 = function(loc) { return [loc] },
      peg$c442 = function(rep) { return [rep] },
      peg$c443 = function(cond) { return [cond] },
      peg$c444 = function(func) { return [func] },
      peg$c445 = function(assign) { return [assign] },
      peg$c446 = function(lookup) { return [lookup] },
      peg$c447 = function(alt) { return [alt] },
      peg$c448 = function(args) { return args },
      peg$c449 = function(args) { return concatReduce (['['].concat(args).concat(']')) },
      peg$c450 = function(args) { return concatReduce (['{'].concat(args).concat('}')) },
      peg$c451 = function(head, tail) { return [head].concat(tail) },
      peg$c452 = "&set$",
      peg$c453 = peg$literalExpectation("&set$", false),
      peg$c454 = function(varname, args) { return makeAssign (varname, args) },
      peg$c455 = "&set{",
      peg$c456 = peg$literalExpectation("&set{", false),
      peg$c457 = "$",
      peg$c458 = peg$literalExpectation("$", false),
      peg$c459 = "=>",
      peg$c460 = peg$literalExpectation("=>", false),
      peg$c461 = function(varname, opts) { return makeAssign (varname, arrayWithPos (pseudoQuote (makeAltAssignRhs(opts)))) },
      peg$c462 = function(varname, coord, opts) { return makeAssign (varname, arrayWithPos (makeLayout (coord, makeAltAssignRhs(opts)))) },
      peg$c463 = "@(",
      peg$c464 = peg$literalExpectation("@(", false),
      peg$c465 = ")=>",
      peg$c466 = peg$literalExpectation(")=>", false),
      peg$c467 = function(varname, target) { return makeAssign (varname, target) },
      peg$c468 = ":=",
      peg$c469 = peg$literalExpectation(":=", false),
      peg$c470 = function(varname, target) { return makeAssign (varname, target, true) },
      peg$c471 = "+=",
      peg$c472 = peg$literalExpectation("+=", false),
      peg$c473 = function(varname, delta) { return makeModify (varname, 'add', delta) },
      peg$c474 = "-=",
      peg$c475 = peg$literalExpectation("-=", false),
      peg$c476 = function(varname, delta) { return makeModify (varname, 'subtract', delta) },
      peg$c477 = "*=",
      peg$c478 = peg$literalExpectation("*=", false),
      peg$c479 = function(varname, scale) { return makeModify (varname, 'multiply', scale) },
      peg$c480 = "/=",
      peg$c481 = peg$literalExpectation("/=", false),
      peg$c482 = function(varname, scale) { return makeModify (varname, 'divide', scale) },
      peg$c483 = ".=",
      peg$c484 = peg$literalExpectation(".=", false),
      peg$c485 = function(varname, suffix) { return makeModifyConcat (varname, suffix) },
      peg$c486 = "&tag",
      peg$c487 = peg$literalExpectation("&tag", false),
      peg$c488 = function(tag) { return makeModifyConcat ('tags', [' '].concat (tag)) },
      peg$c489 = function(varname, arg) { return makeAssign (varname, arg) },
      peg$c490 = "accept",
      peg$c491 = peg$literalExpectation("accept", false),
      peg$c492 = "reject",
      peg$c493 = peg$literalExpectation("reject", false),
      peg$c494 = "status",
      peg$c495 = peg$literalExpectation("status", false),
      peg$c496 = "footer",
      peg$c497 = peg$literalExpectation("footer", false),
      peg$c498 = function(func) { return func },
      peg$c499 = /^[^ \t\n\r=~#&${}[\]|\\]/,
      peg$c500 = peg$classExpectation([" ", "\t", "\n", "\r", "=", "~", "#", "&", "$", "{", "}", "[", "]", "|", "\\"], true, false),
      peg$c501 = function(chars) { return [chars.join("")] },
      peg$c502 = "$$",
      peg$c503 = peg$literalExpectation("$$", false),
      peg$c504 = function(num) { return makeLookup (makeGroupVarName (num)) },
      peg$c505 = "$${",
      peg$c506 = peg$literalExpectation("$${", false),
      peg$c507 = function(varname) { return makeSugaredLookup (varname) },
      peg$c508 = function(varname) { return makeLookup (varname) },
      peg$c509 = function(varname) { return varname },
      peg$c510 = "${",
      peg$c511 = peg$literalExpectation("${", false),
      peg$c512 = "|",
      peg$c513 = peg$literalExpectation("|", false),
      peg$c514 = function(head, tail) { return makeAlternation ([head].concat(tail)) },
      peg$c515 = function(head, tail) { return addLocation ([head].concat(tail)) },
      peg$c516 = function(head) { return addLocation ([head]) },
      peg$c517 = /^[A-Z]/,
      peg$c518 = peg$classExpectation([["A", "Z"]], false, false),
      peg$c519 = /^[A-Za-z_0-9]/,
      peg$c520 = peg$classExpectation([["A", "Z"], ["a", "z"], "_", ["0", "9"]], false, false),
      peg$c521 = /^[a-z]/,
      peg$c522 = peg$classExpectation([["a", "z"]], false, false),
      peg$c523 = function(firstChar, mid, lc, rest) { return firstChar + mid.join("") + lc + rest.join("") },
      peg$c524 = /^[A-Z_0-9]/,
      peg$c525 = peg$classExpectation([["A", "Z"], "_", ["0", "9"]], false, false),
      peg$c526 = function(firstChar, rest) { return firstChar + rest.join("") },
      peg$c527 = /^[^@~#&$+\-{}[\]|\\]/,
      peg$c528 = peg$classExpectation(["@", "~", "#", "&", "$", "+", "-", "{", "}", "[", "]", "|", "\\"], true, false),
      peg$c529 = function(chars) { return chars.join("") },
      peg$c530 = /^[0-9]/,
      peg$c531 = peg$classExpectation([["0", "9"]], false, false),
      peg$c532 = function(num) { return parseInt (num.join('')) },
      peg$c533 = ".",
      peg$c534 = peg$literalExpectation(".", false),
      peg$c535 = function(left, right) { return parseFloat(left.join("") + "." +   right.join("")) },
      peg$c536 = "+",
      peg$c537 = peg$literalExpectation("+", false),
      peg$c538 = function(n) { return n },
      peg$c539 = "-",
      peg$c540 = peg$literalExpectation("-", false),
      peg$c541 = function(n) { return -n },
      peg$c542 = function(id) { return wrapIdentifier(id) },
      peg$c543 = /^[A-Za-z_]/,
      peg$c544 = peg$classExpectation([["A", "Z"], ["a", "z"], "_"], false, false),
      peg$c545 = peg$otherExpectation("whitespace"),
      peg$c546 = /^[ \t\n\r]/,
      peg$c547 = peg$classExpectation([" ", "\t", "\n", "\r"], false, false),
      peg$c548 = function(first, rest) {
          return rest.reduce (function (left, next) {
            var op = next[1], right = next[3]
            return makeFunction (op === '+' ? 'add' : 'subtract', [left, right])
          }, first)
        },
      peg$c549 = "*",
      peg$c550 = peg$literalExpectation("*", false),
      peg$c551 = function(first, rest) {
          return rest.reduce (function (left, next) {
            var op = next[1], right = next[3]
            return makeFunction (op === '*' ? 'multiply' : 'divide', [left, right])
          }, first)
        },
      peg$c552 = "^",
      peg$c553 = peg$literalExpectation("^", false),
      peg$c554 = "**",
      peg$c555 = peg$literalExpectation("**", false),
      peg$c556 = function(base, exp) { return makeFunction ('pow', [base, exp]) },
      peg$c557 = "e",
      peg$c558 = peg$literalExpectation("e", false),
      peg$c559 = "exp",
      peg$c560 = peg$literalExpectation("exp", false),
      peg$c561 = function(exp) { return makeFunction ('pow', [Math.exp(1).toString(), exp]) },
      peg$c562 = "(",
      peg$c563 = peg$literalExpectation("(", false),
      peg$c564 = ")",
      peg$c565 = peg$literalExpectation(")", false),
      peg$c566 = function(f) { return f.toString() },
      peg$c567 = function(n) { return n.toString() },
      peg$c568 = function(arg) { return wrapNodes (arg) },
      peg$c569 = function(additive) { return makeFunction ('value', [additive]) },
      peg$c570 = function(body, flags) { return { body: body, flags: flags } },
      peg$c571 = "//",
      peg$c572 = peg$literalExpectation("//", false),
      peg$c573 = function(flags) { return { body: [], flags: flags } },
      peg$c574 = function(c, chars) { return concatReduce ([c].concat (chars)) },
      peg$c575 = function(chars) { return chars },
      peg$c576 = /^[*\\\/[]/,
      peg$c577 = peg$classExpectation(["*", "\\", "/", "["], false, false),
      peg$c578 = function(c) { return c },
      peg$c579 = /^[\\\/[]/,
      peg$c580 = peg$classExpectation(["\\", "/", "["], false, false),
      peg$c581 = function(c) { return "\\" + c },
      peg$c582 = function(chars) { return wrapNodes (concatReduce (['['].concat(chars[0] || '').concat(']'))) },
      peg$c583 = function(chars) { return concatReduce (chars) },
      peg$c584 = /^[\]\\]/,
      peg$c585 = peg$classExpectation(["]", "\\"], false, false),
      peg$c586 = /^[gimuy]/,
      peg$c587 = peg$classExpectation(["g", "i", "m", "u", "y"], false, false),
      peg$c588 = function(parts) { return parts },
      peg$c589 = /^[\n\r\u2028\u2029]/,
      peg$c590 = peg$classExpectation(["\n", "\r", "\u2028", "\u2029"], false, false),

      peg$currPos          = 0,
      peg$savedPos         = 0,
      peg$posDetailsCache  = [{ line: 1, column: 1 }],
      peg$maxFailPos       = 0,
      peg$maxFailExpected  = [],
      peg$silentFails      = 0,

      peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text: text, ignoreCase: ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description: description };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos], p;

    if (details) {
      return details;
    } else {
      p = pos - 1;
      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line:   details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;
      return details;
    }
  }

  function peg$computeLocation(startPos, endPos) {
    var startPosDetails = peg$computePosDetails(startPos),
        endPosDetails   = peg$computePosDetails(endPos);

    return {
      start: {
        offset: startPos,
        line:   startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line:   endPosDetails.line,
        column: endPosDetails.column
      }
    };
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parseRHS() {
    var s0;

    s0 = peg$parseOuterNodeList();

    return s0;
  }

  function peg$parseNode() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c0) {
      s1 = peg$c0;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c1); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c2();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c3) {
        s1 = peg$c3;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c4); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c5();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 92) {
          s1 = peg$c6;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c7); }
        }
        if (s1 !== peg$FAILED) {
          if (input.length > peg$currPos) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c8); }
          }
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c9(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parseText();
          if (s0 === peg$FAILED) {
            s0 = peg$parseLocalAssignment();
            if (s0 === peg$FAILED) {
              s0 = peg$parseRepetition();
              if (s0 === peg$FAILED) {
                s0 = peg$parseConditional();
                if (s0 === peg$FAILED) {
                  s0 = peg$parseFunction();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parseVarAssignment();
                    if (s0 === peg$FAILED) {
                      s0 = peg$parseVarLookup();
                      if (s0 === peg$FAILED) {
                        s0 = peg$parseAlternation();
                        if (s0 === peg$FAILED) {
                          s0 = peg$parseLinkShortcut();
                          if (s0 === peg$FAILED) {
                            s0 = peg$currPos;
                            s1 = peg$parseDummyBrackets();
                            if (s1 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c10(s1);
                            }
                            s0 = s1;
                            if (s0 === peg$FAILED) {
                              s0 = peg$currPos;
                              if (peg$c11.test(input.charAt(peg$currPos))) {
                                s1 = input.charAt(peg$currPos);
                                peg$currPos++;
                              } else {
                                s1 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c12); }
                              }
                              if (s1 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c13(s1);
                              }
                              s0 = s1;
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseNodeList() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseRawNodeList();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c14(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseRawNodeList() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c15) {
      s1 = peg$c15;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c16); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c17(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseNode();
      if (s1 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c15) {
          s2 = peg$c15;
          peg$currPos += 2;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c16); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseNodeList();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c18(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseNode();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseNodeList();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c19(s1, s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseNode();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c20(s1);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$c21;
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c22();
            }
            s0 = s1;
          }
        }
      }
    }

    return s0;
  }

  function peg$parseOuterNode() {
    var s0, s1;

    s0 = peg$parseNode();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.length > peg$currPos) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c8); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c13(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseOuterNodeList() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parseOuterNode();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseOuterNodeList();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c19(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseOuterNode();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c20(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$c21;
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c22();
        }
        s0 = s1;
      }
    }

    return s0;
  }

  function peg$parseLocalAssignment() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4) === peg$c23) {
      s1 = peg$c23;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c24); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseVarAssignmentList();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseFunctionArg();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c25(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 35) {
        s1 = peg$c26;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c27); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseVarAssignmentList();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseRawIdentifier();
              if (s5 !== peg$FAILED) {
                s6 = peg$parseTraceryModifiers();
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 35) {
                    s7 = peg$c26;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c27); }
                  }
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c28(s3, s5, s6);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseRepetition() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4) === peg$c29) {
      s1 = peg$c29;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c30); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 123) {
          s3 = peg$c31;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c32); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseNumber();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 44) {
              s5 = peg$c33;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c34); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseNumber();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 125) {
                  s7 = peg$c35;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c36); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c37(s2, s4, s6);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 4) === peg$c29) {
        s1 = peg$c29;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c30); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 123) {
            s3 = peg$c31;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c32); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseNumber();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s5 = peg$c35;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c36); }
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c38(s2, s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseConditional() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c39) {
      s1 = peg$c39;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c40); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 4) === peg$c41) {
          s3 = peg$c41;
          peg$currPos += 4;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c42); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$c21;
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseFunctionArg();
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 4) === peg$c43) {
              s5 = peg$c43;
              peg$currPos += 4;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c44); }
            }
            if (s5 === peg$FAILED) {
              s5 = peg$c21;
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseFunctionArg();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c45(s2, s4, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c39) {
        s1 = peg$c39;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c40); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 4) === peg$c41) {
            s3 = peg$c41;
            peg$currPos += 4;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c42); }
          }
          if (s3 === peg$FAILED) {
            s3 = peg$c21;
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseFunctionArg();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c46(s2, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 5) === peg$c47) {
          s1 = peg$c47;
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c48); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseFunctionArg();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseFunctionArg();
            if (s3 !== peg$FAILED) {
              s4 = peg$parseFunctionArg();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c49(s2, s3, s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseFunction() {
    var s0;

    s0 = peg$parseSymbolFunction();
    if (s0 === peg$FAILED) {
      s0 = peg$parseBinaryVarFunction();
      if (s0 === peg$FAILED) {
        s0 = peg$parseUnaryVarFunction();
        if (s0 === peg$FAILED) {
          s0 = peg$parseBinaryFunction();
          if (s0 === peg$FAILED) {
            s0 = peg$parseUnaryFunction();
            if (s0 === peg$FAILED) {
              s0 = peg$parseNullaryFunction();
              if (s0 === peg$FAILED) {
                s0 = peg$parseMapFunction();
                if (s0 === peg$FAILED) {
                  s0 = peg$parseRegexFunction();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parseCallFunction();
                    if (s0 === peg$FAILED) {
                      s0 = peg$parseDefineFunction();
                      if (s0 === peg$FAILED) {
                        s0 = peg$parseMathFunction();
                        if (s0 === peg$FAILED) {
                          s0 = peg$parseMeterFunction();
                          if (s0 === peg$FAILED) {
                            s0 = peg$parseScheduleFunction();
                            if (s0 === peg$FAILED) {
                              s0 = peg$parseImportanceSamplingFunction();
                              if (s0 === peg$FAILED) {
                                s0 = peg$parseLinkFunction();
                                if (s0 === peg$FAILED) {
                                  s0 = peg$parseLayoutFunction();
                                  if (s0 === peg$FAILED) {
                                    s0 = peg$parseParseFunction();
                                    if (s0 === peg$FAILED) {
                                      s0 = peg$parseListConstructor();
                                      if (s0 === peg$FAILED) {
                                        s0 = peg$parseShortUnaryFunction();
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseSymbolFunction() {
    var s0, s1, s2, s3, s4;

    s0 = peg$parsePlainSymbol();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseCallSymbol();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseArgList();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c50(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseApplySymbol();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseFunctionArg();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c51(s1, s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 35) {
            s1 = peg$c26;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c27); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseLocatedIdentifier();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseTraceryModifiers();
              if (s3 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 35) {
                  s4 = peg$c26;
                  peg$currPos++;
                } else {
                  s4 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c27); }
                }
                if (s4 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c52(s2, s3);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseGetSymbol();
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c53(s1);
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$parseSetSymbol();
              if (s1 !== peg$FAILED) {
                s2 = peg$parseFunctionArg();
                if (s2 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c54(s1, s2);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parsePlainSymbol() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parsePrefixedSymIdentifier();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c55(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseCallSymbol() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c56) {
      s1 = peg$c56;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c57); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseSymIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c58(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 38) {
        s1 = peg$c59;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c60); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePrefixedSymIdentifier();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c58(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseApplySymbol() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7) === peg$c61) {
      s1 = peg$c61;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c62); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseSymIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c58(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGetSymbol() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c63) {
      s1 = peg$c63;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c64); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseSymIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c58(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSetSymbol() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c65) {
      s1 = peg$c65;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c66); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseSymIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c58(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSymIdentifier() {
    var s0, s1, s2, s3;

    s0 = peg$parsePrefixedSymIdentifier();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 123) {
        s1 = peg$c31;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePrefixedSymIdentifier();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c35;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c36); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c67(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 123) {
          s1 = peg$c31;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c32); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseOwnedNamedSymID();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s3 = peg$c35;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c36); }
            }
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c67(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parsePrefixedSymIdentifier() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 126) {
      s1 = peg$c68;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c69); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseOwnedNamedSymID();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c67(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c70) {
        s1 = peg$c70;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c71); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseOwnedNamedSymID();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s5 = peg$c35;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c36); }
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c67(s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseNamedSymID() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseLocatedIdentifier();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c72(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseOwnedNamedSymID() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseLocatedIdentifier();
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 47) {
        s2 = peg$c73;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c74); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseLocatedIdentifier();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c75(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parseNamedSymID();
    }

    return s0;
  }

  function peg$parseTraceryModifiers() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parseTraceryModifier();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseTraceryModifiers();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c76(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$c21;
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c22();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseTraceryModifier() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 14) === peg$c77) {
      s1 = peg$c77;
      peg$currPos += 14;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c78); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c79();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 11) === peg$c80) {
        s1 = peg$c80;
        peg$currPos += 11;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c81); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c82();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c83) {
          s1 = peg$c83;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c84); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c85();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 3) === peg$c86) {
            s1 = peg$c86;
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c87); }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c88();
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c89) {
              s1 = peg$c89;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c90); }
            }
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c91();
            }
            s0 = s1;
          }
        }
      }
    }

    return s0;
  }

  function peg$parseMapFunction() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 38) {
      s1 = peg$c59;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c60); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseMapFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseMapVarIdentifier();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseFunctionArg();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseStrictQuotedFunctionArg();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c92(s2, s3, s4, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 38) {
        s1 = peg$c59;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c60); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseMapFunctionName();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseFunctionArg();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseStrictQuotedFunctionArg();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c93(s2, s3, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 38) {
          s1 = peg$c59;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c60); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseDefaultableMapFunctionName();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseFunctionArg();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c94(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 7) === peg$c95) {
            s1 = peg$c95;
            peg$currPos += 7;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c96); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseMapVarIdentifier();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseFunctionArg();
              if (s3 !== peg$FAILED) {
                s4 = peg$parseVarIdentifier();
                if (s4 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 61) {
                    s5 = peg$c97;
                    peg$currPos++;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c98); }
                  }
                  if (s5 === peg$FAILED) {
                    s5 = peg$c21;
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parseFunctionArg();
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parseStrictQuotedFunctionArg();
                      if (s7 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c99(s2, s3, s4, s6, s7);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
      }
    }

    return s0;
  }

  function peg$parseMapFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 3) === peg$c100) {
      s0 = peg$c100;
      peg$currPos += 3;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c101); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 3) === peg$c102) {
        s0 = peg$c102;
        peg$currPos += 3;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c103); }
      }
      if (s0 === peg$FAILED) {
        s0 = peg$parseDefaultableMapFunctionName();
      }
    }

    return s0;
  }

  function peg$parseDefaultableMapFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 6) === peg$c104) {
      s0 = peg$c104;
      peg$currPos += 6;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c105); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c106) {
        s0 = peg$c106;
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c107); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 7) === peg$c108) {
          s0 = peg$c108;
          peg$currPos += 7;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c109); }
        }
      }
    }

    return s0;
  }

  function peg$parseMapVarIdentifier() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseVarIdentifier();
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 58) {
        s2 = peg$c110;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c111); }
      }
      if (s2 === peg$FAILED) {
        s2 = peg$c21;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c112(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 123) {
        s1 = peg$c31;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseVarIdentifier();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c35;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c36); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c112(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseRegexFunction() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 38) {
      s1 = peg$c59;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c60); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseBinaryRegexFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseRegularExpressionLiteral();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseFunctionArg();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseStrictQuotedFunctionArg();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c113(s2, s3, s4, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 38) {
        s1 = peg$c59;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c60); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseUnaryRegexFunctionName();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseRegularExpressionLiteral();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseFunctionArg();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c114(s2, s3, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 6) === peg$c115) {
          s1 = peg$c115;
          peg$currPos += 6;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c116); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseFunctionArg();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c117(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseBinaryRegexFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 5) === peg$c118) {
      s0 = peg$c118;
      peg$currPos += 5;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c119); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c120) {
        s0 = peg$c120;
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c121); }
      }
    }

    return s0;
  }

  function peg$parseUnaryRegexFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 4) === peg$c122) {
      s0 = peg$c122;
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c123); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c124) {
        s0 = peg$c124;
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c125); }
      }
    }

    return s0;
  }

  function peg$parseRegexUnquote() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 8) === peg$c126) {
      s1 = peg$c126;
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c127); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c128(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCallFunction() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c129) {
      s1 = peg$c129;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c130); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseArgList();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c131(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 38) {
        s1 = peg$c59;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c60); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseVarLookup();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgList();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c132(s2, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseDefineFunction() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 9) === peg$c133) {
      s1 = peg$c133;
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c134); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseArgIdentifierList();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c135(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 9) === peg$c133) {
        s1 = peg$c133;
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c134); }
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 123) {
          s2 = peg$c31;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c32); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgIdentifierList();
          if (s3 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s4 = peg$c35;
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c36); }
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseFunctionArg();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c135(s3, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 11) === peg$c136) {
          s1 = peg$c136;
          peg$currPos += 11;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c137); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseFunctionArg();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c138(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseArgIdentifierList() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseArgIdentifier();
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 44) {
        s2 = peg$c33;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c34); }
      }
      if (s2 === peg$FAILED) {
        s2 = peg$c21;
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseArgIdentifierList();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c139(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseArgIdentifier();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c20(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseArgIdentifier() {
    var s0, s1, s2, s3;

    s0 = peg$parseVarIdentifier();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 123) {
        s1 = peg$c31;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseVarIdentifier();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c35;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c36); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c112(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseBinaryFunction() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 38) {
      s1 = peg$c59;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c60); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseBinaryFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseFunctionArg();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c140(s2, s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5) === peg$c141) {
        s1 = peg$c141;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c142); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c143(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseUnaryFunction() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 38) {
      s1 = peg$c59;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c60); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseUnaryFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c144(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 7) === peg$c145) {
        s1 = peg$c145;
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c146); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c147(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseShortUnaryFunction() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 38) {
      s1 = peg$c59;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c60); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseShortUnaryFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c144(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseNullaryFunction() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 38) {
      s1 = peg$c59;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c60); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNullaryFunctionName();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c148(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseBinaryVarFunction() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 38) {
      s1 = peg$c59;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c60); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsePushOrUnshift();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseVarFunctionArg();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseFunctionArg();
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c149(s2, s3, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 38) {
        s1 = peg$c59;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c60); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePushOrUnshift();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseFunctionArg();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c150(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseUnaryVarFunction() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 38) {
      s1 = peg$c59;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c60); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseShiftOrPop();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseVarFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c151(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 38) {
        s1 = peg$c59;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c60); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseShiftOrPop();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c152(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 38) {
          s1 = peg$c59;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c60); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseIncOrDec();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseVarFunctionArg();
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c151(s2, s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c153) {
            s1 = peg$c153;
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c154); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseVarFunctionArg();
            if (s2 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c155(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c156) {
              s1 = peg$c156;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c157); }
            }
            if (s1 !== peg$FAILED) {
              s2 = peg$parseVarFunctionArg();
              if (s2 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c158(s2);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$parseVarFunctionArg();
              if (s1 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2) === peg$c153) {
                  s2 = peg$c153;
                  peg$currPos += 2;
                } else {
                  s2 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c154); }
                }
                if (s2 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c159(s1);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                s1 = peg$parseVarFunctionArg();
                if (s1 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c156) {
                    s2 = peg$c156;
                    peg$currPos += 2;
                  } else {
                    s2 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c157); }
                  }
                  if (s2 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c160(s1);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseMeterFunction() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c161) {
      s1 = peg$c161;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c162); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseAdditiveExpr();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseStrictQuotedFunctionArg();
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c163(s2, s3, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 6) === peg$c161) {
        s1 = peg$c161;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c162); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseAdditiveExpr();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c164(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseScheduleFunction() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c165) {
      s1 = peg$c165;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c166); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVarFunctionArg();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c167(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 9) === peg$c168) {
        s1 = peg$c168;
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c169); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseVarFunctionArg();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseFunctionArg();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c170(s2, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 6) === peg$c171) {
          s1 = peg$c171;
          peg$currPos += 6;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c172); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseVarFunctionArg();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseFunctionArg();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c173(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseImportanceSamplingFunction() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c174) {
      s1 = peg$c174;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c175); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNumber();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c176) {
          s3 = peg$c176;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c177); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseAdditiveExpr();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 125) {
                  s7 = peg$c35;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c36); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseStrictQuotedFunctionArg();
                  if (s8 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c178(s2, s5, s8);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 9) === peg$c179) {
        s1 = peg$c179;
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c180); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c181(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 7) === peg$c182) {
          s1 = peg$c182;
          peg$currPos += 7;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c183); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseNumber();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s3 = peg$c35;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c36); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseFunctionArg();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseFunctionArg();
                if (s5 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c184(s2, s4, s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 6) === peg$c185) {
            s1 = peg$c185;
            peg$currPos += 6;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c186); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseFunctionArg();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseFunctionArg();
              if (s3 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c187(s2, s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
      }
    }

    return s0;
  }

  function peg$parseMathFunction() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c188) {
      s1 = peg$c188;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c189); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseAdditiveExpr();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c35;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c36); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c190(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 7) === peg$c191) {
        s1 = peg$c191;
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c192); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c193();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseLinkFunction() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c194) {
      s1 = peg$c194;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c195); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c196(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 6) === peg$c197) {
        s1 = peg$c197;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c198); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseXYCoord();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseFunctionArg();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseFunctionArg();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c199(s2, s3, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 7) === peg$c200) {
          s1 = peg$c200;
          peg$currPos += 7;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c201); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseFunctionArg();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseFunctionArg();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c202(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseLinkShortcut() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c203) {
      s1 = peg$c203;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c204); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseText();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c205) {
          s3 = peg$c205;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c206); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c207(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 91) {
        s1 = peg$c208;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c209); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseNodeList();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c210) {
            s3 = peg$c210;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c211); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseXYCoord();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseDelimitedNodeList();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c212(s2, s4, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 91) {
          s1 = peg$c208;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c209); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseNodeList();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 93) {
              s3 = peg$c213;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c214); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseDelimitedNodeList();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c196(s2, s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseLayoutFunction() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7) === peg$c215) {
      s1 = peg$c215;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c216); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseDelimitedXYCoord();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c217(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 12) === peg$c218) {
        s1 = peg$c218;
        peg$currPos += 12;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c219); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePlaceholderArg();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseDelimitedXYCoord();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c220(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 64) {
          s1 = peg$c221;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c222); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseXYCoord();
          if (s2 !== peg$FAILED) {
            s3 = peg$parsePlaceholderArg();
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c223(s2, s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parsePlaceholderArg() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseRawPlaceholderArg();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c224(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseRawPlaceholderArg() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parsePlainVarLookup();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c225(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsePlainSymbol();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c226(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c227) {
          s1 = peg$c227;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c228); }
        }
        if (s1 === peg$FAILED) {
          if (input.substr(peg$currPos, 6) === peg$c229) {
            s1 = peg$c229;
            peg$currPos += 6;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c230); }
          }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c22();
        }
        s0 = s1;
      }
    }

    return s0;
  }

  function peg$parseDelimitedXYCoord() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 123) {
      s1 = peg$c31;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c32); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseXYCoord();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 125) {
          s3 = peg$c35;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c36); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c231(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseXYCoord() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseSignedNumber();
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 44) {
        s2 = peg$c33;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c34); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseSignedNumber();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c232(s1, s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseParseFunction() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c233) {
      s1 = peg$c233;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c234); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseStrictQuotedFunctionArg();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c235(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 8) === peg$c236) {
        s1 = peg$c236;
        peg$currPos += 8;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c237); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseStrictQuotedFunctionArg();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c238(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseListConstructor() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c239) {
      s1 = peg$c239;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c240); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 125) {
          s3 = peg$c35;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c36); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c241(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 9) === peg$c242) {
        s1 = peg$c242;
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c243); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseArgList();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c244(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 10) === peg$c245) {
          s1 = peg$c245;
          peg$currPos += 10;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c246); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseArgList();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c247(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseBinaryFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 3) === peg$c248) {
      s0 = peg$c248;
      peg$currPos += 3;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c249); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 8) === peg$c250) {
        s0 = peg$c250;
        peg$currPos += 8;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c251); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 8) === peg$c252) {
          s0 = peg$c252;
          peg$currPos += 8;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c253); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 6) === peg$c254) {
            s0 = peg$c254;
            peg$currPos += 6;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c255); }
          }
          if (s0 === peg$FAILED) {
            if (input.substr(peg$currPos, 3) === peg$c256) {
              s0 = peg$c256;
              peg$currPos += 3;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c257); }
            }
            if (s0 === peg$FAILED) {
              if (input.substr(peg$currPos, 2) === peg$c258) {
                s0 = peg$c258;
                peg$currPos += 2;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c259); }
              }
              if (s0 === peg$FAILED) {
                if (input.substr(peg$currPos, 3) === peg$c260) {
                  s0 = peg$c260;
                  peg$currPos += 3;
                } else {
                  s0 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c261); }
                }
                if (s0 === peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c262) {
                    s0 = peg$c262;
                    peg$currPos += 2;
                  } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c263); }
                  }
                  if (s0 === peg$FAILED) {
                    if (input.substr(peg$currPos, 3) === peg$c264) {
                      s0 = peg$c264;
                      peg$currPos += 3;
                    } else {
                      s0 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c265); }
                    }
                    if (s0 === peg$FAILED) {
                      if (input.substr(peg$currPos, 2) === peg$c266) {
                        s0 = peg$c266;
                        peg$currPos += 2;
                      } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c267); }
                      }
                      if (s0 === peg$FAILED) {
                        if (input.substr(peg$currPos, 3) === peg$c268) {
                          s0 = peg$c268;
                          peg$currPos += 3;
                        } else {
                          s0 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c269); }
                        }
                        if (s0 === peg$FAILED) {
                          if (input.substr(peg$currPos, 3) === peg$c270) {
                            s0 = peg$c270;
                            peg$currPos += 3;
                          } else {
                            s0 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c271); }
                          }
                          if (s0 === peg$FAILED) {
                            if (input.substr(peg$currPos, 3) === peg$c272) {
                              s0 = peg$c272;
                              peg$currPos += 3;
                            } else {
                              s0 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c273); }
                            }
                            if (s0 === peg$FAILED) {
                              if (input.substr(peg$currPos, 4) === peg$c274) {
                                s0 = peg$c274;
                                peg$currPos += 4;
                              } else {
                                s0 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c275); }
                              }
                              if (s0 === peg$FAILED) {
                                if (input.substr(peg$currPos, 3) === peg$c276) {
                                  s0 = peg$c276;
                                  peg$currPos += 3;
                                } else {
                                  s0 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c277); }
                                }
                                if (s0 === peg$FAILED) {
                                  if (input.substr(peg$currPos, 2) === peg$c278) {
                                    s0 = peg$c278;
                                    peg$currPos += 2;
                                  } else {
                                    s0 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c279); }
                                  }
                                  if (s0 === peg$FAILED) {
                                    if (input.substr(peg$currPos, 3) === peg$c280) {
                                      s0 = peg$c280;
                                      peg$currPos += 3;
                                    } else {
                                      s0 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c281); }
                                    }
                                    if (s0 === peg$FAILED) {
                                      if (input.substr(peg$currPos, 7) === peg$c282) {
                                        s0 = peg$c282;
                                        peg$currPos += 7;
                                      } else {
                                        s0 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c283); }
                                      }
                                      if (s0 === peg$FAILED) {
                                        if (input.substr(peg$currPos, 6) === peg$c284) {
                                          s0 = peg$c284;
                                          peg$currPos += 6;
                                        } else {
                                          s0 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c285); }
                                        }
                                        if (s0 === peg$FAILED) {
                                          if (input.substr(peg$currPos, 4) === peg$c286) {
                                            s0 = peg$c286;
                                            peg$currPos += 4;
                                          } else {
                                            s0 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c287); }
                                          }
                                          if (s0 === peg$FAILED) {
                                            if (input.substr(peg$currPos, 3) === peg$c288) {
                                              s0 = peg$c288;
                                              peg$currPos += 3;
                                            } else {
                                              s0 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c289); }
                                            }
                                            if (s0 === peg$FAILED) {
                                              if (input.substr(peg$currPos, 7) === peg$c290) {
                                                s0 = peg$c290;
                                                peg$currPos += 7;
                                              } else {
                                                s0 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c291); }
                                              }
                                              if (s0 === peg$FAILED) {
                                                if (input.substr(peg$currPos, 5) === peg$c292) {
                                                  s0 = peg$c292;
                                                  peg$currPos += 5;
                                                } else {
                                                  s0 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c293); }
                                                }
                                                if (s0 === peg$FAILED) {
                                                  if (input.substr(peg$currPos, 6) === peg$c294) {
                                                    s0 = peg$c294;
                                                    peg$currPos += 6;
                                                  } else {
                                                    s0 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c295); }
                                                  }
                                                  if (s0 === peg$FAILED) {
                                                    if (input.substr(peg$currPos, 9) === peg$c296) {
                                                      s0 = peg$c296;
                                                      peg$currPos += 9;
                                                    } else {
                                                      s0 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c297); }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseUnaryFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 4) === peg$c298) {
      s0 = peg$c298;
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c299); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 6) === peg$c300) {
        s0 = peg$c300;
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c301); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 4) === peg$c302) {
          s0 = peg$c302;
          peg$currPos += 4;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c303); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 6) === peg$c304) {
            s0 = peg$c304;
            peg$currPos += 6;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c305); }
          }
          if (s0 === peg$FAILED) {
            if (input.substr(peg$currPos, 6) === peg$c306) {
              s0 = peg$c306;
              peg$currPos += 6;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c307); }
            }
            if (s0 === peg$FAILED) {
              if (input.substr(peg$currPos, 7) === peg$c308) {
                s0 = peg$c308;
                peg$currPos += 7;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c309); }
              }
              if (s0 === peg$FAILED) {
                s0 = peg$parseStrictQuote();
                if (s0 === peg$FAILED) {
                  s0 = peg$parseQuote();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parseUnquote();
                    if (s0 === peg$FAILED) {
                      if (input.substr(peg$currPos, 6) === peg$c310) {
                        s0 = peg$c310;
                        peg$currPos += 6;
                      } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c311); }
                      }
                      if (s0 === peg$FAILED) {
                        if (input.substr(peg$currPos, 5) === peg$c312) {
                          s0 = peg$c312;
                          peg$currPos += 5;
                        } else {
                          s0 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c313); }
                        }
                        if (s0 === peg$FAILED) {
                          if (input.substr(peg$currPos, 4) === peg$c314) {
                            s0 = peg$c314;
                            peg$currPos += 4;
                          } else {
                            s0 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c315); }
                          }
                          if (s0 === peg$FAILED) {
                            if (input.substr(peg$currPos, 5) === peg$c316) {
                              s0 = peg$c316;
                              peg$currPos += 5;
                            } else {
                              s0 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c317); }
                            }
                            if (s0 === peg$FAILED) {
                              if (input.substr(peg$currPos, 3) === peg$c318) {
                                s0 = peg$c318;
                                peg$currPos += 3;
                              } else {
                                s0 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c319); }
                              }
                              if (s0 === peg$FAILED) {
                                if (input.substr(peg$currPos, 7) === peg$c320) {
                                  s0 = peg$c320;
                                  peg$currPos += 7;
                                } else {
                                  s0 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c321); }
                                }
                                if (s0 === peg$FAILED) {
                                  if (input.substr(peg$currPos, 7) === peg$c322) {
                                    s0 = peg$c322;
                                    peg$currPos += 7;
                                  } else {
                                    s0 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c323); }
                                  }
                                  if (s0 === peg$FAILED) {
                                    if (input.substr(peg$currPos, 6) === peg$c324) {
                                      s0 = peg$c324;
                                      peg$currPos += 6;
                                    } else {
                                      s0 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c325); }
                                    }
                                    if (s0 === peg$FAILED) {
                                      if (input.substr(peg$currPos, 7) === peg$c326) {
                                        s0 = peg$c326;
                                        peg$currPos += 7;
                                      } else {
                                        s0 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c327); }
                                      }
                                      if (s0 === peg$FAILED) {
                                        if (input.substr(peg$currPos, 8) === peg$c328) {
                                          s0 = peg$c328;
                                          peg$currPos += 8;
                                        } else {
                                          s0 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c329); }
                                        }
                                        if (s0 === peg$FAILED) {
                                          if (input.substr(peg$currPos, 6) === peg$c330) {
                                            s0 = peg$c330;
                                            peg$currPos += 6;
                                          } else {
                                            s0 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c331); }
                                          }
                                          if (s0 === peg$FAILED) {
                                            if (input.substr(peg$currPos, 8) === peg$c332) {
                                              s0 = peg$c332;
                                              peg$currPos += 8;
                                            } else {
                                              s0 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c333); }
                                            }
                                            if (s0 === peg$FAILED) {
                                              if (input.substr(peg$currPos, 10) === peg$c334) {
                                                s0 = peg$c334;
                                                peg$currPos += 10;
                                              } else {
                                                s0 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c335); }
                                              }
                                              if (s0 === peg$FAILED) {
                                                if (input.substr(peg$currPos, 5) === peg$c336) {
                                                  s0 = peg$c336;
                                                  peg$currPos += 5;
                                                } else {
                                                  s0 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c337); }
                                                }
                                                if (s0 === peg$FAILED) {
                                                  if (input.substr(peg$currPos, 6) === peg$c338) {
                                                    s0 = peg$c338;
                                                    peg$currPos += 6;
                                                  } else {
                                                    s0 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c339); }
                                                  }
                                                  if (s0 === peg$FAILED) {
                                                    if (input.substr(peg$currPos, 5) === peg$c340) {
                                                      s0 = peg$c340;
                                                      peg$currPos += 5;
                                                    } else {
                                                      s0 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c341); }
                                                    }
                                                    if (s0 === peg$FAILED) {
                                                      if (input.substr(peg$currPos, 4) === peg$c342) {
                                                        s0 = peg$c342;
                                                        peg$currPos += 4;
                                                      } else {
                                                        s0 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c343); }
                                                      }
                                                      if (s0 === peg$FAILED) {
                                                        if (input.substr(peg$currPos, 7) === peg$c344) {
                                                          s0 = peg$c344;
                                                          peg$currPos += 7;
                                                        } else {
                                                          s0 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c345); }
                                                        }
                                                        if (s0 === peg$FAILED) {
                                                          if (input.substr(peg$currPos, 6) === peg$c346) {
                                                            s0 = peg$c346;
                                                            peg$currPos += 6;
                                                          } else {
                                                            s0 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c347); }
                                                          }
                                                          if (s0 === peg$FAILED) {
                                                            if (input.substr(peg$currPos, 10) === peg$c348) {
                                                              s0 = peg$c348;
                                                              peg$currPos += 10;
                                                            } else {
                                                              s0 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c349); }
                                                            }
                                                            if (s0 === peg$FAILED) {
                                                              if (input.substr(peg$currPos, 4) === peg$c350) {
                                                                s0 = peg$c350;
                                                                peg$currPos += 4;
                                                              } else {
                                                                s0 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c351); }
                                                              }
                                                              if (s0 === peg$FAILED) {
                                                                if (input.substr(peg$currPos, 9) === peg$c352) {
                                                                  s0 = peg$c352;
                                                                  peg$currPos += 9;
                                                                } else {
                                                                  s0 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c353); }
                                                                }
                                                                if (s0 === peg$FAILED) {
                                                                  if (input.substr(peg$currPos, 4) === peg$c354) {
                                                                    s0 = peg$c354;
                                                                    peg$currPos += 4;
                                                                  } else {
                                                                    s0 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c355); }
                                                                  }
                                                                  if (s0 === peg$FAILED) {
                                                                    if (input.substr(peg$currPos, 5) === peg$c356) {
                                                                      s0 = peg$c356;
                                                                      peg$currPos += 5;
                                                                    } else {
                                                                      s0 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c357); }
                                                                    }
                                                                    if (s0 === peg$FAILED) {
                                                                      if (input.substr(peg$currPos, 6) === peg$c358) {
                                                                        s0 = peg$c358;
                                                                        peg$currPos += 6;
                                                                      } else {
                                                                        s0 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c359); }
                                                                      }
                                                                      if (s0 === peg$FAILED) {
                                                                        if (input.substr(peg$currPos, 5) === peg$c360) {
                                                                          s0 = peg$c360;
                                                                          peg$currPos += 5;
                                                                        } else {
                                                                          s0 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c361); }
                                                                        }
                                                                        if (s0 === peg$FAILED) {
                                                                          if (input.substr(peg$currPos, 4) === peg$c362) {
                                                                            s0 = peg$c362;
                                                                            peg$currPos += 4;
                                                                          } else {
                                                                            s0 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c363); }
                                                                          }
                                                                          if (s0 === peg$FAILED) {
                                                                            if (input.substr(peg$currPos, 8) === peg$c364) {
                                                                              s0 = peg$c364;
                                                                              peg$currPos += 8;
                                                                            } else {
                                                                              s0 = peg$FAILED;
                                                                              if (peg$silentFails === 0) { peg$fail(peg$c365); }
                                                                            }
                                                                            if (s0 === peg$FAILED) {
                                                                              if (input.substr(peg$currPos, 7) === peg$c366) {
                                                                                s0 = peg$c366;
                                                                                peg$currPos += 7;
                                                                              } else {
                                                                                s0 = peg$FAILED;
                                                                                if (peg$silentFails === 0) { peg$fail(peg$c367); }
                                                                              }
                                                                              if (s0 === peg$FAILED) {
                                                                                if (input.substr(peg$currPos, 4) === peg$c368) {
                                                                                  s0 = peg$c368;
                                                                                  peg$currPos += 4;
                                                                                } else {
                                                                                  s0 = peg$FAILED;
                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c369); }
                                                                                }
                                                                                if (s0 === peg$FAILED) {
                                                                                  if (input.substr(peg$currPos, 6) === peg$c370) {
                                                                                    s0 = peg$c370;
                                                                                    peg$currPos += 6;
                                                                                  } else {
                                                                                    s0 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c371); }
                                                                                  }
                                                                                  if (s0 === peg$FAILED) {
                                                                                    if (input.substr(peg$currPos, 6) === peg$c372) {
                                                                                      s0 = peg$c372;
                                                                                      peg$currPos += 6;
                                                                                    } else {
                                                                                      s0 = peg$FAILED;
                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c373); }
                                                                                    }
                                                                                    if (s0 === peg$FAILED) {
                                                                                      if (input.substr(peg$currPos, 6) === peg$c374) {
                                                                                        s0 = peg$c374;
                                                                                        peg$currPos += 6;
                                                                                      } else {
                                                                                        s0 = peg$FAILED;
                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c375); }
                                                                                      }
                                                                                      if (s0 === peg$FAILED) {
                                                                                        if (input.substr(peg$currPos, 7) === peg$c376) {
                                                                                          s0 = peg$c376;
                                                                                          peg$currPos += 7;
                                                                                        } else {
                                                                                          s0 = peg$FAILED;
                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c377); }
                                                                                        }
                                                                                        if (s0 === peg$FAILED) {
                                                                                          if (input.substr(peg$currPos, 4) === peg$c378) {
                                                                                            s0 = peg$c378;
                                                                                            peg$currPos += 4;
                                                                                          } else {
                                                                                            s0 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c379); }
                                                                                          }
                                                                                          if (s0 === peg$FAILED) {
                                                                                            if (input.substr(peg$currPos, 7) === peg$c380) {
                                                                                              s0 = peg$c380;
                                                                                              peg$currPos += 7;
                                                                                            } else {
                                                                                              s0 = peg$FAILED;
                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c381); }
                                                                                            }
                                                                                            if (s0 === peg$FAILED) {
                                                                                              if (input.substr(peg$currPos, 6) === peg$c382) {
                                                                                                s0 = peg$c382;
                                                                                                peg$currPos += 6;
                                                                                              } else {
                                                                                                s0 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c383); }
                                                                                              }
                                                                                              if (s0 === peg$FAILED) {
                                                                                                if (input.substr(peg$currPos, 3) === peg$c384) {
                                                                                                  s0 = peg$c384;
                                                                                                  peg$currPos += 3;
                                                                                                } else {
                                                                                                  s0 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c385); }
                                                                                                }
                                                                                                if (s0 === peg$FAILED) {
                                                                                                  if (input.substr(peg$currPos, 7) === peg$c386) {
                                                                                                    s0 = peg$c386;
                                                                                                    peg$currPos += 7;
                                                                                                  } else {
                                                                                                    s0 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c387); }
                                                                                                  }
                                                                                                  if (s0 === peg$FAILED) {
                                                                                                    if (input.substr(peg$currPos, 9) === peg$c388) {
                                                                                                      s0 = peg$c388;
                                                                                                      peg$currPos += 9;
                                                                                                    } else {
                                                                                                      s0 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c389); }
                                                                                                    }
                                                                                                    if (s0 === peg$FAILED) {
                                                                                                      if (input.substr(peg$currPos, 3) === peg$c390) {
                                                                                                        s0 = peg$c390;
                                                                                                        peg$currPos += 3;
                                                                                                      } else {
                                                                                                        s0 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c391); }
                                                                                                      }
                                                                                                      if (s0 === peg$FAILED) {
                                                                                                        if (input.substr(peg$currPos, 6) === peg$c392) {
                                                                                                          s0 = peg$c392;
                                                                                                          peg$currPos += 6;
                                                                                                        } else {
                                                                                                          s0 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c393); }
                                                                                                        }
                                                                                                        if (s0 === peg$FAILED) {
                                                                                                          if (input.substr(peg$currPos, 9) === peg$c394) {
                                                                                                            s0 = peg$c394;
                                                                                                            peg$currPos += 9;
                                                                                                          } else {
                                                                                                            s0 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c395); }
                                                                                                          }
                                                                                                          if (s0 === peg$FAILED) {
                                                                                                            if (input.substr(peg$currPos, 8) === peg$c396) {
                                                                                                              s0 = peg$c396;
                                                                                                              peg$currPos += 8;
                                                                                                            } else {
                                                                                                              s0 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c397); }
                                                                                                            }
                                                                                                            if (s0 === peg$FAILED) {
                                                                                                              if (input.substr(peg$currPos, 8) === peg$c398) {
                                                                                                                s0 = peg$c398;
                                                                                                                peg$currPos += 8;
                                                                                                              } else {
                                                                                                                s0 = peg$FAILED;
                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c399); }
                                                                                                              }
                                                                                                              if (s0 === peg$FAILED) {
                                                                                                                if (input.substr(peg$currPos, 2) === peg$c400) {
                                                                                                                  s0 = peg$c400;
                                                                                                                  peg$currPos += 2;
                                                                                                                } else {
                                                                                                                  s0 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c401); }
                                                                                                                }
                                                                                                                if (s0 === peg$FAILED) {
                                                                                                                  if (input.substr(peg$currPos, 2) === peg$c402) {
                                                                                                                    s0 = peg$c402;
                                                                                                                    peg$currPos += 2;
                                                                                                                  } else {
                                                                                                                    s0 = peg$FAILED;
                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c403); }
                                                                                                                  }
                                                                                                                  if (s0 === peg$FAILED) {
                                                                                                                    if (input.substr(peg$currPos, 3) === peg$c404) {
                                                                                                                      s0 = peg$c404;
                                                                                                                      peg$currPos += 3;
                                                                                                                    } else {
                                                                                                                      s0 = peg$FAILED;
                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c405); }
                                                                                                                    }
                                                                                                                  }
                                                                                                                }
                                                                                                              }
                                                                                                            }
                                                                                                          }
                                                                                                        }
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseShortUnaryFunctionName() {
    var s0;

    if (input.charCodeAt(peg$currPos) === 97) {
      s0 = peg$c406;
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c407); }
    }
    if (s0 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 113) {
        s0 = peg$c408;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c409); }
      }
    }

    return s0;
  }

  function peg$parseNullaryFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 4) === peg$c410) {
      s0 = peg$c410;
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c411); }
    }

    return s0;
  }

  function peg$parsePushOrUnshift() {
    var s0;

    if (input.substr(peg$currPos, 4) === peg$c412) {
      s0 = peg$c412;
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c413); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c414) {
        s0 = peg$c414;
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c415); }
      }
    }

    return s0;
  }

  function peg$parseShiftOrPop() {
    var s0;

    if (input.substr(peg$currPos, 5) === peg$c416) {
      s0 = peg$c416;
      peg$currPos += 5;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c417); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 3) === peg$c418) {
        s0 = peg$c418;
        peg$currPos += 3;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c419); }
      }
    }

    return s0;
  }

  function peg$parseIncOrDec() {
    var s0;

    if (input.substr(peg$currPos, 3) === peg$c420) {
      s0 = peg$c420;
      peg$currPos += 3;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c421); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 3) === peg$c422) {
        s0 = peg$c422;
        peg$currPos += 3;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c423); }
      }
    }

    return s0;
  }

  function peg$parseStrictQuote() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 11) === peg$c424) {
      s1 = peg$c424;
      peg$currPos += 11;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c425); }
    }
    if (s1 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 39) {
        s1 = peg$c426;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c427); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c428();
    }
    s0 = s1;

    return s0;
  }

  function peg$parseQuote() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c429) {
      s1 = peg$c429;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c430); }
    }
    if (s1 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 96) {
        s1 = peg$c431;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c432); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c433();
    }
    s0 = s1;

    return s0;
  }

  function peg$parseUnquote() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7) === peg$c434) {
      s1 = peg$c434;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c435); }
    }
    if (s1 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 44) {
        s1 = peg$c33;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c34); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c436();
    }
    s0 = s1;

    return s0;
  }

  function peg$parseQuotedFunctionArg() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseFunctionArg();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c437(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseStrictQuotedFunctionArg() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseFunctionArg();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c438(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseVarFunctionArg() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parsePlainVarLookup();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c439(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 123) {
        s1 = peg$c31;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePlainVarLookup();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c35;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c36); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c439(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseFunctionArg() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseRawFunctionArg();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c440(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseRawFunctionArg() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseLocalAssignment();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c441(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseRepetition();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c442(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseConditional();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c443(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseFunction();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c444(s1);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseVarAssignment();
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c445(s1);
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$parseVarLookup();
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c446(s1);
              }
              s0 = s1;
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                s1 = peg$parseAlternation();
                if (s1 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c447(s1);
                }
                s0 = s1;
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  s1 = peg$parseDelimitedNodeList();
                  if (s1 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c448(s1);
                  }
                  s0 = s1;
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseDummyBrackets() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 91) {
      s1 = peg$c208;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c209); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 93) {
          s3 = peg$c213;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c214); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c449(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 123) {
        s1 = peg$c31;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseNodeList();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c35;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c36); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c450(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseDelimitedNodeList() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 123) {
      s1 = peg$c31;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c32); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 125) {
          s3 = peg$c35;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c36); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c448(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseArgList() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parseDelimitedNodeList();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseArgList();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c139(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$c21;
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c22();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseVarAssignmentList() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseVarAssignment();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseVarAssignmentList();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c451(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseVarAssignment();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c20(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseVarAssignment() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c452) {
      s1 = peg$c452;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c453); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseLocatedIdentifier();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c454(s2, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5) === peg$c455) {
        s1 = peg$c455;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c456); }
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 36) {
          s2 = peg$c457;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c458); }
        }
        if (s2 === peg$FAILED) {
          s2 = peg$c21;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseLocatedIdentifier();
          if (s3 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s4 = peg$c35;
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c36); }
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseFunctionArg();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c454(s3, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 91) {
          s1 = peg$c208;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c209); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseLocatedIdentifier();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 58) {
              s3 = peg$c110;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c111); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseNodeList();
              if (s4 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 93) {
                  s5 = peg$c213;
                  peg$currPos++;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c214); }
                }
                if (s5 !== peg$FAILED) {
                  s6 = peg$parse_();
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c454(s2, s4);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 91) {
            s1 = peg$c208;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c209); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseLocatedIdentifier();
            if (s2 !== peg$FAILED) {
              if (input.substr(peg$currPos, 2) === peg$c459) {
                s3 = peg$c459;
                peg$currPos += 2;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c460); }
              }
              if (s3 !== peg$FAILED) {
                s4 = peg$parseAltList();
                if (s4 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 93) {
                    s5 = peg$c213;
                    peg$currPos++;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c214); }
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parse_();
                    if (s6 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c461(s2, s4);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 91) {
              s1 = peg$c208;
              peg$currPos++;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c209); }
            }
            if (s1 !== peg$FAILED) {
              s2 = peg$parseLocatedIdentifier();
              if (s2 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 64) {
                  s3 = peg$c221;
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c222); }
                }
                if (s3 !== peg$FAILED) {
                  s4 = peg$parseXYCoord();
                  if (s4 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 2) === peg$c459) {
                      s5 = peg$c459;
                      peg$currPos += 2;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c460); }
                    }
                    if (s5 !== peg$FAILED) {
                      s6 = peg$parseAltList();
                      if (s6 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 93) {
                          s7 = peg$c213;
                          peg$currPos++;
                        } else {
                          s7 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c214); }
                        }
                        if (s7 !== peg$FAILED) {
                          s8 = peg$parse_();
                          if (s8 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c462(s2, s4, s6);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 91) {
                s1 = peg$c208;
                peg$currPos++;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c209); }
              }
              if (s1 !== peg$FAILED) {
                s2 = peg$parseLocatedIdentifier();
                if (s2 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c463) {
                    s3 = peg$c463;
                    peg$currPos += 2;
                  } else {
                    s3 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c464); }
                  }
                  if (s3 !== peg$FAILED) {
                    s4 = peg$parseXYCoord();
                    if (s4 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 3) === peg$c465) {
                        s5 = peg$c465;
                        peg$currPos += 3;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c466); }
                      }
                      if (s5 !== peg$FAILED) {
                        s6 = peg$parseAltList();
                        if (s6 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 93) {
                            s7 = peg$c213;
                            peg$currPos++;
                          } else {
                            s7 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c214); }
                          }
                          if (s7 !== peg$FAILED) {
                            s8 = peg$parse_();
                            if (s8 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c462(s2, s4, s6);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 36) {
                  s1 = peg$c457;
                  peg$currPos++;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c458); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = peg$parseLocatedIdentifier();
                  if (s2 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 61) {
                      s3 = peg$c97;
                      peg$currPos++;
                    } else {
                      s3 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c98); }
                    }
                    if (s3 !== peg$FAILED) {
                      s4 = peg$parseVarAssignmentTarget();
                      if (s4 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c467(s2, s4);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 36) {
                    s1 = peg$c457;
                    peg$currPos++;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c458); }
                  }
                  if (s1 !== peg$FAILED) {
                    s2 = peg$parseLocatedIdentifier();
                    if (s2 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 2) === peg$c468) {
                        s3 = peg$c468;
                        peg$currPos += 2;
                      } else {
                        s3 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c469); }
                      }
                      if (s3 !== peg$FAILED) {
                        s4 = peg$parseVarAssignmentTarget();
                        if (s4 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c470(s2, s4);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                  if (s0 === peg$FAILED) {
                    s0 = peg$currPos;
                    if (input.charCodeAt(peg$currPos) === 36) {
                      s1 = peg$c457;
                      peg$currPos++;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c458); }
                    }
                    if (s1 !== peg$FAILED) {
                      s2 = peg$parseLocatedIdentifier();
                      if (s2 !== peg$FAILED) {
                        if (input.substr(peg$currPos, 2) === peg$c471) {
                          s3 = peg$c471;
                          peg$currPos += 2;
                        } else {
                          s3 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c472); }
                        }
                        if (s3 !== peg$FAILED) {
                          s4 = peg$parseVarAssignmentTarget();
                          if (s4 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c473(s2, s4);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                    if (s0 === peg$FAILED) {
                      s0 = peg$currPos;
                      if (input.charCodeAt(peg$currPos) === 36) {
                        s1 = peg$c457;
                        peg$currPos++;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c458); }
                      }
                      if (s1 !== peg$FAILED) {
                        s2 = peg$parseLocatedIdentifier();
                        if (s2 !== peg$FAILED) {
                          if (input.substr(peg$currPos, 2) === peg$c474) {
                            s3 = peg$c474;
                            peg$currPos += 2;
                          } else {
                            s3 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c475); }
                          }
                          if (s3 !== peg$FAILED) {
                            s4 = peg$parseVarAssignmentTarget();
                            if (s4 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c476(s2, s4);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                      if (s0 === peg$FAILED) {
                        s0 = peg$currPos;
                        if (input.charCodeAt(peg$currPos) === 36) {
                          s1 = peg$c457;
                          peg$currPos++;
                        } else {
                          s1 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c458); }
                        }
                        if (s1 !== peg$FAILED) {
                          s2 = peg$parseLocatedIdentifier();
                          if (s2 !== peg$FAILED) {
                            if (input.substr(peg$currPos, 2) === peg$c477) {
                              s3 = peg$c477;
                              peg$currPos += 2;
                            } else {
                              s3 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c478); }
                            }
                            if (s3 !== peg$FAILED) {
                              s4 = peg$parseVarAssignmentTarget();
                              if (s4 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c479(s2, s4);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                        if (s0 === peg$FAILED) {
                          s0 = peg$currPos;
                          if (input.charCodeAt(peg$currPos) === 36) {
                            s1 = peg$c457;
                            peg$currPos++;
                          } else {
                            s1 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c458); }
                          }
                          if (s1 !== peg$FAILED) {
                            s2 = peg$parseLocatedIdentifier();
                            if (s2 !== peg$FAILED) {
                              if (input.substr(peg$currPos, 2) === peg$c480) {
                                s3 = peg$c480;
                                peg$currPos += 2;
                              } else {
                                s3 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c481); }
                              }
                              if (s3 !== peg$FAILED) {
                                s4 = peg$parseVarAssignmentTarget();
                                if (s4 !== peg$FAILED) {
                                  peg$savedPos = s0;
                                  s1 = peg$c482(s2, s4);
                                  s0 = s1;
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                          if (s0 === peg$FAILED) {
                            s0 = peg$currPos;
                            if (input.charCodeAt(peg$currPos) === 36) {
                              s1 = peg$c457;
                              peg$currPos++;
                            } else {
                              s1 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c458); }
                            }
                            if (s1 !== peg$FAILED) {
                              s2 = peg$parseLocatedIdentifier();
                              if (s2 !== peg$FAILED) {
                                if (input.substr(peg$currPos, 2) === peg$c483) {
                                  s3 = peg$c483;
                                  peg$currPos += 2;
                                } else {
                                  s3 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c484); }
                                }
                                if (s3 !== peg$FAILED) {
                                  s4 = peg$parseVarAssignmentTarget();
                                  if (s4 !== peg$FAILED) {
                                    peg$savedPos = s0;
                                    s1 = peg$c485(s2, s4);
                                    s0 = s1;
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                            if (s0 === peg$FAILED) {
                              s0 = peg$currPos;
                              if (input.substr(peg$currPos, 4) === peg$c486) {
                                s1 = peg$c486;
                                peg$currPos += 4;
                              } else {
                                s1 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c487); }
                              }
                              if (s1 !== peg$FAILED) {
                                s2 = peg$parseFunctionArg();
                                if (s2 !== peg$FAILED) {
                                  s3 = peg$parse_();
                                  if (s3 !== peg$FAILED) {
                                    peg$savedPos = s0;
                                    s1 = peg$c488(s2);
                                    s0 = s1;
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                              if (s0 === peg$FAILED) {
                                s0 = peg$currPos;
                                if (input.charCodeAt(peg$currPos) === 38) {
                                  s1 = peg$c59;
                                  peg$currPos++;
                                } else {
                                  s1 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c60); }
                                }
                                if (s1 !== peg$FAILED) {
                                  s2 = peg$parseVarAssignFunctionName();
                                  if (s2 !== peg$FAILED) {
                                    s3 = peg$parseQuotedFunctionArg();
                                    if (s3 !== peg$FAILED) {
                                      s4 = peg$parse_();
                                      if (s4 !== peg$FAILED) {
                                        peg$savedPos = s0;
                                        s1 = peg$c489(s2, s3);
                                        s0 = s1;
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseVarAssignFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 6) === peg$c490) {
      s0 = peg$c490;
      peg$currPos += 6;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c491); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 6) === peg$c492) {
        s0 = peg$c492;
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c493); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 6) === peg$c494) {
          s0 = peg$c494;
          peg$currPos += 6;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c495); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 6) === peg$c496) {
            s0 = peg$c496;
            peg$currPos += 6;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c497); }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseVarAssignmentTarget() {
    var s0, s1, s2;

    s0 = peg$parseDelimitedNodeList();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseFunctionArg();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c498(s1);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = [];
        if (peg$c499.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c500); }
        }
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            if (peg$c499.test(input.charAt(peg$currPos))) {
              s2 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c500); }
            }
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c501(s1);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseVarLookup() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c502) {
      s1 = peg$c502;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c503); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNumber();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c504(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c505) {
        s1 = peg$c505;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c506); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseNumber();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c35;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c36); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c504(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseVarIdentifier();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c507(s1);
        }
        s0 = s1;
      }
    }

    return s0;
  }

  function peg$parsePlainVarLookup() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseVarIdentifier();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c508(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseVarIdentifier() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 36) {
      s1 = peg$c457;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c458); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseLocatedIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c509(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c510) {
        s1 = peg$c510;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c511); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseLocatedIdentifier();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s5 = peg$c35;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c36); }
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c509(s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseAlternation() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 123) {
      s1 = peg$c31;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c32); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 124) {
          s3 = peg$c512;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c513); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseAltList();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c35;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c36); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c514(s2, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 91) {
        s1 = peg$c208;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c209); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseNodeList();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 124) {
            s3 = peg$c512;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c513); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseAltList();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 93) {
                s5 = peg$c213;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c214); }
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c514(s2, s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseAltList() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseNodeList();
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 124) {
        s2 = peg$c512;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c513); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseAltList();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c515(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseNodeList();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c516(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseCappedIdentifier() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (peg$c517.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c518); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c519.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c520); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c519.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c520); }
        }
      }
      if (s2 !== peg$FAILED) {
        if (peg$c521.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c522); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          if (peg$c519.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c520); }
          }
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            if (peg$c519.test(input.charAt(peg$currPos))) {
              s5 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c520); }
            }
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c523(s1, s2, s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseUpperCaseIdentifier() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (peg$c517.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c518); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c524.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c525); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c524.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c525); }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c526(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseText() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c527.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c528); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c527.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c528); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c529(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseNumber() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c530.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c531); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c530.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c531); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c532(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseFloat() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c530.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c531); }
    }
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      if (peg$c530.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c531); }
      }
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 46) {
        s2 = peg$c533;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c534); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        if (peg$c530.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c531); }
        }
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            if (peg$c530.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c531); }
            }
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c535(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSignedNumber() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 43) {
      s2 = peg$c536;
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c537); }
    }
    if (s2 !== peg$FAILED) {
      s3 = peg$parse_();
      if (s3 !== peg$FAILED) {
        s2 = [s2, s3];
        s1 = s2;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      s1 = peg$c21;
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNumber();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c538(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 45) {
        s1 = peg$c539;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c540); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseNumber();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c541(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseLocatedIdentifier() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseRawIdentifier();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c542(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseRawIdentifier() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (peg$c543.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c544); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c519.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c520); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c519.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c520); }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c526(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parse_() {
    var s0, s1;

    peg$silentFails++;
    s0 = [];
    if (peg$c546.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c547); }
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      if (peg$c546.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c547); }
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c545); }
    }

    return s0;
  }

  function peg$parseAdditiveExpr() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseMultiplicativeExpr();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = peg$parse_();
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 43) {
          s5 = peg$c536;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c537); }
        }
        if (s5 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 45) {
            s5 = peg$c539;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c540); }
          }
        }
        if (s5 !== peg$FAILED) {
          s6 = peg$parse_();
          if (s6 !== peg$FAILED) {
            s7 = peg$parseMultiplicativeExpr();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 43) {
              s5 = peg$c536;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c537); }
            }
            if (s5 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 45) {
                s5 = peg$c539;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c540); }
              }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseMultiplicativeExpr();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c548(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parseMultiplicativeExpr();
    }

    return s0;
  }

  function peg$parseMultiplicativeExpr() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parsePrimaryExpr();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = peg$parse_();
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 42) {
          s5 = peg$c549;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c550); }
        }
        if (s5 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 47) {
            s5 = peg$c73;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c74); }
          }
        }
        if (s5 !== peg$FAILED) {
          s6 = peg$parse_();
          if (s6 !== peg$FAILED) {
            s7 = peg$parsePrimaryExpr();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 42) {
              s5 = peg$c549;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c550); }
            }
            if (s5 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 47) {
                s5 = peg$c73;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c74); }
              }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parsePrimaryExpr();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c551(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parsePowerExpr();
    }

    return s0;
  }

  function peg$parsePowerExpr() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = peg$parsePrimaryExpr();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 94) {
          s3 = peg$c552;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c553); }
        }
        if (s3 === peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c554) {
            s3 = peg$c554;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c555); }
          }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsePrimaryExpr();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c556(s1, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 101) {
        s1 = peg$c557;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c558); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c559) {
          s1 = peg$c559;
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c560); }
        }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 94) {
            s3 = peg$c552;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c553); }
          }
          if (s3 === peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c554) {
              s3 = peg$c554;
              peg$currPos += 2;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c555); }
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsePrimaryExpr();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c561(s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 3) === peg$c559) {
          s1 = peg$c559;
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c560); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 40) {
              s3 = peg$c562;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c563); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseAdditiveExpr();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parse_();
                  if (s6 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 41) {
                      s7 = peg$c564;
                      peg$currPos++;
                    } else {
                      s7 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c565); }
                    }
                    if (s7 !== peg$FAILED) {
                      s8 = peg$parse_();
                      if (s8 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c561(s5);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parsePrimaryExpr();
        }
      }
    }

    return s0;
  }

  function peg$parsePrimaryExpr() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    s1 = peg$parseFloat();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c566(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseNumber();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c567(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseFunctionArg();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c568(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 40) {
            s1 = peg$c562;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c563); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse_();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseAdditiveExpr();
              if (s3 !== peg$FAILED) {
                s4 = peg$parse_();
                if (s4 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 41) {
                    s5 = peg$c564;
                    peg$currPos++;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c565); }
                  }
                  if (s5 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c569(s3);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
      }
    }

    return s0;
  }

  function peg$parseRegularExpressionLiteral() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 47) {
      s1 = peg$c73;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c74); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseRegularExpressionBody();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 47) {
          s3 = peg$c73;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c74); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseRegularExpressionFlags();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c570(s2, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c571) {
        s1 = peg$c571;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c572); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseRegularExpressionFlags();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c573(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseRegularExpressionBody() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parseRegularExpressionFirstChar();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseRegularExpressionChars();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c574(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseRegularExpressionChars() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseRegularExpressionChar();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseRegularExpressionChar();
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c575(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseRegularExpressionFirstChar() {
    var s0, s1, s2;

    s0 = peg$parseRegexUnquote();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$currPos;
      peg$silentFails++;
      if (peg$c576.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c577); }
      }
      peg$silentFails--;
      if (s2 === peg$FAILED) {
        s1 = void 0;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseRegularExpressionNonTerminator();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c578(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$parseRegularExpressionBackslashSequence();
        if (s0 === peg$FAILED) {
          s0 = peg$parseRegularExpressionClass();
        }
      }
    }

    return s0;
  }

  function peg$parseRegularExpressionChar() {
    var s0, s1, s2;

    s0 = peg$parseRegexUnquote();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$currPos;
      peg$silentFails++;
      if (peg$c579.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c580); }
      }
      peg$silentFails--;
      if (s2 === peg$FAILED) {
        s1 = void 0;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseRegularExpressionNonTerminator();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c578(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$parseRegularExpressionBackslashSequence();
        if (s0 === peg$FAILED) {
          s0 = peg$parseRegularExpressionClass();
        }
      }
    }

    return s0;
  }

  function peg$parseRegularExpressionBackslashSequence() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 92) {
      s1 = peg$c6;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c7); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseRegularExpressionNonTerminator();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c581(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseRegularExpressionNonTerminator() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$currPos;
    peg$silentFails++;
    s2 = peg$parseLineTerminator();
    peg$silentFails--;
    if (s2 === peg$FAILED) {
      s1 = void 0;
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseSourceCharacter();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c578(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseRegularExpressionClass() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 91) {
      s1 = peg$c208;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c209); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseRegularExpressionClassChars();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 93) {
          s3 = peg$c213;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c214); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c582(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseRegularExpressionClassChars() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseRegularExpressionClassChar();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseRegularExpressionClassChar();
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c583(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseRegularExpressionClassChar() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$currPos;
    peg$silentFails++;
    if (peg$c584.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c585); }
    }
    peg$silentFails--;
    if (s2 === peg$FAILED) {
      s1 = void 0;
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseRegularExpressionNonTerminator();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c578(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parseRegularExpressionBackslashSequence();
    }

    return s0;
  }

  function peg$parseRegularExpressionFlags() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c586.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c587); }
    }
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      if (peg$c586.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c587); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c588(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseLineTerminator() {
    var s0;

    if (peg$c589.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c590); }
    }

    return s0;
  }

  function peg$parseSourceCharacter() {
    var s0;

    if (input.length > peg$currPos) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c8); }
    }

    return s0;
  }


  function extend (dest) {
    dest = dest || {}
    Array.prototype.slice.call (arguments, 1).forEach (function (src) {
      if (src)
        Object.keys(src).forEach (function (key) { dest[key] = src[key] })
    })
    return dest
  }

  function addLocation (node, tag) {
    if (location) {
      var loc = location()
      tag = tag || 'pos'
      node[tag] = [loc.start.offset, loc.end.offset - loc.start.offset]
    }
    return node
  }

  function noLocation (builder) {
    var tmpLocation = location
    location = null
    var node = builder()
    location = tmpLocation
    return node
  }

  function copyLocation (destNode, srcNode, destTag, srcTag) {
    srcTag = srcTag || 'pos'
    destTag = destTag || 'pos'
    destNode[destTag] = srcNode[srcTag]
    return destNode
  }

  function arrayWithPos (node) {
    var result = [node]
    if (node.pos)
      result.pos = node.pos
    return result
  }

  function makeNode (type, props) {
    return addLocation (extend ({ type: type }, props))
  }

  function pseudoFunction (tag, builder) {
    return addLocation (extend ({ functag: tag }, noLocation (builder)))
  }

  function makeRep (unit, min, max) { return makeNode ('rep', { unit: unit, min: min, max: max }) }
  function makeSymbolMethod (symInfo, method, args) {
    return makeNode ('sym',
  		   extend (getLocatedSymName (symInfo),
  			   { method: method,
  			     bind: args }));
  }
  function makeLookup (name) { return makeNode ('lookup', getLocatedVarName (name)) }
  function makeAssign (name, value, visible) {
    return makeNode ('assign',
  		   extend (getLocatedVarName (name),
  			   { value: value,
  			     visible: visible }));
  }
  function makeLocalAssign (name, value, scope) {
    return makeNode ('assign',
  		   extend (getLocatedVarName (name),
  			   { value: value,
  			     local: scope }));
  }
  function makeAlternation (opts) { return makeNode ('alt', { opts: opts }) }
  function makeConditional (testArg, trueArg, falseArg) { return makeNode ('cond', { test: testArg, t: trueArg, f: falseArg }) }
  function makeFunction (name, args, useArgPos) {
    var node = makeNode ('func', { funcname: funcAlias[name] || name, args: args })
    if (useArgPos && args.pos)
      node.pos = args.pos
    return node
  }

  var funcAlias = { q: 'quotify' }

  function wrapNodes (args) { return (args.length === 1 && typeof(args[0]) !== 'string') ? args[0] : makeRoot (args) }
  function makeRoot (args) {
    var node = makeNode ('root', { rhs: args })
    if (args.pos)
      node.pos = args.pos
    return node
  }

  function wrapIdentifier (name) { return addLocation ({ text: name }) }
  function getLocatedVarName (wrappedIdentifier) {
    return (typeof(wrappedIdentifier) === 'object'
  	  ? { varname: wrappedIdentifier.text.toLowerCase(),
  	      varpos: wrappedIdentifier.pos }
  	  : { varname: wrappedIdentifier });
  }
  function getLocatedSymName (symInfo) {
    var user = symInfo.user, name = symInfo.name;
    var result = {};
    if (typeof(name) === 'object') {
      result.name = name.text.toLowerCase();
      result.sympos = name.pos;
    } else
      result.name = name.toLowerCase();
    if (user) {
      if (typeof(user) === 'object') {
        result.user = user.text.toLowerCase();
        result.userpos = user.pos;
      } else
        result.user = user.toLowerCase();
    }
    return result;
  }
  function getLocatedText (wrappedIdentifier) {
    return (typeof(wrappedIdentifier) === 'object'
  	  ? wrappedIdentifier.text
  	  : wrappedIdentifier);
  }

  function makeValue (args) { return makeFunction ('value', args) }

  function makeQuote (args) { return makeFunction ('quote', args) }
  function makeStrictQuote (args) { return makeFunction ('strictquote', args) }

  // pseudoQuote is makeQuote but called non-locally, so it needs to get its location from the arguments
  function pseudoQuote (args) { return makeFunction ('quote', args, true) }
  function pseudoStrictQuote (args) { return makeFunction ('strictquote', args, true) }

  function makeListFunction (func, listvar, list, inner) { return makeFunction (func, [makeLocalAssign (listvar, list, inner)]) }
  function makeReduceFunction (varname, list, result, init, func) { return makeListFunction ('reduce', varname, list, [makeLocalAssign (result, init, func)]) }
  function makeRegexFunction (func, pattern, text, expr) { return makeFunction (func, [wrapNodes(pattern.body), wrapNodes(pattern.flags), wrapNodes(text)].concat (expr || [])) }

  function makeModify (name, func, val) { return makeAssign (name, [makeFunction (func, [makeLookup (name), wrapNodes (val)])]) }
  function makeModifyConcat (name, suffix) { return makeAssign (name, [makeLookup (name)].concat (suffix)) }

  function makeArgList (args) {
    return args && args.length ? [makeFunction ('list', args.map (wrapNodes))] : undefined
  }

  function makeAltAssignRhs (opts) {
    return opts.length === 1 ? opts[0] : arrayWithPos (pseudoAlternation (opts))
  }

  function pseudoAlternation (opts) {
    var alt = makeAlternation (opts)
    if (opts.pos)
      alt.pos = opts.pos
    return alt
  }

  function makeSymbol (symInfo, args) { return makeSymbolMethod (symInfo, 'expand', args) }
  function makeGetSymbol (symInfo) { return makeSymbolMethod (symInfo, 'get') }
  function makeSetSymbol (symInfo, args) { return makeSymbolMethod (symInfo, 'set', args) }

  function makeLinkShortcut (text) {
    var symName = text.toLowerCase()
        .replace(/^[^a-z0-9_]*/,'')
        .replace(/[^a-z0-9_]*$/,'')
        .replace(/'/g,'')
        .replace(/[^a-z0-9_]+/g,'_');
    var loc = addLocation({})
    return (symName.length
  	  ? extend (makeFunction ('link',
  				  [makeRoot ([text]),
  				   makeQuote ([copyLocation (makeTraceryExpr (symName, []),
  							     { pos: [loc.pos[0]+2, loc.pos[1]-4] })])]),
  		    { isShortcut: true })  // this flag is just for convenience of parse tree analysis, it is not strictly needed
  	  : ('[[' + text + ']]'))
  }

  var defaultListVarName = '_'
  var defaultJoinText = ' '
  var defaultSplitPattern = '[ \\t\\r\\n]+'
  function makeGroupVarName (n) { return '$' + n }

  function concatNodes (head, tail) {
    return typeof(head) === 'string' && tail.length && typeof(tail[0]) === 'string'
      ? [head + tail[0]].concat(tail.slice(1))
      : [head].concat(tail)
  }

  function concatReduce (list) {
    return list.reduce (function (result, item) {
      return typeof(item) === 'string' && result.length && typeof(result[result.length-1]) === 'string'
        ? result.slice(0,result.length-1).concat ([result[result.length-1] + item])
        : result.concat([item])
    }, [])
  }

  function makeLocalAssignChain (assigns, scope) {
    var list = assigns.slice(0).reverse().reduce (function (chain, assign) {
      return [copyLocation (makeLocalAssign (assign.varname, assign.value, chain), assign, 'pos_assign')]
    }, scope)
    return list[0]
  }

  function makeCapped (args) { return makeFunction ('cap', args) }
  function makeUpperCase (args) { return makeFunction ('uc', args) }

  function sugarize (makeNode, info, name, args) {
    var node = makeNode (info, args)
    var text = getLocatedText (name)
    if (text.match(/^[0-9_]*[A-Z].*[a-z]/))
      return makeCapped ([node])
    else if (text.match(/[A-Z]/) && !text.match(/[a-z]/))
      return makeUpperCase ([node])
    return node
  }

  function makeSugaredSymbol (symInfo, args) {
    return sugarize (makeSymbol, symInfo, symInfo.name, args)
  }

  function makeSugaredLookup (name) {
    return sugarize (makeLookup, name, name)
  }

  function makeTraceryExpr (sym, mods) {
    return mods.reduce (function (expr, mod) {
      return makeFunction (mod, [expr])
    }, makeConditional ([makeLookup(sym)], [makeFunction('eval',[makeLookup(sym)])], [makeSymbol({name:sym})]))
  }

  function makeProbExpr (probArg, trueArg, falseArg) {
    return pseudoFunction
    ('prob',
     function() {
       return makeConditional ([makeFunction ('lt',
  					    [makeFunction ('random', ['1']),
  					     wrapNodes (probArg)])],
  			     trueArg,
  			     falseArg)
     })
  }

  function validRange (min, max) {
    return min <= max
  }

  function makeDefineFunction (args, inner) {
    return pseudoFunction
    ('function',
     function() { return makeQuote ([makeLocalAssignChain (args.map (function (arg, n) { return makeAssign (arg, [makeLookup (makeGroupVarName (n + 1))]) }), inner)]) })
  }

  function makeMeter (icon, expr, status) {
    return pseudoFunction
    ('meter',
     function() { return makeFunction ('push', [makeStrictQuote ([makeLookup ('meters')]),
  					      wrapNodes (makeArgList ([makeArgList ([icon,
  										     [makeStrictQuote ([makeFunction ('math', [expr])])]]
  										    .concat (status ? [status] : []))]))]) })
  }

  function makeRotate (arg) {
    return pseudoFunction
    ('rotate',
     function() { return makeFunction ('append', [makeFunction ('notfirst', arg),
  						makeFunction ('first', arg)]) })
  }

  function makeCycle (v, list, bump) {
    var vLookup = v[0].args, varname = v[0].args[0].varname
    return pseudoFunction
    (bump ? 'bump' : 'cycle',
     function() { return makeFunction ('eval',
  				     [makeFunction ('first', [makeAssign (varname,
  									  [makeConditional (v[0].args,
  											    [bump
  											     ? makeFunction ('bump',
  													     wrapNodes ([vLookup]))
  											     : makeRotate (vLookup)],
  											    bump
  											    ? [makeFunction ('shuffle',
  													     list)]
  											    : list)],
  									  true)])]) })
  }

  function makeQueue (v, list) {
    var vLookup = v[0].args, varname = v[0].args[0].varname
    return pseudoFunction
    ('queue',
     function() { return makeFunction ('eval',
  				     [makeConditional ([makeFunction ('islist',
  								      wrapNodes ([vLookup]))],
  						       [],
  						       [makeAssign (varname, list)]),
  				      makeFunction ('shift', v)]) })
  }

  function makeImportanceSampler (num, expr, template) {
    return pseudoFunction
    ('imp',
     function() { return makeLocalAssignChain
  		([{ varname: 'samples',
  		    value: [] },
  		  { varname: 'weights',
  		    value: [makeListFunction
  			    ('map',
  			     defaultListVarName,
  			     [makeFunction ('iota', [num.toString()])],
  			     [makeStrictQuote ([makeFunction ('push', [makeStrictQuote ([makeLookup ('samples')]),
  								       makeFunction ('eval', template)]),
  						makeFunction ('eval', [makeStrictQuote ([makeFunction ('math', [expr])])])])])] }],
  		 [makeFunction ('nth',
  				[makeFunction ('sample', [makeLookup ('weights')]),
  				 makeLookup ('samples')])]) })
  }

  function makePreserve (arg) {
    return pseudoFunction
    ('preserve',
     function() { return makeQuote ([makeFunction ('unquote', ['$'].concat (arg)),
  				   '=',
  				   makeFunction ('unquote', [makeFunction ('quotify', [makeFunction ('eval', ['$'].concat (arg))])])]) })
  }

  var rhymeTries = 10, rhymeWeight = 100
  function makeRhyme (a, b, tries) {
    return pseudoFunction
    ('rhyme',
     function() { return makeLocalAssignChain
  		([{ varname: 'a', value: [] },
  		  { varname: 'b', value: [] }],
  		 [makeImportanceSampler (tries || rhymeTries,
  					 makeFunction ('pow',
  						       [rhymeWeight.toString(),
  							makeFunction ('assonance',
  								      [makeLookup('a'),
  								       makeLookup('b')])]),
  					 [makeStrictQuote ([makeAssign ('a', a, true),
  							    makeAssign ('b', b, true)])])]) })
  }

  function makeLayout (coord, args) {
    return makeLayoutNoQuote (coord, pseudoQuote (args))
  }

  function makeLayoutNoQuote (coord, arg) {
    return makeFunction ('layout', [coord, arg])
  }

  function makePlaceholder (args, coord) {
    return makeFunction ('placeholder', [pseudoQuote (args), coord])
  }


  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
}

module.exports = {
  SyntaxError: peg$SyntaxError,
  parse:       peg$parse
};

},{}],5:[function(require,module,exports){
window.bracery = require('./bracery');

},{"./bracery":1}],6:[function(require,module,exports){
var ParseTree = require('./parsetree')
var extend = ParseTree.extend

var defaultMaxReplies = 100

function makeTagArray (text) {
  return text.replace (/^\s*(.*?)\s*$/, function (_m, g) { return g })
    .split(/\s+/)
    .map (function (tag) { return tag.toLowerCase() })
}

function makeTagString (text, prefix, suffix) {
  prefix = prefix || ''
  suffix = suffix || ''
  return (text
          ? (' ' + makeTagArray(text).map(function(tag){return prefix+tag+suffix}).join(' ') + ' ')
	  : '')
}

function parseTemplateDefs (text) {
  var templates = [], allTemplates = []
  var initCommandParam = { 'PREV': '',
			   'TAGS': '',
			   'TITLE': '',
			   'WEIGHT': '',
			   'AUTHOR': '',
                           'PREFIX': '',
                           'SUFFIX': '' },
      commandParam = extend ({}, initCommandParam)
  try {
    var newTemplateDefReg = /^([\d\.]*)(@.*?|)(>+)\s*(.*?)\s*(#\s*(.*?)\s*(#\s*(.*?)\s*|)|)$/;
    var commandReg = /^ *## +(\S+)\s?(.*?)\s*$/;
    var commentReg = /^ *#([^#]*|[^#]* .*)$/;
    var localSymbolReg = /~[~\*]([A-Za-z0-9_]+)/g;
    var localTagReg = /\*(\S+)/g;
    var localTagInBodyReg = /#[#\*](\S+)/g;
    function expandLocalTag (_m, tag) { return commandParam['PREFIX'] + tag + commandParam['SUFFIX'] }
    function expandLocalSymbol (_m, sym) {
      var newSym = commandParam['PREFIX'] + sym + commandParam['SUFFIX']
      if (sym.toUpperCase() === sym)
        newSym = newSym.toUpperCase()
      else if (sym[0].toUpperCase() === sym[0])
        newSym = newSym[0].toUpperCase() + newSym.substr(1).toLowerCase()
      else
        newSym = newSym.toLowerCase()
      return "~" + newSym
    }
    var replyChain = [], currentTemplates = [], newTemplateDefMatch, commandMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        line = line.replace (localSymbolReg, function (_m, sym) { return "~" + commandParam['PREFIX'] + sym + commandParam['SUFFIX'] })
        if (commandMatch = commandReg.exec (line)) {
	  var param = commandMatch[1], value = commandMatch[2]
	  if (param === 'RESET') {
	    if (value)  // RESET XXX resets the param setting for XXX
	      commandParam[value] = initCommandParam[value]
	    else  // RESET without an argument resets all params
	      commandParam = extend ({}, initCommandParam)
	  } else
	    commandParam[param] = value
        } else if (commentReg.exec (line)) {
          /* comment, do nothing */
        } else if (currentTemplates.length) {
          line = line.replace (localTagInBodyReg, expandLocalTag)
          var parsedLine = ParseTree.parseRhs (line)
          currentTemplates.forEach (function (currentTemplate) {
            currentTemplate.opts.push (parsedLine)
          })
        } else if (newTemplateDefMatch = newTemplateDefReg.exec (line)) {
          var weight = newTemplateDefMatch[1] || commandParam['WEIGHT'],
              author = newTemplateDefMatch[2] || commandParam['AUTHOR'],
              depth = newTemplateDefMatch[3].length - 1,
	      title = commandParam['TITLE'] + (newTemplateDefMatch[4] || ''),
	      prevTags = (makeTagString ((newTemplateDefMatch[6] || '') + ' ' + commandParam['PREV'])
                          .replace (localTagReg, expandLocalTag)),
	      tags = (makeTagString ((newTemplateDefMatch[8] || '') + ' ' + commandParam['TAGS'])
                      .replace (localTagReg, expandLocalTag))
          var isRoot = depth === 0 && (!prevTags.match(/\S/) || (prevTags.search(' root ') >= 0))
          var authorNames = author ? author.substr(1).split(',') : [null]
          currentTemplates = authorNames.map (function (authorName) {
            var currentTemplate = { title: title,
                                    author: authorName,
			            previousTags: prevTags,
			            tags: tags,
                                    isRoot: isRoot,
                                    weight: weight.length ? parseInt(weight) : undefined,
			            opts: [],
                                    replies: [] }
            if (depth > replyChain.length)
              throw new Error ("Missing replies in chain")
            replyChain = replyChain.slice (0, depth)
            if (depth > 0)
              replyChain[depth-1].replies.push (currentTemplate)
            else
              templates.push (currentTemplate)
            replyChain.push (currentTemplate)
            allTemplates.push (currentTemplate)
            return currentTemplate
          })
        } else
          console.warn ("Can't parse template definition line: " + line)
      } else {
        // line is empty
        currentTemplates = []
      }
    })
  } catch(e) { console.log(e) }
  allTemplates.forEach (function (template) {
    template.content = ParseTree.addFooter (template.opts.length
			                    ? (template.opts.length > 1
			                       ? [ { type: 'alt', opts: template.opts } ]
			                       : template.opts[0])
			                    : [])
    delete template.opts
  })
  return templates
}

function flattenTemplates (templates, parent) {
  return templates.reduce (function (allTemplates, template) {
    template.parent = parent
    return allTemplates.concat (flattenTemplates (template.replies, template))
  }, templates)
}

function sampleTemplate (templates, rng) {
  rng = rng || Math.random
  //  console.warn ("Templates: " + templates.map((t)=>t.title).join(","))
  var totalWeight = templates.reduce (function (total, template) { return total + (template.weight || 1) }, 0)
  var w = totalWeight * rng()
  for (var i = 0; i < templates.length; ++i)
    if ((w -= (templates[i].weight || 1)) <= 0)
      return templates[i]
  return undefined
}

function randomRootTemplate (templates, rng) {
  return sampleTemplate (allRootTemplates (templates), rng)
}

function randomReplyTemplate (templates, tags, prevTemplate, rng) {
  return sampleTemplate (allReplyTemplates (templates, tags, prevTemplate), rng)
}

function allRootTemplates (templates) {
  return templates.filter (function (template) { return template.isRoot })
}

function allReplyTemplates (templates, tags, prevTemplate) {
  var tagArray = typeof(tags) === 'string' ? makeTagArray(tags) : tags
  return templates.filter (function (template) {
    if (prevTemplate && prevTemplate.replies.indexOf (template) >= 0)
      return true
    var prevTags = makeTagArray (template.previousTags)
    var allowedTags = prevTags.filter (function (tag) { return tag[0] !== '!' && tag[0] !== '-' && tag[0] !== '+' })
    var excludedTags = prevTags.filter (function (tag) { return tag[0] === '!' || tag[0] === '-' }).map (function (xtag) { return xtag.substr(1) })
    var requiredTags = prevTags.filter (function (tag) { return tag[0] === '+' }).map (function (xtag) { return xtag.substr(1) })
    return requiredTags.reduce (function (match, xtag) {
      return match && tagArray.indexOf(xtag) >= 0
    }, excludedTags.reduce (function (match, xtag) {
      return match && tagArray.indexOf(xtag) < 0
    }, (allowedTags.length === 0 ||
        allowedTags.reduce (function (match, tag) {
          return match || tagArray.indexOf(tag) >= 0
        }, false))))
  })
}

function promiseMessageList (config) {
  var bracery = config.bracery, templates = config.templates
  var maxReplies = typeof(config.maxReplies) === 'undefined' ? defaultMaxReplies : config.maxReplies
  var accept = config.accept || function (_expansion, _thread, callback) { callback(true) }
  var prevMessage = config.previousMessage
  var generateTemplate = (prevMessage
                          ? randomReplyTemplate.bind (null, templates, prevMessage.tags, prevMessage.template)
                          : randomRootTemplate.bind (null, templates))
  var allTemplates = (prevMessage
                      ? allReplyTemplates.bind (null, templates, prevMessage.tags, prevMessage.template)
                      : allRootTemplates.bind (null, templates))
  function generateMessage (template) {
    var message
    var template = template || generateTemplate (config.rng)
    if (template) {
      var initVars = extend ({},
                             config.vars || {},
                             { tags: template.tags || '',
                               accept: '',
                               reject: '' })
      var vars = extend ({}, initVars)
      message = { template: template,
                  vars: extend ({}, vars),
                  expansion: bracery._expandRhs (extend ({},
                                                         config,
                                                         { rhs: ParseTree.sampleParseTree (ParseTree.addFooter (template.content),
                                                                                           { rng: bracery.rng }),
                                                           vars: vars })) }
      message.title = vars.title || template.title
      message.vars = extend ({}, initVars)
      message.nextVars = extend ({}, vars)
      message.tags = message.nextVars.tags   // this will be overwritten by a future call to extractTags, but is useful for debugging to get a preview of the tags
    }
    return message
  }
  function extractTags (message) {
    message.tags = message.nextVars.prevtags = message.nextVars.tags
    delete message.nextVars.tags
    delete message.nextVars.accept
    delete message.nextVars.reject
    return message
  }
  
  function hasReject (message) {
    return message && message.nextVars && message.nextVars.reject
  }

  function isChoice (message) {
    return message && message.nextVars && (message.nextVars.accept || message.nextVars.reject)
  }
  
  function appendChoiceFooter (message, choice) {
    if (message) {
      var footer = ParseTree.makeFooter (choice)
      if (!message.footerVars) {
        message.footerVars = extend ({}, message.nextVars)
        delete message.nextVars
      }
      var vars = extend ({}, message.footerVars)
      var footerExpansion = bracery._expandRhs (extend ({},
                                                        config,
                                                        { rhs: ParseTree.sampleParseTree (footer,
                                                                                          { rng: bracery.rng }),
                                                          vars: vars }))
      message.expansion.text = message.expansion.text + footerExpansion.text
      message.expansion.tree.push (footerExpansion.tree)
      message.nextVars = extend ({}, vars)
    }
    return extractTags (message)
  }

  function promiseMessage (template) {
    var proposedMessage = generateMessage (template)
    return new Promise (function (resolve, reject) {
      if (!proposedMessage)
        resolve (true)
      else
        accept (proposedMessage, config.thread, resolve, allTemplates)
    }).then (function (accepted) {
      var result = (typeof(accepted) === 'object'
                    ? promiseMessage (extractTags (accepted))
                    : (accepted
                       ? (isChoice(proposedMessage) ? appendChoiceFooter(proposedMessage,'accept') : proposedMessage)
                       : (hasReject(proposedMessage) ? appendChoiceFooter(proposedMessage,'reject') : promiseMessage())))
      return result
    })
  }
  return promiseMessage()
    .then (function (message) {
      return (message
              ? ((maxReplies > 0 || typeof(maxReplies) === 'undefined' || maxReplies === null)
                 ? (promiseMessageList (extend ({},
                                                config,
                                                { previousMessage: message,
                                                  vars: message.nextVars,
                                                  thread: (config.thread || []).concat (message),
                                                  maxReplies: (maxReplies ? maxReplies - 1 : maxReplies) }))
                    .then (function (replies) {
                      return [message].concat (replies)
                    }))
                 : [message])
              : [])
    })
}

module.exports = { parseTemplateDefs: parseTemplateDefs,
                   flattenTemplates: flattenTemplates,
                   sampleTemplate: sampleTemplate,
                   allRootTemplates: allRootTemplates,
                   allReplyTemplates: allReplyTemplates,
                   randomRootTemplate: randomRootTemplate,
                   randomReplyTemplate: randomReplyTemplate,
                   promiseMessageList: promiseMessageList,
                   makeTagArray: makeTagArray,
                   makeTagString: makeTagString }

},{"./parsetree":3}]},{},[5]);
