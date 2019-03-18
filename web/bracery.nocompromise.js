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
        ['name','id','method'].forEach (function (key) {
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

function getSymbolNodes (rhs, ignoreTracery) {
  var pt = this
  return rhs.reduce (function (result, node) {
    var r
    if (typeof(node) === 'object')
      switch (node.type) {
      case 'lookup':
        break
      case 'assign':
        r = pt.getSymbolNodes ((node.value || []).concat (node.local || []), ignoreTracery)
        break
      case 'alt':
        r = node.opts.reduce (function (altResults, opt) {
          return altResults.concat (pt.getSymbolNodes (opt, ignoreTracery))
        }, [])
        break
      case 'rep':
        r = pt.getSymbolNodes (node.unit, ignoreTracery)
        break
      case 'func':
	switch (node.funcname) {
	case 'eval':
	  r = pt.getSymbolNodes (node.args.concat (node.value || []), ignoreTracery)
	  break
	case 'strictquote':
	case 'quote':
	case 'unquote':
        default:
	  r = pt.getSymbolNodes (node.args, ignoreTracery)
          break
	}
        break
      case 'cond':
        if (!(ignoreTracery && isTraceryExpr (node)))
          r = pt.getSymbolNodes (node.test.concat (node.t, node.f), ignoreTracery)
        break
      case 'root':
      case 'alt_sampled':
        r = pt.getSymbolNodes (node.rhs, ignoreTracery)
        break
      case 'rep_sampled':
        r = pt.getSymbolNodes (node.reps.reduce (function (all, rep) { return all.concat(rep) }, []), ignoreTracery)
        break
      default:
      case 'sym':
        r = [node]
	r = r.concat (pt.getSymbolNodes (node.rhs || node.bind || [], ignoreTracery))
        break
      }
    return r ? result.concat(r) : result
  }, [])
}

// parseTreeEmpty returns true if a tree contains no nonwhite characters OR unexpanded symbols
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

// #x# expands to &if{$x}{&eval{$x}}{~x}
function isTraceryExpr (node, makeSymbolName) {
  makeSymbolName = makeSymbolName || defaultMakeSymbolName
  return typeof(node) === 'object' && node.type === 'cond'
    && node.test.length === 1 && typeof(node.test[0]) === 'object' && node.test[0].type === 'lookup'
    && node.t.length === 1 && isEvalVar (node.t[0])
    && node.f.length === 1 && typeof(node.f[0]) === 'object' && node.f[0].type === 'sym' && !(node.f[0].bind && node.f[0].bind.length && node.f[0].bind[0].args && node.f[0].bind[0].args.length)
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
function isQuoteAssignExpr (node) {
  return typeof(node) === 'object' && node.type === 'assign' && !node.local
    && (node.varname === 'accept' || node.varname === 'reject' || node.varname === 'status' || node.varname === 'footer')
    && node.value.length === 1 && node.value[0].type === 'func' && node.value[0].funcname === 'strictquote'
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

function makeFuncArgTree (pt, args, makeSymbolName, forceBraces) {
  var noBraces = !forceBraces && args.length === 1 && (args[0].type === 'func' || args[0].type === 'lookup' || args[0].type === 'alt')
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
        if (isQuoteAssignExpr (tok))
          result = [funcChar, tok.varname, [leftBraceChar, pt.makeRhsTree(tok.value[0].args,makeSymbolName), rightBraceChar]]
        else if (isTagExpr (tok))
          result = [funcChar, 'tag', [leftBraceChar, pt.makeRhsTree(getTagExprRhs(tok),makeSymbolName), rightBraceChar]]
        else {
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
          case 'link':
            result = [funcChar, tok.funcname].concat ([tok.args[0], tok.args[1].args[0]].map (function (arg) { return makeFuncArgTree (pt, [arg], makeSymbolName, nextIsAlpha) }))
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
          result = [funcChar, 'x' + tok.method, [symChar, (nextIsAlpha
                                                           ? [leftBraceChar, makeSymbolName(tok), rightBraceChar]
                                                           : makeSymbolName(tok))]]
        } else {
          var hasArgList = tok.bind && tok.bind.length && tok.bind[0] && tok.bind[0].type === 'func' && tok.bind[0].funcname === 'list'
          var hasNonemptyArgList = hasArgList && tok.bind[0].args.length
          var isApply = tok.bind && !hasArgList
          result = (isApply
                    ? [funcChar + 'xapply' + symChar, makeSymbolName(tok), makeFuncArgTree (pt, tok.bind, nextIsAlpha)]
                    : (nextIsAlpha && !hasNonemptyArgList
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
  return node.name
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
          || (expansion.nodes && expansion.nodes >= maxNodes))
        return expansion
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
  if (totalDepth >= maxTotalDepth)
    atLimit = true
  newConfig.totalDepth = totalDepth + 1

  if (contextKey && !atLimit) {
    var recursionDepth = newConfig.depth[contextKey] || 0
    var maxRecursionDepth = Math.min (config.maxRecursion || pt.maxRecursion)
    if (recursionDepth >= maxRecursionDepth)
      atLimit = true
    newConfig.depth[contextKey] = recursionDepth + 1
  }

  if (atLimit)
    return resolve ({ text: '',
                      vars: config.vars,
                      nodes: 0 })

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
             : item.map(makeString).join(''))
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
    return match + ''
  },
}

function funcType (funcname) {
  if (funcname === 'link' || funcname === 'parse' || funcname === 'reduce' || funcname === 'vars' || funcname === 'math')
    return funcname
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
            } else if (node.funcname === 'map') {
              // map. first arg is &let$VAR:LIST{&strictquote{EXPR}}
              promise = makeRhsExpansionPromiseFor (node.args[0].value)
                .then (function (listExpansion) {
                  return makeRhsExpansionReducer (pt,
                                                  extend ({},
                                                          config,
                                                          { mapVarName: node.args[0].varname,
                                                            mapRhs: node.args[0].local[0].args }),
                                                  mapReducer,
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
              promise = makeRhsExpansionPromiseFor ([node.args[0]])
                .then (function (leftArg) {
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
            } else if (node.funcname === 'link') {
              promise = makeRhsExpansionPromiseFor ([node.args[0]])
                .then (function (textArg) {
                  return makeRhsExpansionPromiseFor ([node.args[1]])
                    .then (function (linkArg) {
                      expansion.nodes += textArg.nodes + linkArg.nodes
                      expansion.text = (config.makeLink
                                        ? config.makeLink (textArg, linkArg)
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
              return makeRhsExpansionPromiseFor (node.rhs || [], expr)
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
  
  // parse tree manipulations
  sampleParseTree: sampleParseTree,
  getSymbolNodes: getSymbolNodes,
  parseTreeEmpty: parseTreeEmpty,
  isTraceryExpr: isTraceryExpr,
  isProbExpr: isProbExpr,
  isQuoteAssignExpr: isQuoteAssignExpr,
  isTagExpr: isTagExpr,
  getTagExprRhs: getTagExprRhs,
  isMeterExpr: isMeterExpr,
  getMeterIcon: getMeterIcon,
  getMeterLevel: getMeterLevel,
  getMeterStatus: getMeterStatus,
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
      peg$c11 = /^[~#&$+\-]/,
      peg$c12 = peg$classExpectation(["~", "#", "&", "$", "+", "-"], false, false),
      peg$c13 = function(char) { return char },
      peg$c14 = "&,",
      peg$c15 = peg$literalExpectation("&,", false),
      peg$c16 = function(tail) { return concatNodes (makeValue([]), tail) },
      peg$c17 = function(head, tail) { return concatNodes (makeValue([head]), tail.length ? tail : [makeValue([])]) },
      peg$c18 = function(head, tail) { return concatNodes (head, tail) },
      peg$c19 = function(head) { return [head] },
      peg$c20 = "",
      peg$c21 = function() { return [] },
      peg$c22 = "&let",
      peg$c23 = peg$literalExpectation("&let", false),
      peg$c24 = function(assigns, scope) { return makeLocalAssignChain (assigns, scope) },
      peg$c25 = "#",
      peg$c26 = peg$literalExpectation("#", false),
      peg$c27 = function(assigns, sym, mods) { return makeLocalAssignChain (assigns, [makeTraceryExpr (sym, mods)]) },
      peg$c28 = "&rep",
      peg$c29 = peg$literalExpectation("&rep", false),
      peg$c30 = "{",
      peg$c31 = peg$literalExpectation("{", false),
      peg$c32 = ",",
      peg$c33 = peg$literalExpectation(",", false),
      peg$c34 = "}",
      peg$c35 = peg$literalExpectation("}", false),
      peg$c36 = function(unit, min, max) { return validRange (min, max) ? makeRep (unit, min, max) : text() },
      peg$c37 = function(unit, min) { return makeRep (unit, min, min) },
      peg$c38 = "&if",
      peg$c39 = peg$literalExpectation("&if", false),
      peg$c40 = "then",
      peg$c41 = peg$literalExpectation("then", false),
      peg$c42 = "else",
      peg$c43 = peg$literalExpectation("else", false),
      peg$c44 = function(testArg, trueArg, falseArg) { return makeConditional (testArg, trueArg, falseArg) },
      peg$c45 = function(testArg, trueArg) { return makeConditional (testArg, trueArg, []) },
      peg$c46 = "&prob",
      peg$c47 = peg$literalExpectation("&prob", false),
      peg$c48 = function(probArg, trueArg, falseArg) { return makeProbExpr (probArg, trueArg, falseArg) },
      peg$c49 = function(sym) { return makeSugaredSymbol (sym, makeArgList ([])) },
      peg$c50 = function(sym, args) { return makeSugaredSymbol (sym, makeArgList (args)) },
      peg$c51 = function(sym, args) { return makeSugaredSymbol (sym, args) },
      peg$c52 = function(sym, mods) { return makeTraceryExpr (sym, mods) },
      peg$c53 = function(sym) { return makeGetSymbol (sym) },
      peg$c54 = function(sym, args) { return makeSetSymbol (sym, args) },
      peg$c55 = "&xcall",
      peg$c56 = peg$literalExpectation("&xcall", false),
      peg$c57 = function(sym) { return sym },
      peg$c58 = "&",
      peg$c59 = peg$literalExpectation("&", false),
      peg$c60 = "&xapply",
      peg$c61 = peg$literalExpectation("&xapply", false),
      peg$c62 = "&xget",
      peg$c63 = peg$literalExpectation("&xget", false),
      peg$c64 = "&xset",
      peg$c65 = peg$literalExpectation("&xset", false),
      peg$c66 = "~",
      peg$c67 = peg$literalExpectation("~", false),
      peg$c68 = "~{",
      peg$c69 = peg$literalExpectation("~{", false),
      peg$c70 = function(mod, mods) { return [mod].concat (mods) },
      peg$c71 = ".capitalizeAll",
      peg$c72 = peg$literalExpectation(".capitalizeAll", false),
      peg$c73 = function() { return "uc" },
      peg$c74 = ".capitalize",
      peg$c75 = peg$literalExpectation(".capitalize", false),
      peg$c76 = function() { return "cap" },
      peg$c77 = ".a",
      peg$c78 = peg$literalExpectation(".a", false),
      peg$c79 = function() { return "a" },
      peg$c80 = ".ed",
      peg$c81 = peg$literalExpectation(".ed", false),
      peg$c82 = function() { return "past" },
      peg$c83 = ".s",
      peg$c84 = peg$literalExpectation(".s", false),
      peg$c85 = function() { return "plural" },
      peg$c86 = function(name, varname, list, func) { return makeListFunction (name, varname, list, func) },
      peg$c87 = function(name, list, func) { return makeListFunction (name, defaultListVarName, list, func) },
      peg$c88 = function(name, list) { return makeListFunction (name, defaultListVarName, list, [makeQuote ([makeLookup (defaultListVarName)])]) },
      peg$c89 = "&reduce",
      peg$c90 = peg$literalExpectation("&reduce", false),
      peg$c91 = "=",
      peg$c92 = peg$literalExpectation("=", false),
      peg$c93 = function(varname, list, result, init, func) { return makeReduceFunction (varname, list, result, init, func) },
      peg$c94 = "map",
      peg$c95 = peg$literalExpectation("map", false),
      peg$c96 = "filter",
      peg$c97 = peg$literalExpectation("filter", false),
      peg$c98 = "numsort",
      peg$c99 = peg$literalExpectation("numsort", false),
      peg$c100 = "lexsort",
      peg$c101 = peg$literalExpectation("lexsort", false),
      peg$c102 = ":",
      peg$c103 = peg$literalExpectation(":", false),
      peg$c104 = function(name) { return name },
      peg$c105 = function(name, pattern, text, expr) { return makeRegexFunction (name, pattern, text, expr) },
      peg$c106 = function(name, pattern, text) { return makeRegexFunction (name, pattern, text) },
      peg$c107 = "&split",
      peg$c108 = peg$literalExpectation("&split", false),
      peg$c109 = function(text) { return makeRegexFunction ('split', { body: [defaultSplitPattern], flags: [] }, text) },
      peg$c110 = "match",
      peg$c111 = peg$literalExpectation("match", false),
      peg$c112 = "replace",
      peg$c113 = peg$literalExpectation("replace", false),
      peg$c114 = "grep",
      peg$c115 = peg$literalExpectation("grep", false),
      peg$c116 = "split",
      peg$c117 = peg$literalExpectation("split", false),
      peg$c118 = "&unquote",
      peg$c119 = peg$literalExpectation("&unquote", false),
      peg$c120 = function(args) { return makeFunction ('unquote', args) },
      peg$c121 = "&call",
      peg$c122 = peg$literalExpectation("&call", false),
      peg$c123 = function(expr, args) { return makeFunction ('call', [wrapNodes (expr), makeFunction ('list', args.map (wrapNodes))]) },
      peg$c124 = function(lookup, args) { return makeFunction ('call', [lookup, makeFunction ('list', args.map (wrapNodes))]) },
      peg$c125 = "&function",
      peg$c126 = peg$literalExpectation("&function", false),
      peg$c127 = function(args, expr) { return makeDefineFunction (args, expr) },
      peg$c128 = "&function{}",
      peg$c129 = peg$literalExpectation("&function{}", false),
      peg$c130 = function(expr) { return makeDefineFunction ([], expr) },
      peg$c131 = function(head, tail) { return [head].concat (tail) },
      peg$c132 = function(func, left, right) { return makeFunction (func, [wrapNodes (left), wrapNodes (right)]) },
      peg$c133 = "&join",
      peg$c134 = peg$literalExpectation("&join", false),
      peg$c135 = function(left) { return makeFunction ('join', [wrapNodes (left), defaultJoinText]) },
      peg$c136 = function(func, args) { return makeFunction (func, args) },
      peg$c137 = "&rotate",
      peg$c138 = peg$literalExpectation("&rotate", false),
      peg$c139 = function(arg) { return makeRotate (arg) },
      peg$c140 = function(func) { return makeFunction (func, []) },
      peg$c141 = function(func, v, right) { return makeFunction (func, [wrapNodes (v), wrapNodes (right)]) },
      peg$c142 = function(func, right) { return makeFunction (func, [makeStrictQuote ([makeLookup (defaultListVarName)]), wrapNodes (right)]) },
      peg$c143 = function(func, v) { return makeFunction (func, v) },
      peg$c144 = function(func) { return makeFunction (func, [makeStrictQuote ([makeLookup (defaultListVarName)])] ) },
      peg$c145 = "++",
      peg$c146 = peg$literalExpectation("++", false),
      peg$c147 = function(v) { return wrapNodes ([makeFunction ('inc', v)].concat (v[0].args)) },
      peg$c148 = "--",
      peg$c149 = peg$literalExpectation("--", false),
      peg$c150 = function(v) { return wrapNodes ([makeFunction ('dec', v)].concat (v[0].args)) },
      peg$c151 = function(v) { return wrapNodes (v[0].args.concat ([makeFunction ('inc', v)])) },
      peg$c152 = function(v) { return wrapNodes (v[0].args.concat ([makeFunction ('dec', v)])) },
      peg$c153 = "&meter",
      peg$c154 = peg$literalExpectation("&meter", false),
      peg$c155 = function(icon, expr, status) { return makeMeter (icon, expr, status) },
      peg$c156 = function(icon, expr) { return makeMeter (icon, expr) },
      peg$c157 = "&cycle",
      peg$c158 = peg$literalExpectation("&cycle", false),
      peg$c159 = function(v, list) { return makeCycle (v, list, false) },
      peg$c160 = "&playlist",
      peg$c161 = peg$literalExpectation("&playlist", false),
      peg$c162 = function(v, list) { return makeCycle (v, list, true) },
      peg$c163 = "&queue",
      peg$c164 = peg$literalExpectation("&queue", false),
      peg$c165 = function(v, list) { return makeQueue (v, list) },
      peg$c166 = "&imp{",
      peg$c167 = peg$literalExpectation("&imp{", false),
      peg$c168 = "}{",
      peg$c169 = peg$literalExpectation("}{", false),
      peg$c170 = function(num, expr, template) { return makeImportanceSampler (num, expr, template) },
      peg$c171 = "&save",
      peg$c172 = peg$literalExpectation("&save", false),
      peg$c173 = function(arg) { return makeSave (arg) },
      peg$c174 = "&rhyme{",
      peg$c175 = peg$literalExpectation("&rhyme{", false),
      peg$c176 = function(num, a, b) { return makeRhyme (a, b, num) },
      peg$c177 = "&rhyme",
      peg$c178 = peg$literalExpectation("&rhyme", false),
      peg$c179 = function(a, b) { return makeRhyme (a, b) },
      peg$c180 = "&math{",
      peg$c181 = peg$literalExpectation("&math{", false),
      peg$c182 = function(math) { return makeFunction ('math', [math]) },
      peg$c183 = "&math{}",
      peg$c184 = peg$literalExpectation("&math{}", false),
      peg$c185 = function() { return makeFunction ('math', []) },
      peg$c186 = "&link",
      peg$c187 = peg$literalExpectation("&link", false),
      peg$c188 = function(text, link) { return makeFunction ('link', [wrapNodes(text), makeQuote(link)]) },
      peg$c189 = "[[",
      peg$c190 = peg$literalExpectation("[[", false),
      peg$c191 = "]]",
      peg$c192 = peg$literalExpectation("]]", false),
      peg$c193 = function(text) { return makeLinkShortcut (text) },
      peg$c194 = "&parse",
      peg$c195 = peg$literalExpectation("&parse", false),
      peg$c196 = function(grammar, text) { return makeFunction ('parse', [wrapNodes(grammar), wrapNodes(text)]) },
      peg$c197 = "&grammar",
      peg$c198 = peg$literalExpectation("&grammar", false),
      peg$c199 = function(grammar) { return makeFunction ('grammar', grammar) },
      peg$c200 = "&{",
      peg$c201 = peg$literalExpectation("&{", false),
      peg$c202 = function(args) { return makeFunction ('list', args) },
      peg$c203 = "&makelist",
      peg$c204 = peg$literalExpectation("&makelist", false),
      peg$c205 = function(args) { return makeFunction ('list', args.map (makeValue)) },
      peg$c206 = "&quotelist",
      peg$c207 = peg$literalExpectation("&quotelist", false),
      peg$c208 = function(args) { return makeFunction ('list', args.map (makeStrictQuote)) },
      peg$c209 = "add",
      peg$c210 = peg$literalExpectation("add", false),
      peg$c211 = "subtract",
      peg$c212 = peg$literalExpectation("subtract", false),
      peg$c213 = "multiply",
      peg$c214 = peg$literalExpectation("multiply", false),
      peg$c215 = "divide",
      peg$c216 = peg$literalExpectation("divide", false),
      peg$c217 = "pow",
      peg$c218 = peg$literalExpectation("pow", false),
      peg$c219 = "gt",
      peg$c220 = peg$literalExpectation("gt", false),
      peg$c221 = "geq",
      peg$c222 = peg$literalExpectation("geq", false),
      peg$c223 = "lt",
      peg$c224 = peg$literalExpectation("lt", false),
      peg$c225 = "leq",
      peg$c226 = peg$literalExpectation("leq", false),
      peg$c227 = "eq",
      peg$c228 = peg$literalExpectation("eq", false),
      peg$c229 = "neq",
      peg$c230 = peg$literalExpectation("neq", false),
      peg$c231 = "min",
      peg$c232 = peg$literalExpectation("min", false),
      peg$c233 = "max",
      peg$c234 = peg$literalExpectation("max", false),
      peg$c235 = "same",
      peg$c236 = peg$literalExpectation("same", false),
      peg$c237 = "and",
      peg$c238 = peg$literalExpectation("and", false),
      peg$c239 = "or",
      peg$c240 = peg$literalExpectation("or", false),
      peg$c241 = "cat",
      peg$c242 = peg$literalExpectation("cat", false),
      peg$c243 = "prepend",
      peg$c244 = peg$literalExpectation("prepend", false),
      peg$c245 = "append",
      peg$c246 = peg$literalExpectation("append", false),
      peg$c247 = "join",
      peg$c248 = peg$literalExpectation("join", false),
      peg$c249 = "nth",
      peg$c250 = peg$literalExpectation("nth", false),
      peg$c251 = "apply",
      peg$c252 = peg$literalExpectation("apply", false),
      peg$c253 = "xapply",
      peg$c254 = peg$literalExpectation("xapply", false),
      peg$c255 = "assonance",
      peg$c256 = peg$literalExpectation("assonance", false),
      peg$c257 = "eval",
      peg$c258 = peg$literalExpectation("eval", false),
      peg$c259 = "syntax",
      peg$c260 = peg$literalExpectation("syntax", false),
      peg$c261 = "tree",
      peg$c262 = peg$literalExpectation("tree", false),
      peg$c263 = "jparse",
      peg$c264 = peg$literalExpectation("jparse", false),
      peg$c265 = "escape",
      peg$c266 = peg$literalExpectation("escape", false),
      peg$c267 = "quotify",
      peg$c268 = peg$literalExpectation("quotify", false),
      peg$c269 = "random",
      peg$c270 = peg$literalExpectation("random", false),
      peg$c271 = "floor",
      peg$c272 = peg$literalExpectation("floor", false),
      peg$c273 = "ceil",
      peg$c274 = peg$literalExpectation("ceil", false),
      peg$c275 = "round",
      peg$c276 = peg$literalExpectation("round", false),
      peg$c277 = "abs",
      peg$c278 = peg$literalExpectation("abs", false),
      peg$c279 = "percent",
      peg$c280 = peg$literalExpectation("percent", false),
      peg$c281 = "wordnum",
      peg$c282 = peg$literalExpectation("wordnum", false),
      peg$c283 = "dignum",
      peg$c284 = peg$literalExpectation("dignum", false),
      peg$c285 = "ordinal",
      peg$c286 = peg$literalExpectation("ordinal", false),
      peg$c287 = "cardinal",
      peg$c288 = peg$literalExpectation("cardinal", false),
      peg$c289 = "plural",
      peg$c290 = peg$literalExpectation("plural", false),
      peg$c291 = "singular",
      peg$c292 = peg$literalExpectation("singular", false),
      peg$c293 = "nlp_plural",
      peg$c294 = peg$literalExpectation("nlp_plural", false),
      peg$c295 = "topic",
      peg$c296 = peg$literalExpectation("topic", false),
      peg$c297 = "person",
      peg$c298 = peg$literalExpectation("person", false),
      peg$c299 = "place",
      peg$c300 = peg$literalExpectation("place", false),
      peg$c301 = "past",
      peg$c302 = peg$literalExpectation("past", false),
      peg$c303 = "present",
      peg$c304 = peg$literalExpectation("present", false),
      peg$c305 = "future",
      peg$c306 = peg$literalExpectation("future", false),
      peg$c307 = "infinitive",
      peg$c308 = peg$literalExpectation("infinitive", false),
      peg$c309 = "json",
      peg$c310 = peg$literalExpectation("json", false),
      peg$c311 = "parsejson",
      peg$c312 = peg$literalExpectation("parsejson", false),
      peg$c313 = "list",
      peg$c314 = peg$literalExpectation("list", false),
      peg$c315 = "value",
      peg$c316 = peg$literalExpectation("value", false),
      peg$c317 = "islist",
      peg$c318 = peg$literalExpectation("islist", false),
      peg$c319 = "first",
      peg$c320 = peg$literalExpectation("first", false),
      peg$c321 = "last",
      peg$c322 = peg$literalExpectation("last", false),
      peg$c323 = "notfirst",
      peg$c324 = peg$literalExpectation("notfirst", false),
      peg$c325 = "notlast",
      peg$c326 = peg$literalExpectation("notlast", false),
      peg$c327 = "iota",
      peg$c328 = peg$literalExpectation("iota", false),
      peg$c329 = "sample",
      peg$c330 = peg$literalExpectation("sample", false),
      peg$c331 = "strlen",
      peg$c332 = peg$literalExpectation("strlen", false),
      peg$c333 = "length",
      peg$c334 = peg$literalExpectation("length", false),
      peg$c335 = "shuffle",
      peg$c336 = peg$literalExpectation("shuffle", false),
      peg$c337 = "bump",
      peg$c338 = peg$literalExpectation("bump", false),
      peg$c339 = "reverse",
      peg$c340 = peg$literalExpectation("reverse", false),
      peg$c341 = "revstr",
      peg$c342 = peg$literalExpectation("revstr", false),
      peg$c343 = "not",
      peg$c344 = peg$literalExpectation("not", false),
      peg$c345 = "comment",
      peg$c346 = peg$literalExpectation("comment", false),
      peg$c347 = "charclass",
      peg$c348 = peg$literalExpectation("charclass", false),
      peg$c349 = "alt",
      peg$c350 = peg$literalExpectation("alt", false),
      peg$c351 = "gerund",
      peg$c352 = peg$literalExpectation("gerund", false),
      peg$c353 = "adjective",
      peg$c354 = peg$literalExpectation("adjective", false),
      peg$c355 = "negative",
      peg$c356 = peg$literalExpectation("negative", false),
      peg$c357 = "positive",
      peg$c358 = peg$literalExpectation("positive", false),
      peg$c359 = "uc",
      peg$c360 = peg$literalExpectation("uc", false),
      peg$c361 = "lc",
      peg$c362 = peg$literalExpectation("lc", false),
      peg$c363 = "cap",
      peg$c364 = peg$literalExpectation("cap", false),
      peg$c365 = "a",
      peg$c366 = peg$literalExpectation("a", false),
      peg$c367 = "q",
      peg$c368 = peg$literalExpectation("q", false),
      peg$c369 = "vars",
      peg$c370 = peg$literalExpectation("vars", false),
      peg$c371 = "push",
      peg$c372 = peg$literalExpectation("push", false),
      peg$c373 = "unshift",
      peg$c374 = peg$literalExpectation("unshift", false),
      peg$c375 = "shift",
      peg$c376 = peg$literalExpectation("shift", false),
      peg$c377 = "pop",
      peg$c378 = peg$literalExpectation("pop", false),
      peg$c379 = "inc",
      peg$c380 = peg$literalExpectation("inc", false),
      peg$c381 = "dec",
      peg$c382 = peg$literalExpectation("dec", false),
      peg$c383 = "strictquote",
      peg$c384 = peg$literalExpectation("strictquote", false),
      peg$c385 = "'",
      peg$c386 = peg$literalExpectation("'", false),
      peg$c387 = function() { return 'strictquote' },
      peg$c388 = "quote",
      peg$c389 = peg$literalExpectation("quote", false),
      peg$c390 = "`",
      peg$c391 = peg$literalExpectation("`", false),
      peg$c392 = function() { return 'quote' },
      peg$c393 = "unquote",
      peg$c394 = peg$literalExpectation("unquote", false),
      peg$c395 = function() { return 'unquote' },
      peg$c396 = function(func) { return [makeStrictQuote (func)] },
      peg$c397 = function(lookup) { return [makeStrictQuote ([lookup])] },
      peg$c398 = function(loc) { return [loc] },
      peg$c399 = function(rep) { return [rep] },
      peg$c400 = function(cond) { return [cond] },
      peg$c401 = function(func) { return [func] },
      peg$c402 = function(assign) { return [assign] },
      peg$c403 = function(lookup) { return [lookup] },
      peg$c404 = function(alt) { return [alt] },
      peg$c405 = function(args) { return args },
      peg$c406 = "[",
      peg$c407 = peg$literalExpectation("[", false),
      peg$c408 = "]",
      peg$c409 = peg$literalExpectation("]", false),
      peg$c410 = function(args) { return concatReduce (['['].concat(args).concat(']')) },
      peg$c411 = function(args) { return concatReduce (['{'].concat(args).concat('}')) },
      peg$c412 = function(head, tail) { return [head].concat(tail) },
      peg$c413 = "&set$",
      peg$c414 = peg$literalExpectation("&set$", false),
      peg$c415 = function(varname, args) { return makeAssign (varname, args) },
      peg$c416 = "&set{",
      peg$c417 = peg$literalExpectation("&set{", false),
      peg$c418 = "$",
      peg$c419 = peg$literalExpectation("$", false),
      peg$c420 = "=>",
      peg$c421 = peg$literalExpectation("=>", false),
      peg$c422 = function(varname, opts) { return makeAssign (varname, [makeQuote (opts.length === 1 ? opts[0] : [makeAlternation (opts)])]) },
      peg$c423 = function(varname, target) { return makeAssign (varname, target) },
      peg$c424 = ":=",
      peg$c425 = peg$literalExpectation(":=", false),
      peg$c426 = function(varname, target) { return makeAssign (varname, target, true) },
      peg$c427 = "+=",
      peg$c428 = peg$literalExpectation("+=", false),
      peg$c429 = function(varname, delta) { return makeModify (varname, 'add', delta) },
      peg$c430 = "-=",
      peg$c431 = peg$literalExpectation("-=", false),
      peg$c432 = function(varname, delta) { return makeModify (varname, 'subtract', delta) },
      peg$c433 = "*=",
      peg$c434 = peg$literalExpectation("*=", false),
      peg$c435 = function(varname, scale) { return makeModify (varname, 'multiply', scale) },
      peg$c436 = "/=",
      peg$c437 = peg$literalExpectation("/=", false),
      peg$c438 = function(varname, scale) { return makeModify (varname, 'divide', scale) },
      peg$c439 = ".=",
      peg$c440 = peg$literalExpectation(".=", false),
      peg$c441 = function(varname, suffix) { return makeModifyConcat (varname, suffix) },
      peg$c442 = "&tag",
      peg$c443 = peg$literalExpectation("&tag", false),
      peg$c444 = function(tag) { return makeModifyConcat ('tags', [' '].concat (tag)) },
      peg$c445 = function(varname, arg) { return makeAssign (varname, arg) },
      peg$c446 = "accept",
      peg$c447 = peg$literalExpectation("accept", false),
      peg$c448 = "reject",
      peg$c449 = peg$literalExpectation("reject", false),
      peg$c450 = "status",
      peg$c451 = peg$literalExpectation("status", false),
      peg$c452 = "footer",
      peg$c453 = peg$literalExpectation("footer", false),
      peg$c454 = function(func) { return func },
      peg$c455 = /^[^ \t\n\r=~#&${}[\]|\\]/,
      peg$c456 = peg$classExpectation([" ", "\t", "\n", "\r", "=", "~", "#", "&", "$", "{", "}", "[", "]", "|", "\\"], true, false),
      peg$c457 = function(chars) { return [chars.join("")] },
      peg$c458 = "$$",
      peg$c459 = peg$literalExpectation("$$", false),
      peg$c460 = function(num) { return makeLookup (makeGroupVarName (num)) },
      peg$c461 = "$${",
      peg$c462 = peg$literalExpectation("$${", false),
      peg$c463 = function(varname) { return makeSugaredLookup (varname) },
      peg$c464 = function(varname) { return makeLookup (varname) },
      peg$c465 = function(varname) { return varname },
      peg$c466 = "${",
      peg$c467 = peg$literalExpectation("${", false),
      peg$c468 = "|",
      peg$c469 = peg$literalExpectation("|", false),
      peg$c470 = function(head, tail) { return makeAlternation ([head].concat(tail)) },
      peg$c471 = /^[A-Z]/,
      peg$c472 = peg$classExpectation([["A", "Z"]], false, false),
      peg$c473 = /^[A-Za-z_0-9]/,
      peg$c474 = peg$classExpectation([["A", "Z"], ["a", "z"], "_", ["0", "9"]], false, false),
      peg$c475 = /^[a-z]/,
      peg$c476 = peg$classExpectation([["a", "z"]], false, false),
      peg$c477 = function(firstChar, mid, lc, rest) { return firstChar + mid.join("") + lc + rest.join("") },
      peg$c478 = /^[A-Z_0-9]/,
      peg$c479 = peg$classExpectation([["A", "Z"], "_", ["0", "9"]], false, false),
      peg$c480 = function(firstChar, rest) { return firstChar + rest.join("") },
      peg$c481 = /^[^~#&$+\-{}[\]|\\]/,
      peg$c482 = peg$classExpectation(["~", "#", "&", "$", "+", "-", "{", "}", "[", "]", "|", "\\"], true, false),
      peg$c483 = function(chars) { return chars.join("") },
      peg$c484 = /^[0-9]/,
      peg$c485 = peg$classExpectation([["0", "9"]], false, false),
      peg$c486 = function(num) { return parseInt (num.join('')) },
      peg$c487 = ".",
      peg$c488 = peg$literalExpectation(".", false),
      peg$c489 = function(left, right) { return parseFloat(left.join("") + "." +   right.join("")) },
      peg$c490 = /^[A-Za-z_]/,
      peg$c491 = peg$classExpectation([["A", "Z"], ["a", "z"], "_"], false, false),
      peg$c492 = peg$otherExpectation("whitespace"),
      peg$c493 = /^[ \t\n\r]/,
      peg$c494 = peg$classExpectation([" ", "\t", "\n", "\r"], false, false),
      peg$c495 = "+",
      peg$c496 = peg$literalExpectation("+", false),
      peg$c497 = "-",
      peg$c498 = peg$literalExpectation("-", false),
      peg$c499 = function(first, rest) {
          return rest.reduce (function (left, next) {
            var op = next[1], right = next[3]
            return makeFunction (op === '+' ? 'add' : 'subtract', [left, right])
          }, first)
        },
      peg$c500 = "*",
      peg$c501 = peg$literalExpectation("*", false),
      peg$c502 = "/",
      peg$c503 = peg$literalExpectation("/", false),
      peg$c504 = function(first, rest) {
          return rest.reduce (function (left, next) {
            var op = next[1], right = next[3]
            return makeFunction (op === '*' ? 'multiply' : 'divide', [left, right])
          }, first)
        },
      peg$c505 = "^",
      peg$c506 = peg$literalExpectation("^", false),
      peg$c507 = "**",
      peg$c508 = peg$literalExpectation("**", false),
      peg$c509 = function(base, exp) { return makeFunction ('pow', [base, exp]) },
      peg$c510 = "e",
      peg$c511 = peg$literalExpectation("e", false),
      peg$c512 = "exp",
      peg$c513 = peg$literalExpectation("exp", false),
      peg$c514 = function(exp) { return makeFunction ('pow', [Math.exp(1).toString(), exp]) },
      peg$c515 = "(",
      peg$c516 = peg$literalExpectation("(", false),
      peg$c517 = ")",
      peg$c518 = peg$literalExpectation(")", false),
      peg$c519 = function(f) { return f.toString() },
      peg$c520 = function(n) { return n.toString() },
      peg$c521 = function(arg) { return wrapNodes (arg) },
      peg$c522 = function(additive) { return makeFunction ('value', [additive]) },
      peg$c523 = function(body, flags) { return { body: body, flags: flags } },
      peg$c524 = "//",
      peg$c525 = peg$literalExpectation("//", false),
      peg$c526 = function(flags) { return { body: [], flags: flags } },
      peg$c527 = function(c, chars) { return concatReduce ([c].concat (chars)) },
      peg$c528 = function(chars) { return chars },
      peg$c529 = /^[*\\\/[]/,
      peg$c530 = peg$classExpectation(["*", "\\", "/", "["], false, false),
      peg$c531 = function(c) { return c },
      peg$c532 = /^[\\\/[]/,
      peg$c533 = peg$classExpectation(["\\", "/", "["], false, false),
      peg$c534 = function(c) { return "\\" + c },
      peg$c535 = function(chars) { return wrapNodes (concatReduce (['['].concat(chars[0] || '').concat(']'))) },
      peg$c536 = function(chars) { return concatReduce (chars) },
      peg$c537 = /^[\]\\]/,
      peg$c538 = peg$classExpectation(["]", "\\"], false, false),
      peg$c539 = /^[gimuy]/,
      peg$c540 = peg$classExpectation(["g", "i", "m", "u", "y"], false, false),
      peg$c541 = function(parts) { return parts },
      peg$c542 = /^[\n\r\u2028\u2029]/,
      peg$c543 = peg$classExpectation(["\n", "\r", "\u2028", "\u2029"], false, false),

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
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c14) {
      s1 = peg$c14;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c15); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c16(s2);
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
        if (input.substr(peg$currPos, 2) === peg$c14) {
          s2 = peg$c14;
          peg$currPos += 2;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c15); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseNodeList();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c17(s1, s3);
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
            s1 = peg$c18(s1, s2);
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
            s1 = peg$c19(s1);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$c20;
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c21();
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
        s1 = peg$c18(s1, s2);
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
        s1 = peg$c19(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$c20;
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c21();
        }
        s0 = s1;
      }
    }

    return s0;
  }

  function peg$parseLocalAssignment() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4) === peg$c22) {
      s1 = peg$c22;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c23); }
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
              s1 = peg$c24(s3, s5);
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
        s1 = peg$c25;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c26); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseVarAssignmentList();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseIdentifier();
              if (s5 !== peg$FAILED) {
                s6 = peg$parseTraceryModifiers();
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 35) {
                    s7 = peg$c25;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c26); }
                  }
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c27(s3, s5, s6);
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
    if (input.substr(peg$currPos, 4) === peg$c28) {
      s1 = peg$c28;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c29); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 123) {
          s3 = peg$c30;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c31); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseNumber();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 44) {
              s5 = peg$c32;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c33); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseNumber();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 125) {
                  s7 = peg$c34;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c35); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c36(s2, s4, s6);
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
      if (input.substr(peg$currPos, 4) === peg$c28) {
        s1 = peg$c28;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c29); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 123) {
            s3 = peg$c30;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c31); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseNumber();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s5 = peg$c34;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c35); }
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c37(s2, s4);
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
    if (input.substr(peg$currPos, 3) === peg$c38) {
      s1 = peg$c38;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c39); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 4) === peg$c40) {
          s3 = peg$c40;
          peg$currPos += 4;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c41); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$c20;
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseFunctionArg();
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 4) === peg$c42) {
              s5 = peg$c42;
              peg$currPos += 4;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c43); }
            }
            if (s5 === peg$FAILED) {
              s5 = peg$c20;
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseFunctionArg();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c44(s2, s4, s6);
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
      if (input.substr(peg$currPos, 3) === peg$c38) {
        s1 = peg$c38;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c39); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 4) === peg$c40) {
            s3 = peg$c40;
            peg$currPos += 4;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c41); }
          }
          if (s3 === peg$FAILED) {
            s3 = peg$c20;
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseFunctionArg();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c45(s2, s4);
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
        if (input.substr(peg$currPos, 5) === peg$c46) {
          s1 = peg$c46;
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c47); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseFunctionArg();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseFunctionArg();
            if (s3 !== peg$FAILED) {
              s4 = peg$parseFunctionArg();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c48(s2, s3, s4);
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

    return s0;
  }

  function peg$parseSymbolFunction() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$parsePrefixedSymIdentifier();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c49(s1);
    }
    s0 = s1;
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
            s1 = peg$c25;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c26); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseIdentifier();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseTraceryModifiers();
              if (s3 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 35) {
                  s4 = peg$c25;
                  peg$currPos++;
                } else {
                  s4 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c26); }
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

  function peg$parseCallSymbol() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c55) {
      s1 = peg$c55;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c56); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseSymIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c57(s2);
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
        s1 = peg$c58;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c59); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePrefixedSymIdentifier();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c57(s2);
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
    if (input.substr(peg$currPos, 7) === peg$c60) {
      s1 = peg$c60;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c61); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseSymIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c57(s2);
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
    if (input.substr(peg$currPos, 5) === peg$c62) {
      s1 = peg$c62;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c63); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseSymIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c57(s2);
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
    if (input.substr(peg$currPos, 5) === peg$c64) {
      s1 = peg$c64;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c65); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseSymIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c57(s2);
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
        s1 = peg$c30;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c31); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePrefixedSymIdentifier();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c34;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c35); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c57(s2);
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
          s1 = peg$c30;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c31); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseIdentifier();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s3 = peg$c34;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c35); }
            }
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c57(s2);
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
      s1 = peg$c66;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c67); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c57(s2);
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
      if (input.substr(peg$currPos, 2) === peg$c68) {
        s1 = peg$c68;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c69); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseIdentifier();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s5 = peg$c34;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c35); }
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c57(s3);
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

  function peg$parseTraceryModifiers() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parseTraceryModifier();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseTraceryModifiers();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c70(s1, s2);
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
      s1 = peg$c20;
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c21();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseTraceryModifier() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 14) === peg$c71) {
      s1 = peg$c71;
      peg$currPos += 14;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c72); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c73();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 11) === peg$c74) {
        s1 = peg$c74;
        peg$currPos += 11;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c75); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c76();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c77) {
          s1 = peg$c77;
          peg$currPos += 2;
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
          if (input.substr(peg$currPos, 3) === peg$c80) {
            s1 = peg$c80;
            peg$currPos += 3;
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
      s1 = peg$c58;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c59); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseMapFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseMapVarIdentifier();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseFunctionArg();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseQuotedFunctionArg();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c86(s2, s3, s4, s5);
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
        s1 = peg$c58;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c59); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseMapFunctionName();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseFunctionArg();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseQuotedFunctionArg();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c87(s2, s3, s4);
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
          s1 = peg$c58;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c59); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseDefaultableMapFunctionName();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseFunctionArg();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c88(s2, s3);
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
          if (input.substr(peg$currPos, 7) === peg$c89) {
            s1 = peg$c89;
            peg$currPos += 7;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c90); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseMapVarIdentifier();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseFunctionArg();
              if (s3 !== peg$FAILED) {
                s4 = peg$parseVarIdentifier();
                if (s4 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 61) {
                    s5 = peg$c91;
                    peg$currPos++;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c92); }
                  }
                  if (s5 === peg$FAILED) {
                    s5 = peg$c20;
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parseFunctionArg();
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parseQuotedFunctionArg();
                      if (s7 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c93(s2, s3, s4, s6, s7);
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

    if (input.substr(peg$currPos, 3) === peg$c94) {
      s0 = peg$c94;
      peg$currPos += 3;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c95); }
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parseDefaultableMapFunctionName();
    }

    return s0;
  }

  function peg$parseDefaultableMapFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 6) === peg$c96) {
      s0 = peg$c96;
      peg$currPos += 6;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c97); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c98) {
        s0 = peg$c98;
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c99); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 7) === peg$c100) {
          s0 = peg$c100;
          peg$currPos += 7;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c101); }
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
        s2 = peg$c102;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c103); }
      }
      if (s2 === peg$FAILED) {
        s2 = peg$c20;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c104(s1);
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
        s1 = peg$c30;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c31); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseVarIdentifier();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c34;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c35); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c104(s2);
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
      s1 = peg$c58;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c59); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseBinaryRegexFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseRegularExpressionLiteral();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseFunctionArg();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseQuotedFunctionArg();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c105(s2, s3, s4, s5);
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
        s1 = peg$c58;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c59); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseUnaryRegexFunctionName();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseRegularExpressionLiteral();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseFunctionArg();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c106(s2, s3, s4);
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
        if (input.substr(peg$currPos, 6) === peg$c107) {
          s1 = peg$c107;
          peg$currPos += 6;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c108); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseFunctionArg();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c109(s2);
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

    if (input.substr(peg$currPos, 5) === peg$c110) {
      s0 = peg$c110;
      peg$currPos += 5;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c111); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c112) {
        s0 = peg$c112;
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c113); }
      }
    }

    return s0;
  }

  function peg$parseUnaryRegexFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 4) === peg$c114) {
      s0 = peg$c114;
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c115); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c116) {
        s0 = peg$c116;
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c117); }
      }
    }

    return s0;
  }

  function peg$parseRegexUnquote() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 8) === peg$c118) {
      s1 = peg$c118;
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c119); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c120(s2);
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
    if (input.substr(peg$currPos, 5) === peg$c121) {
      s1 = peg$c121;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c122); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseArgList();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c123(s2, s3);
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
        s1 = peg$c58;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c59); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseVarLookup();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgList();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c124(s2, s3);
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
    if (input.substr(peg$currPos, 9) === peg$c125) {
      s1 = peg$c125;
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c126); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseArgIdentifierList();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c127(s2, s3);
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
      if (input.substr(peg$currPos, 9) === peg$c125) {
        s1 = peg$c125;
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c126); }
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 123) {
          s2 = peg$c30;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c31); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgIdentifierList();
          if (s3 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s4 = peg$c34;
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c35); }
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseFunctionArg();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c127(s3, s5);
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
        if (input.substr(peg$currPos, 11) === peg$c128) {
          s1 = peg$c128;
          peg$currPos += 11;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c129); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseFunctionArg();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c130(s2);
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
        s2 = peg$c32;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c33); }
      }
      if (s2 === peg$FAILED) {
        s2 = peg$c20;
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseArgIdentifierList();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c131(s1, s3);
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
        s1 = peg$c19(s1);
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
        s1 = peg$c30;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c31); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseVarIdentifier();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c34;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c35); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c104(s2);
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
      s1 = peg$c58;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c59); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseBinaryFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseFunctionArg();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c132(s2, s3, s4);
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
      if (input.substr(peg$currPos, 5) === peg$c133) {
        s1 = peg$c133;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c134); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c135(s2);
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
      s1 = peg$c58;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c59); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseUnaryFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c136(s2, s3);
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
      if (input.substr(peg$currPos, 7) === peg$c137) {
        s1 = peg$c137;
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c138); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c139(s2);
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
      s1 = peg$c58;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c59); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseShortUnaryFunctionName();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c136(s2, s3);
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
      s1 = peg$c58;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c59); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNullaryFunctionName();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c140(s2);
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
      s1 = peg$c58;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c59); }
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
              s1 = peg$c141(s2, s3, s4);
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
        s1 = peg$c58;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c59); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePushOrUnshift();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseFunctionArg();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c142(s2, s3);
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
      s1 = peg$c58;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c59); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseShiftOrPop();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseVarFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c143(s2, s3);
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
        s1 = peg$c58;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c59); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseShiftOrPop();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c144(s2);
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
          s1 = peg$c58;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c59); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseIncOrDec();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseVarFunctionArg();
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c143(s2, s3);
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
          if (input.substr(peg$currPos, 2) === peg$c145) {
            s1 = peg$c145;
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c146); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseVarFunctionArg();
            if (s2 !== peg$FAILED) {
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
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c148) {
              s1 = peg$c148;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c149); }
            }
            if (s1 !== peg$FAILED) {
              s2 = peg$parseVarFunctionArg();
              if (s2 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c150(s2);
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
                if (input.substr(peg$currPos, 2) === peg$c145) {
                  s2 = peg$c145;
                  peg$currPos += 2;
                } else {
                  s2 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c146); }
                }
                if (s2 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c151(s1);
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
                  if (input.substr(peg$currPos, 2) === peg$c148) {
                    s2 = peg$c148;
                    peg$currPos += 2;
                  } else {
                    s2 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c149); }
                  }
                  if (s2 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c152(s1);
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
    if (input.substr(peg$currPos, 6) === peg$c153) {
      s1 = peg$c153;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c154); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseAdditiveExpr();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseQuotedFunctionArg();
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c155(s2, s3, s4);
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
      if (input.substr(peg$currPos, 6) === peg$c153) {
        s1 = peg$c153;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c154); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseAdditiveExpr();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c156(s2, s3);
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
    if (input.substr(peg$currPos, 6) === peg$c157) {
      s1 = peg$c157;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c158); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVarFunctionArg();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c159(s2, s3);
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
      if (input.substr(peg$currPos, 9) === peg$c160) {
        s1 = peg$c160;
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c161); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseVarFunctionArg();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseFunctionArg();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c162(s2, s3);
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
        if (input.substr(peg$currPos, 6) === peg$c163) {
          s1 = peg$c163;
          peg$currPos += 6;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c164); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseVarFunctionArg();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseFunctionArg();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c165(s2, s3);
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
    if (input.substr(peg$currPos, 5) === peg$c166) {
      s1 = peg$c166;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c167); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNumber();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c168) {
          s3 = peg$c168;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c169); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseAdditiveExpr();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 125) {
                  s7 = peg$c34;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c35); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseQuotedFunctionArg();
                  if (s8 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c170(s2, s5, s8);
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
      if (input.substr(peg$currPos, 5) === peg$c171) {
        s1 = peg$c171;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c172); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionArg();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c173(s2);
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
        if (input.substr(peg$currPos, 7) === peg$c174) {
          s1 = peg$c174;
          peg$currPos += 7;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c175); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseNumber();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s3 = peg$c34;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c35); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseFunctionArg();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseFunctionArg();
                if (s5 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c176(s2, s4, s5);
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
          if (input.substr(peg$currPos, 6) === peg$c177) {
            s1 = peg$c177;
            peg$currPos += 6;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c178); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseFunctionArg();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseFunctionArg();
              if (s3 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c179(s2, s3);
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
    if (input.substr(peg$currPos, 6) === peg$c180) {
      s1 = peg$c180;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c181); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseAdditiveExpr();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c34;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c35); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c182(s3);
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
      if (input.substr(peg$currPos, 7) === peg$c183) {
        s1 = peg$c183;
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c184); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c185();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseLinkFunction() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c186) {
      s1 = peg$c186;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c187); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseFunctionArg();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c188(s2, s3);
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

  function peg$parseLinkShortcut() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c189) {
      s1 = peg$c189;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c190); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseText();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c191) {
          s3 = peg$c191;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c192); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c193(s2);
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
    if (input.substr(peg$currPos, 6) === peg$c194) {
      s1 = peg$c194;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c195); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseQuotedFunctionArg();
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
      if (input.substr(peg$currPos, 8) === peg$c197) {
        s1 = peg$c197;
        peg$currPos += 8;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c198); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseQuotedFunctionArg();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c199(s2);
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
    if (input.substr(peg$currPos, 2) === peg$c200) {
      s1 = peg$c200;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c201); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 125) {
          s3 = peg$c34;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c35); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c202(s2);
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
      if (input.substr(peg$currPos, 9) === peg$c203) {
        s1 = peg$c203;
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c204); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseArgList();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c205(s2);
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
        if (input.substr(peg$currPos, 10) === peg$c206) {
          s1 = peg$c206;
          peg$currPos += 10;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c207); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseArgList();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c208(s2);
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

    if (input.substr(peg$currPos, 3) === peg$c209) {
      s0 = peg$c209;
      peg$currPos += 3;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c210); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 8) === peg$c211) {
        s0 = peg$c211;
        peg$currPos += 8;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c212); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 8) === peg$c213) {
          s0 = peg$c213;
          peg$currPos += 8;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c214); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 6) === peg$c215) {
            s0 = peg$c215;
            peg$currPos += 6;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c216); }
          }
          if (s0 === peg$FAILED) {
            if (input.substr(peg$currPos, 3) === peg$c217) {
              s0 = peg$c217;
              peg$currPos += 3;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c218); }
            }
            if (s0 === peg$FAILED) {
              if (input.substr(peg$currPos, 2) === peg$c219) {
                s0 = peg$c219;
                peg$currPos += 2;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c220); }
              }
              if (s0 === peg$FAILED) {
                if (input.substr(peg$currPos, 3) === peg$c221) {
                  s0 = peg$c221;
                  peg$currPos += 3;
                } else {
                  s0 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c222); }
                }
                if (s0 === peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c223) {
                    s0 = peg$c223;
                    peg$currPos += 2;
                  } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c224); }
                  }
                  if (s0 === peg$FAILED) {
                    if (input.substr(peg$currPos, 3) === peg$c225) {
                      s0 = peg$c225;
                      peg$currPos += 3;
                    } else {
                      s0 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c226); }
                    }
                    if (s0 === peg$FAILED) {
                      if (input.substr(peg$currPos, 2) === peg$c227) {
                        s0 = peg$c227;
                        peg$currPos += 2;
                      } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c228); }
                      }
                      if (s0 === peg$FAILED) {
                        if (input.substr(peg$currPos, 3) === peg$c229) {
                          s0 = peg$c229;
                          peg$currPos += 3;
                        } else {
                          s0 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c230); }
                        }
                        if (s0 === peg$FAILED) {
                          if (input.substr(peg$currPos, 3) === peg$c231) {
                            s0 = peg$c231;
                            peg$currPos += 3;
                          } else {
                            s0 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c232); }
                          }
                          if (s0 === peg$FAILED) {
                            if (input.substr(peg$currPos, 3) === peg$c233) {
                              s0 = peg$c233;
                              peg$currPos += 3;
                            } else {
                              s0 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c234); }
                            }
                            if (s0 === peg$FAILED) {
                              if (input.substr(peg$currPos, 4) === peg$c235) {
                                s0 = peg$c235;
                                peg$currPos += 4;
                              } else {
                                s0 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c236); }
                              }
                              if (s0 === peg$FAILED) {
                                if (input.substr(peg$currPos, 3) === peg$c237) {
                                  s0 = peg$c237;
                                  peg$currPos += 3;
                                } else {
                                  s0 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c238); }
                                }
                                if (s0 === peg$FAILED) {
                                  if (input.substr(peg$currPos, 2) === peg$c239) {
                                    s0 = peg$c239;
                                    peg$currPos += 2;
                                  } else {
                                    s0 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c240); }
                                  }
                                  if (s0 === peg$FAILED) {
                                    if (input.substr(peg$currPos, 3) === peg$c241) {
                                      s0 = peg$c241;
                                      peg$currPos += 3;
                                    } else {
                                      s0 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c242); }
                                    }
                                    if (s0 === peg$FAILED) {
                                      if (input.substr(peg$currPos, 7) === peg$c243) {
                                        s0 = peg$c243;
                                        peg$currPos += 7;
                                      } else {
                                        s0 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c244); }
                                      }
                                      if (s0 === peg$FAILED) {
                                        if (input.substr(peg$currPos, 6) === peg$c245) {
                                          s0 = peg$c245;
                                          peg$currPos += 6;
                                        } else {
                                          s0 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c246); }
                                        }
                                        if (s0 === peg$FAILED) {
                                          if (input.substr(peg$currPos, 4) === peg$c247) {
                                            s0 = peg$c247;
                                            peg$currPos += 4;
                                          } else {
                                            s0 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c248); }
                                          }
                                          if (s0 === peg$FAILED) {
                                            if (input.substr(peg$currPos, 3) === peg$c249) {
                                              s0 = peg$c249;
                                              peg$currPos += 3;
                                            } else {
                                              s0 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c250); }
                                            }
                                            if (s0 === peg$FAILED) {
                                              if (input.substr(peg$currPos, 5) === peg$c251) {
                                                s0 = peg$c251;
                                                peg$currPos += 5;
                                              } else {
                                                s0 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c252); }
                                              }
                                              if (s0 === peg$FAILED) {
                                                if (input.substr(peg$currPos, 6) === peg$c253) {
                                                  s0 = peg$c253;
                                                  peg$currPos += 6;
                                                } else {
                                                  s0 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c254); }
                                                }
                                                if (s0 === peg$FAILED) {
                                                  if (input.substr(peg$currPos, 9) === peg$c255) {
                                                    s0 = peg$c255;
                                                    peg$currPos += 9;
                                                  } else {
                                                    s0 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c256); }
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

    if (input.substr(peg$currPos, 4) === peg$c257) {
      s0 = peg$c257;
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c258); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 6) === peg$c259) {
        s0 = peg$c259;
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c260); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 4) === peg$c261) {
          s0 = peg$c261;
          peg$currPos += 4;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c262); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 6) === peg$c263) {
            s0 = peg$c263;
            peg$currPos += 6;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c264); }
          }
          if (s0 === peg$FAILED) {
            if (input.substr(peg$currPos, 6) === peg$c265) {
              s0 = peg$c265;
              peg$currPos += 6;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c266); }
            }
            if (s0 === peg$FAILED) {
              if (input.substr(peg$currPos, 7) === peg$c267) {
                s0 = peg$c267;
                peg$currPos += 7;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c268); }
              }
              if (s0 === peg$FAILED) {
                s0 = peg$parseStrictQuote();
                if (s0 === peg$FAILED) {
                  s0 = peg$parseQuote();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parseUnquote();
                    if (s0 === peg$FAILED) {
                      if (input.substr(peg$currPos, 6) === peg$c269) {
                        s0 = peg$c269;
                        peg$currPos += 6;
                      } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c270); }
                      }
                      if (s0 === peg$FAILED) {
                        if (input.substr(peg$currPos, 5) === peg$c271) {
                          s0 = peg$c271;
                          peg$currPos += 5;
                        } else {
                          s0 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c272); }
                        }
                        if (s0 === peg$FAILED) {
                          if (input.substr(peg$currPos, 4) === peg$c273) {
                            s0 = peg$c273;
                            peg$currPos += 4;
                          } else {
                            s0 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c274); }
                          }
                          if (s0 === peg$FAILED) {
                            if (input.substr(peg$currPos, 5) === peg$c275) {
                              s0 = peg$c275;
                              peg$currPos += 5;
                            } else {
                              s0 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c276); }
                            }
                            if (s0 === peg$FAILED) {
                              if (input.substr(peg$currPos, 3) === peg$c277) {
                                s0 = peg$c277;
                                peg$currPos += 3;
                              } else {
                                s0 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c278); }
                              }
                              if (s0 === peg$FAILED) {
                                if (input.substr(peg$currPos, 7) === peg$c279) {
                                  s0 = peg$c279;
                                  peg$currPos += 7;
                                } else {
                                  s0 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c280); }
                                }
                                if (s0 === peg$FAILED) {
                                  if (input.substr(peg$currPos, 7) === peg$c281) {
                                    s0 = peg$c281;
                                    peg$currPos += 7;
                                  } else {
                                    s0 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c282); }
                                  }
                                  if (s0 === peg$FAILED) {
                                    if (input.substr(peg$currPos, 6) === peg$c283) {
                                      s0 = peg$c283;
                                      peg$currPos += 6;
                                    } else {
                                      s0 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c284); }
                                    }
                                    if (s0 === peg$FAILED) {
                                      if (input.substr(peg$currPos, 7) === peg$c285) {
                                        s0 = peg$c285;
                                        peg$currPos += 7;
                                      } else {
                                        s0 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c286); }
                                      }
                                      if (s0 === peg$FAILED) {
                                        if (input.substr(peg$currPos, 8) === peg$c287) {
                                          s0 = peg$c287;
                                          peg$currPos += 8;
                                        } else {
                                          s0 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c288); }
                                        }
                                        if (s0 === peg$FAILED) {
                                          if (input.substr(peg$currPos, 6) === peg$c289) {
                                            s0 = peg$c289;
                                            peg$currPos += 6;
                                          } else {
                                            s0 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c290); }
                                          }
                                          if (s0 === peg$FAILED) {
                                            if (input.substr(peg$currPos, 8) === peg$c291) {
                                              s0 = peg$c291;
                                              peg$currPos += 8;
                                            } else {
                                              s0 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c292); }
                                            }
                                            if (s0 === peg$FAILED) {
                                              if (input.substr(peg$currPos, 10) === peg$c293) {
                                                s0 = peg$c293;
                                                peg$currPos += 10;
                                              } else {
                                                s0 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c294); }
                                              }
                                              if (s0 === peg$FAILED) {
                                                if (input.substr(peg$currPos, 5) === peg$c295) {
                                                  s0 = peg$c295;
                                                  peg$currPos += 5;
                                                } else {
                                                  s0 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c296); }
                                                }
                                                if (s0 === peg$FAILED) {
                                                  if (input.substr(peg$currPos, 6) === peg$c297) {
                                                    s0 = peg$c297;
                                                    peg$currPos += 6;
                                                  } else {
                                                    s0 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c298); }
                                                  }
                                                  if (s0 === peg$FAILED) {
                                                    if (input.substr(peg$currPos, 5) === peg$c299) {
                                                      s0 = peg$c299;
                                                      peg$currPos += 5;
                                                    } else {
                                                      s0 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c300); }
                                                    }
                                                    if (s0 === peg$FAILED) {
                                                      if (input.substr(peg$currPos, 4) === peg$c301) {
                                                        s0 = peg$c301;
                                                        peg$currPos += 4;
                                                      } else {
                                                        s0 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c302); }
                                                      }
                                                      if (s0 === peg$FAILED) {
                                                        if (input.substr(peg$currPos, 7) === peg$c303) {
                                                          s0 = peg$c303;
                                                          peg$currPos += 7;
                                                        } else {
                                                          s0 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c304); }
                                                        }
                                                        if (s0 === peg$FAILED) {
                                                          if (input.substr(peg$currPos, 6) === peg$c305) {
                                                            s0 = peg$c305;
                                                            peg$currPos += 6;
                                                          } else {
                                                            s0 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c306); }
                                                          }
                                                          if (s0 === peg$FAILED) {
                                                            if (input.substr(peg$currPos, 10) === peg$c307) {
                                                              s0 = peg$c307;
                                                              peg$currPos += 10;
                                                            } else {
                                                              s0 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c308); }
                                                            }
                                                            if (s0 === peg$FAILED) {
                                                              if (input.substr(peg$currPos, 4) === peg$c309) {
                                                                s0 = peg$c309;
                                                                peg$currPos += 4;
                                                              } else {
                                                                s0 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c310); }
                                                              }
                                                              if (s0 === peg$FAILED) {
                                                                if (input.substr(peg$currPos, 9) === peg$c311) {
                                                                  s0 = peg$c311;
                                                                  peg$currPos += 9;
                                                                } else {
                                                                  s0 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c312); }
                                                                }
                                                                if (s0 === peg$FAILED) {
                                                                  if (input.substr(peg$currPos, 4) === peg$c313) {
                                                                    s0 = peg$c313;
                                                                    peg$currPos += 4;
                                                                  } else {
                                                                    s0 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c314); }
                                                                  }
                                                                  if (s0 === peg$FAILED) {
                                                                    if (input.substr(peg$currPos, 5) === peg$c315) {
                                                                      s0 = peg$c315;
                                                                      peg$currPos += 5;
                                                                    } else {
                                                                      s0 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c316); }
                                                                    }
                                                                    if (s0 === peg$FAILED) {
                                                                      if (input.substr(peg$currPos, 6) === peg$c317) {
                                                                        s0 = peg$c317;
                                                                        peg$currPos += 6;
                                                                      } else {
                                                                        s0 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c318); }
                                                                      }
                                                                      if (s0 === peg$FAILED) {
                                                                        if (input.substr(peg$currPos, 5) === peg$c319) {
                                                                          s0 = peg$c319;
                                                                          peg$currPos += 5;
                                                                        } else {
                                                                          s0 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c320); }
                                                                        }
                                                                        if (s0 === peg$FAILED) {
                                                                          if (input.substr(peg$currPos, 4) === peg$c321) {
                                                                            s0 = peg$c321;
                                                                            peg$currPos += 4;
                                                                          } else {
                                                                            s0 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c322); }
                                                                          }
                                                                          if (s0 === peg$FAILED) {
                                                                            if (input.substr(peg$currPos, 8) === peg$c323) {
                                                                              s0 = peg$c323;
                                                                              peg$currPos += 8;
                                                                            } else {
                                                                              s0 = peg$FAILED;
                                                                              if (peg$silentFails === 0) { peg$fail(peg$c324); }
                                                                            }
                                                                            if (s0 === peg$FAILED) {
                                                                              if (input.substr(peg$currPos, 7) === peg$c325) {
                                                                                s0 = peg$c325;
                                                                                peg$currPos += 7;
                                                                              } else {
                                                                                s0 = peg$FAILED;
                                                                                if (peg$silentFails === 0) { peg$fail(peg$c326); }
                                                                              }
                                                                              if (s0 === peg$FAILED) {
                                                                                if (input.substr(peg$currPos, 4) === peg$c327) {
                                                                                  s0 = peg$c327;
                                                                                  peg$currPos += 4;
                                                                                } else {
                                                                                  s0 = peg$FAILED;
                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c328); }
                                                                                }
                                                                                if (s0 === peg$FAILED) {
                                                                                  if (input.substr(peg$currPos, 6) === peg$c329) {
                                                                                    s0 = peg$c329;
                                                                                    peg$currPos += 6;
                                                                                  } else {
                                                                                    s0 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c330); }
                                                                                  }
                                                                                  if (s0 === peg$FAILED) {
                                                                                    if (input.substr(peg$currPos, 6) === peg$c331) {
                                                                                      s0 = peg$c331;
                                                                                      peg$currPos += 6;
                                                                                    } else {
                                                                                      s0 = peg$FAILED;
                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c332); }
                                                                                    }
                                                                                    if (s0 === peg$FAILED) {
                                                                                      if (input.substr(peg$currPos, 6) === peg$c333) {
                                                                                        s0 = peg$c333;
                                                                                        peg$currPos += 6;
                                                                                      } else {
                                                                                        s0 = peg$FAILED;
                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c334); }
                                                                                      }
                                                                                      if (s0 === peg$FAILED) {
                                                                                        if (input.substr(peg$currPos, 7) === peg$c335) {
                                                                                          s0 = peg$c335;
                                                                                          peg$currPos += 7;
                                                                                        } else {
                                                                                          s0 = peg$FAILED;
                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c336); }
                                                                                        }
                                                                                        if (s0 === peg$FAILED) {
                                                                                          if (input.substr(peg$currPos, 4) === peg$c337) {
                                                                                            s0 = peg$c337;
                                                                                            peg$currPos += 4;
                                                                                          } else {
                                                                                            s0 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c338); }
                                                                                          }
                                                                                          if (s0 === peg$FAILED) {
                                                                                            if (input.substr(peg$currPos, 7) === peg$c339) {
                                                                                              s0 = peg$c339;
                                                                                              peg$currPos += 7;
                                                                                            } else {
                                                                                              s0 = peg$FAILED;
                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c340); }
                                                                                            }
                                                                                            if (s0 === peg$FAILED) {
                                                                                              if (input.substr(peg$currPos, 6) === peg$c341) {
                                                                                                s0 = peg$c341;
                                                                                                peg$currPos += 6;
                                                                                              } else {
                                                                                                s0 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c342); }
                                                                                              }
                                                                                              if (s0 === peg$FAILED) {
                                                                                                if (input.substr(peg$currPos, 3) === peg$c343) {
                                                                                                  s0 = peg$c343;
                                                                                                  peg$currPos += 3;
                                                                                                } else {
                                                                                                  s0 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c344); }
                                                                                                }
                                                                                                if (s0 === peg$FAILED) {
                                                                                                  if (input.substr(peg$currPos, 7) === peg$c345) {
                                                                                                    s0 = peg$c345;
                                                                                                    peg$currPos += 7;
                                                                                                  } else {
                                                                                                    s0 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c346); }
                                                                                                  }
                                                                                                  if (s0 === peg$FAILED) {
                                                                                                    if (input.substr(peg$currPos, 9) === peg$c347) {
                                                                                                      s0 = peg$c347;
                                                                                                      peg$currPos += 9;
                                                                                                    } else {
                                                                                                      s0 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c348); }
                                                                                                    }
                                                                                                    if (s0 === peg$FAILED) {
                                                                                                      if (input.substr(peg$currPos, 3) === peg$c349) {
                                                                                                        s0 = peg$c349;
                                                                                                        peg$currPos += 3;
                                                                                                      } else {
                                                                                                        s0 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c350); }
                                                                                                      }
                                                                                                      if (s0 === peg$FAILED) {
                                                                                                        if (input.substr(peg$currPos, 6) === peg$c351) {
                                                                                                          s0 = peg$c351;
                                                                                                          peg$currPos += 6;
                                                                                                        } else {
                                                                                                          s0 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c352); }
                                                                                                        }
                                                                                                        if (s0 === peg$FAILED) {
                                                                                                          if (input.substr(peg$currPos, 9) === peg$c353) {
                                                                                                            s0 = peg$c353;
                                                                                                            peg$currPos += 9;
                                                                                                          } else {
                                                                                                            s0 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c354); }
                                                                                                          }
                                                                                                          if (s0 === peg$FAILED) {
                                                                                                            if (input.substr(peg$currPos, 8) === peg$c355) {
                                                                                                              s0 = peg$c355;
                                                                                                              peg$currPos += 8;
                                                                                                            } else {
                                                                                                              s0 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c356); }
                                                                                                            }
                                                                                                            if (s0 === peg$FAILED) {
                                                                                                              if (input.substr(peg$currPos, 8) === peg$c357) {
                                                                                                                s0 = peg$c357;
                                                                                                                peg$currPos += 8;
                                                                                                              } else {
                                                                                                                s0 = peg$FAILED;
                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c358); }
                                                                                                              }
                                                                                                              if (s0 === peg$FAILED) {
                                                                                                                if (input.substr(peg$currPos, 2) === peg$c359) {
                                                                                                                  s0 = peg$c359;
                                                                                                                  peg$currPos += 2;
                                                                                                                } else {
                                                                                                                  s0 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c360); }
                                                                                                                }
                                                                                                                if (s0 === peg$FAILED) {
                                                                                                                  if (input.substr(peg$currPos, 2) === peg$c361) {
                                                                                                                    s0 = peg$c361;
                                                                                                                    peg$currPos += 2;
                                                                                                                  } else {
                                                                                                                    s0 = peg$FAILED;
                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c362); }
                                                                                                                  }
                                                                                                                  if (s0 === peg$FAILED) {
                                                                                                                    if (input.substr(peg$currPos, 3) === peg$c363) {
                                                                                                                      s0 = peg$c363;
                                                                                                                      peg$currPos += 3;
                                                                                                                    } else {
                                                                                                                      s0 = peg$FAILED;
                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c364); }
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
      s0 = peg$c365;
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c366); }
    }
    if (s0 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 113) {
        s0 = peg$c367;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c368); }
      }
    }

    return s0;
  }

  function peg$parseNullaryFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 4) === peg$c369) {
      s0 = peg$c369;
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c370); }
    }

    return s0;
  }

  function peg$parsePushOrUnshift() {
    var s0;

    if (input.substr(peg$currPos, 4) === peg$c371) {
      s0 = peg$c371;
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c372); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c373) {
        s0 = peg$c373;
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c374); }
      }
    }

    return s0;
  }

  function peg$parseShiftOrPop() {
    var s0;

    if (input.substr(peg$currPos, 5) === peg$c375) {
      s0 = peg$c375;
      peg$currPos += 5;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c376); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 3) === peg$c377) {
        s0 = peg$c377;
        peg$currPos += 3;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c378); }
      }
    }

    return s0;
  }

  function peg$parseIncOrDec() {
    var s0;

    if (input.substr(peg$currPos, 3) === peg$c379) {
      s0 = peg$c379;
      peg$currPos += 3;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c380); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 3) === peg$c381) {
        s0 = peg$c381;
        peg$currPos += 3;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c382); }
      }
    }

    return s0;
  }

  function peg$parseStrictQuote() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 11) === peg$c383) {
      s1 = peg$c383;
      peg$currPos += 11;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c384); }
    }
    if (s1 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 39) {
        s1 = peg$c385;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c386); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c387();
    }
    s0 = s1;

    return s0;
  }

  function peg$parseQuote() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c388) {
      s1 = peg$c388;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c389); }
    }
    if (s1 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 96) {
        s1 = peg$c390;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c391); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c392();
    }
    s0 = s1;

    return s0;
  }

  function peg$parseUnquote() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7) === peg$c393) {
      s1 = peg$c393;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c394); }
    }
    if (s1 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 44) {
        s1 = peg$c32;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c33); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c395();
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
      s1 = peg$c396(s1);
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
      s1 = peg$c397(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 123) {
        s1 = peg$c30;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c31); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePlainVarLookup();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c34;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c35); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c397(s2);
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
    s1 = peg$parseLocalAssignment();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c398(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseRepetition();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c399(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseConditional();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c400(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseFunction();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c401(s1);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseVarAssignment();
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c402(s1);
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$parseVarLookup();
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c403(s1);
              }
              s0 = s1;
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                s1 = peg$parseAlternation();
                if (s1 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c404(s1);
                }
                s0 = s1;
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  s1 = peg$parseDelimitedNodeList();
                  if (s1 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c405(s1);
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
      s1 = peg$c406;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c407); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 93) {
          s3 = peg$c408;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c409); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c410(s2);
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
        s1 = peg$c30;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c31); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseNodeList();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c34;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c35); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c411(s2);
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
      s1 = peg$c30;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c31); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 125) {
          s3 = peg$c34;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c35); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c405(s2);
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
        s1 = peg$c131(s1, s2);
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
      s1 = peg$c20;
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c21();
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
          s1 = peg$c412(s1, s3);
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
        s1 = peg$c19(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseVarAssignment() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c413) {
      s1 = peg$c413;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c414); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseIdentifier();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseFunctionArg();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c415(s2, s3);
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
      if (input.substr(peg$currPos, 5) === peg$c416) {
        s1 = peg$c416;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c417); }
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 36) {
          s2 = peg$c418;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c419); }
        }
        if (s2 === peg$FAILED) {
          s2 = peg$c20;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseIdentifier();
          if (s3 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s4 = peg$c34;
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c35); }
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseFunctionArg();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c415(s3, s5);
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
          s1 = peg$c406;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c407); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseIdentifier();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 58) {
              s3 = peg$c102;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c103); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseNodeList();
              if (s4 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 93) {
                  s5 = peg$c408;
                  peg$currPos++;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c409); }
                }
                if (s5 !== peg$FAILED) {
                  s6 = peg$parse_();
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c415(s2, s4);
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
            s1 = peg$c406;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c407); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseIdentifier();
            if (s2 !== peg$FAILED) {
              if (input.substr(peg$currPos, 2) === peg$c420) {
                s3 = peg$c420;
                peg$currPos += 2;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c421); }
              }
              if (s3 !== peg$FAILED) {
                s4 = peg$parseAltList();
                if (s4 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 93) {
                    s5 = peg$c408;
                    peg$currPos++;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c409); }
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parse_();
                    if (s6 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c422(s2, s4);
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
            if (input.charCodeAt(peg$currPos) === 36) {
              s1 = peg$c418;
              peg$currPos++;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c419); }
            }
            if (s1 !== peg$FAILED) {
              s2 = peg$parseIdentifier();
              if (s2 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 61) {
                  s3 = peg$c91;
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c92); }
                }
                if (s3 !== peg$FAILED) {
                  s4 = peg$parseVarAssignmentTarget();
                  if (s4 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c423(s2, s4);
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
                s1 = peg$c418;
                peg$currPos++;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c419); }
              }
              if (s1 !== peg$FAILED) {
                s2 = peg$parseIdentifier();
                if (s2 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c424) {
                    s3 = peg$c424;
                    peg$currPos += 2;
                  } else {
                    s3 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c425); }
                  }
                  if (s3 !== peg$FAILED) {
                    s4 = peg$parseVarAssignmentTarget();
                    if (s4 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c426(s2, s4);
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
                  s1 = peg$c418;
                  peg$currPos++;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c419); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = peg$parseIdentifier();
                  if (s2 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 2) === peg$c427) {
                      s3 = peg$c427;
                      peg$currPos += 2;
                    } else {
                      s3 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c428); }
                    }
                    if (s3 !== peg$FAILED) {
                      s4 = peg$parseVarAssignmentTarget();
                      if (s4 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c429(s2, s4);
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
                    s1 = peg$c418;
                    peg$currPos++;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c419); }
                  }
                  if (s1 !== peg$FAILED) {
                    s2 = peg$parseIdentifier();
                    if (s2 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 2) === peg$c430) {
                        s3 = peg$c430;
                        peg$currPos += 2;
                      } else {
                        s3 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c431); }
                      }
                      if (s3 !== peg$FAILED) {
                        s4 = peg$parseVarAssignmentTarget();
                        if (s4 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c432(s2, s4);
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
                      s1 = peg$c418;
                      peg$currPos++;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c419); }
                    }
                    if (s1 !== peg$FAILED) {
                      s2 = peg$parseIdentifier();
                      if (s2 !== peg$FAILED) {
                        if (input.substr(peg$currPos, 2) === peg$c433) {
                          s3 = peg$c433;
                          peg$currPos += 2;
                        } else {
                          s3 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c434); }
                        }
                        if (s3 !== peg$FAILED) {
                          s4 = peg$parseVarAssignmentTarget();
                          if (s4 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c435(s2, s4);
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
                        s1 = peg$c418;
                        peg$currPos++;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c419); }
                      }
                      if (s1 !== peg$FAILED) {
                        s2 = peg$parseIdentifier();
                        if (s2 !== peg$FAILED) {
                          if (input.substr(peg$currPos, 2) === peg$c436) {
                            s3 = peg$c436;
                            peg$currPos += 2;
                          } else {
                            s3 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c437); }
                          }
                          if (s3 !== peg$FAILED) {
                            s4 = peg$parseVarAssignmentTarget();
                            if (s4 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c438(s2, s4);
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
                          s1 = peg$c418;
                          peg$currPos++;
                        } else {
                          s1 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c419); }
                        }
                        if (s1 !== peg$FAILED) {
                          s2 = peg$parseIdentifier();
                          if (s2 !== peg$FAILED) {
                            if (input.substr(peg$currPos, 2) === peg$c439) {
                              s3 = peg$c439;
                              peg$currPos += 2;
                            } else {
                              s3 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c440); }
                            }
                            if (s3 !== peg$FAILED) {
                              s4 = peg$parseVarAssignmentTarget();
                              if (s4 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c441(s2, s4);
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
                          if (input.substr(peg$currPos, 4) === peg$c442) {
                            s1 = peg$c442;
                            peg$currPos += 4;
                          } else {
                            s1 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c443); }
                          }
                          if (s1 !== peg$FAILED) {
                            s2 = peg$parseFunctionArg();
                            if (s2 !== peg$FAILED) {
                              s3 = peg$parse_();
                              if (s3 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c444(s2);
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
                              s1 = peg$c58;
                              peg$currPos++;
                            } else {
                              s1 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c59); }
                            }
                            if (s1 !== peg$FAILED) {
                              s2 = peg$parseVarAssignFunctionName();
                              if (s2 !== peg$FAILED) {
                                s3 = peg$parseQuotedFunctionArg();
                                if (s3 !== peg$FAILED) {
                                  s4 = peg$parse_();
                                  if (s4 !== peg$FAILED) {
                                    peg$savedPos = s0;
                                    s1 = peg$c445(s2, s3);
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

    return s0;
  }

  function peg$parseVarAssignFunctionName() {
    var s0;

    if (input.substr(peg$currPos, 6) === peg$c446) {
      s0 = peg$c446;
      peg$currPos += 6;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c447); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 6) === peg$c448) {
        s0 = peg$c448;
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c449); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 6) === peg$c450) {
          s0 = peg$c450;
          peg$currPos += 6;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c451); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 6) === peg$c452) {
            s0 = peg$c452;
            peg$currPos += 6;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c453); }
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
          s1 = peg$c454(s1);
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
        if (peg$c455.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c456); }
        }
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            if (peg$c455.test(input.charAt(peg$currPos))) {
              s2 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c456); }
            }
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c457(s1);
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
    if (input.substr(peg$currPos, 2) === peg$c458) {
      s1 = peg$c458;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c459); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNumber();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c460(s2);
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
      if (input.substr(peg$currPos, 3) === peg$c461) {
        s1 = peg$c461;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c462); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseNumber();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c34;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c35); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c460(s2);
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
          s1 = peg$c463(s1);
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
      s1 = peg$c464(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseVarIdentifier() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 36) {
      s1 = peg$c418;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c419); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseIdentifier();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c465(s2);
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
      if (input.substr(peg$currPos, 2) === peg$c466) {
        s1 = peg$c466;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c467); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseIdentifier();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s5 = peg$c34;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c35); }
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c465(s3);
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
      s1 = peg$c30;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c31); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseNodeList();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 124) {
          s3 = peg$c468;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c469); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseAltList();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c34;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c35); }
            }
            if (s5 !== peg$FAILED) {
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
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 91) {
        s1 = peg$c406;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c407); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseNodeList();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 124) {
            s3 = peg$c468;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c469); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseAltList();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 93) {
                s5 = peg$c408;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c409); }
              }
              if (s5 !== peg$FAILED) {
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
        s2 = peg$c468;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c469); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseAltList();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c412(s1, s3);
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
        s1 = peg$c19(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseCappedIdentifier() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (peg$c471.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c472); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c473.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c474); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c473.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c474); }
        }
      }
      if (s2 !== peg$FAILED) {
        if (peg$c475.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c476); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          if (peg$c473.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c474); }
          }
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            if (peg$c473.test(input.charAt(peg$currPos))) {
              s5 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c474); }
            }
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c477(s1, s2, s3, s4);
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
    if (peg$c471.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c472); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c478.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c479); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c478.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c479); }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c480(s1, s2);
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
    if (peg$c481.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c482); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c481.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c482); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c483(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseNumber() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c484.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c485); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c484.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c485); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c486(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseFloat() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c484.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c485); }
    }
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      if (peg$c484.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c485); }
      }
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 46) {
        s2 = peg$c487;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c488); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        if (peg$c484.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c485); }
        }
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            if (peg$c484.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c485); }
            }
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c489(s1, s3);
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

  function peg$parseIdentifier() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (peg$c490.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c491); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c473.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c474); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c473.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c474); }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c480(s1, s2);
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
    if (peg$c493.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c494); }
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      if (peg$c493.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c494); }
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c492); }
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
          s5 = peg$c495;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c496); }
        }
        if (s5 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 45) {
            s5 = peg$c497;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c498); }
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
              s5 = peg$c495;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c496); }
            }
            if (s5 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 45) {
                s5 = peg$c497;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c498); }
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
        s1 = peg$c499(s1, s2);
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
          s5 = peg$c500;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c501); }
        }
        if (s5 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 47) {
            s5 = peg$c502;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c503); }
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
              s5 = peg$c500;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c501); }
            }
            if (s5 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 47) {
                s5 = peg$c502;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c503); }
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
        s1 = peg$c504(s1, s2);
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
          s3 = peg$c505;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c506); }
        }
        if (s3 === peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c507) {
            s3 = peg$c507;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c508); }
          }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsePrimaryExpr();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c509(s1, s5);
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
        s1 = peg$c510;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c511); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c512) {
          s1 = peg$c512;
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c513); }
        }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 94) {
            s3 = peg$c505;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c506); }
          }
          if (s3 === peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c507) {
              s3 = peg$c507;
              peg$currPos += 2;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c508); }
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsePrimaryExpr();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c514(s5);
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
        if (input.substr(peg$currPos, 3) === peg$c512) {
          s1 = peg$c512;
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c513); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 40) {
              s3 = peg$c515;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c516); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseAdditiveExpr();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parse_();
                  if (s6 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 41) {
                      s7 = peg$c517;
                      peg$currPos++;
                    } else {
                      s7 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c518); }
                    }
                    if (s7 !== peg$FAILED) {
                      s8 = peg$parse_();
                      if (s8 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c514(s5);
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
      s1 = peg$c519(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseNumber();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c520(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseFunctionArg();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c521(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 40) {
            s1 = peg$c515;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c516); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse_();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseAdditiveExpr();
              if (s3 !== peg$FAILED) {
                s4 = peg$parse_();
                if (s4 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 41) {
                    s5 = peg$c517;
                    peg$currPos++;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c518); }
                  }
                  if (s5 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c522(s3);
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
      s1 = peg$c502;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c503); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseRegularExpressionBody();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 47) {
          s3 = peg$c502;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c503); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseRegularExpressionFlags();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c523(s2, s4);
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
      if (input.substr(peg$currPos, 2) === peg$c524) {
        s1 = peg$c524;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c525); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseRegularExpressionFlags();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c526(s2);
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
        s1 = peg$c527(s1, s2);
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
      s1 = peg$c528(s1);
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
      if (peg$c529.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c530); }
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
          s1 = peg$c531(s2);
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
      if (peg$c532.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c533); }
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
          s1 = peg$c531(s2);
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
        s1 = peg$c534(s2);
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
        s1 = peg$c531(s2);
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
      s1 = peg$c406;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c407); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseRegularExpressionClassChars();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 93) {
          s3 = peg$c408;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c409); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c535(s2);
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
      s1 = peg$c536(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseRegularExpressionClassChar() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$currPos;
    peg$silentFails++;
    if (peg$c537.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c538); }
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
        s1 = peg$c531(s2);
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
    if (peg$c539.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c540); }
    }
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      if (peg$c539.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c540); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c541(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseLineTerminator() {
    var s0;

    if (peg$c542.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c543); }
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


  function makeRep (unit, min, max) { return { type: 'rep', unit: unit, min: min, max: max } }
  function makeSymbolMethod (name, method, args) { return { type: 'sym', name: name.toLowerCase(), method: method, bind: args } }
  function makeLookup (name) { return { type: 'lookup', varname: name } }
  function makeAssign (name, value, visible) { return { type: 'assign', varname: name, value: value, visible: visible } }
  function makeLocalAssign (name, value, scope) { return { type: 'assign', varname: name, value: value, local: scope } }
  function makeAlternation (opts) { return { type: 'alt', opts: opts } }
  function makeConditional (testArg, trueArg, falseArg) { return { type: 'cond', test: testArg, t: trueArg, f: falseArg } }
  function makeFunction (name, args) { return { type: 'func', funcname: funcAlias[name] || name, args: args } }

  var funcAlias = { q: 'quotify' }

  function wrapNodes (args) { return args.length === 1 ? args[0] : makeRoot (args) }
  function makeRoot (args) { return { type: 'root', rhs: args } }

  function makeValue (args) { return makeFunction ('value', args) }
  function makeQuote (args) { return makeFunction ('quote', args) }
  function makeStrictQuote (args) { return makeFunction ('strictquote', args) }

  function makeListFunction (func, listvar, list, inner) { return makeFunction (func, [makeLocalAssign (listvar, list, inner)]) }
  function makeReduceFunction (varname, list, result, init, func) { return makeListFunction ('reduce', varname, list, [makeLocalAssign (result, init, func)]) }
  function makeRegexFunction (func, pattern, text, expr) { return makeFunction (func, [wrapNodes(pattern.body), wrapNodes(pattern.flags), wrapNodes(text)].concat (expr || [])) }

  function makeDefineFunction (args, inner) {
    return makeQuote ([makeLocalAssignChain (args.map (function (arg, n) { return makeAssign (arg, [makeLookup (makeGroupVarName (n + 1))]) }), inner)])
  }

  function makeModify (name, func, val) { return makeAssign (name, [makeFunction (func, [makeLookup (name), wrapNodes (val)])]) }
  function makeModifyConcat (name, suffix) { return makeAssign (name, [makeLookup (name)].concat (suffix)) }

  function makeArgList (args) {
    return args && args.length ? [makeFunction ('list', args.map (wrapNodes))] : undefined
  }

  function makeSymbol (name, args) { return makeSymbolMethod (name, 'expand', args) }
  function makeGetSymbol (name) { return makeSymbolMethod (name, 'get') }
  function makeSetSymbol (name, args) { return makeSymbolMethod (name, 'set', args) }

  function makeLinkShortcut (text) {
    var symName = text.toLowerCase()
        .replace(/^[^a-z0-9_]*/,'')
        .replace(/[^a-z0-9_]*$/,'')
        .replace(/[^a-z0-9_]+/g,'_')
    return (symName.length
  	  ? makeFunction ('link', [text, makeQuote ([makeSymbol (symName)])])
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
      return [makeLocalAssign (assign.varname, assign.value, chain)]
    }, scope)
    return list[0]
  }

  function makeCapped (args) { return makeFunction ('cap', args) }
  function makeUpperCase (args) { return makeFunction ('uc', args) }

  function sugarize (makeNode, name, args) {
    var node = makeNode (name, args)
    if (name.match(/^[0-9_]*[A-Z].*[a-z]/))
      return makeCapped ([node])
    else if (name.match(/[A-Z]/) && !name.match(/[a-z]/))
      return makeUpperCase ([node])
    return node
  }

  function makeSugaredSymbol (name, args) {
    return sugarize (makeSymbol, name, args)
  }

  function makeSugaredLookup (name) {
    return sugarize (makeLookup, name)
  }

  function makeTraceryExpr (sym, mods) {
    return mods.reduce (function (expr, mod) {
      return makeFunction (mod, [expr])
    }, makeConditional ([makeLookup(sym)], [makeFunction('eval',[makeLookup(sym)])], [makeSymbol(sym)]))
  }

  function makeProbExpr (probArg, trueArg, falseArg) {
    return makeConditional ([makeFunction ('lt',
                                           [makeFunction ('random', ['1']),
                                            wrapNodes (probArg)])],
                            trueArg,
                            falseArg)
  }

  function validRange (min, max) {
    return min <= max
  }

  function makeMeter (icon, expr, status) {
    return makeFunction ('push', [makeStrictQuote ([makeLookup ('meters')]),
                                  wrapNodes (makeArgList ([makeArgList ([icon,
                                                                         [makeStrictQuote ([makeFunction ('math', [expr])])]]
                                                                        .concat (status ? [status] : []))]))])
  }

  function makeRotate (arg) {
    return makeFunction ('append', [makeFunction ('notfirst', arg),
                                    makeFunction ('first', arg)])
  }

  function makeCycle (v, list, bump) {
    var vLookup = v[0].args, varname = v[0].args[0].varname
    return makeFunction ('eval',
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
                                                              true)])])
  }

  function makeQueue (v, list) {
    var vLookup = v[0].args, varname = v[0].args[0].varname
    return makeFunction ('eval',
                         [makeConditional ([makeFunction ('islist',
                                                          wrapNodes ([vLookup]))],
                                           [],
                                           [makeAssign (varname, list)]),
                          makeFunction ('shift', v)])
  }

  function makeImportanceSampler (num, expr, template) {
    return makeLocalAssignChain
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
                     makeLookup ('samples')])])
  }

  function makeSave (arg) {
    return makeQuote ([makeFunction ('unquote', ['$'].concat (arg)),
                       '=',
                       makeFunction ('unquote', [makeFunction ('quotify', [makeFunction ('eval', ['$'].concat (arg))])])])
  }

  var rhymeTries = 10, rhymeWeight = 100
  function makeRhyme (a, b, tries) {
    return makeLocalAssignChain
    ([{ varname: 'a', value: [] },
      { varname: 'b', value: [] }],
     [makeImportanceSampler (tries || rhymeTries,
                             makeFunction ('pow',
                                           [rhymeWeight.toString(),
                                            makeFunction ('assonance',
                                                          [makeLookup('a'),
                                                           makeLookup('b')])]),
                             [makeStrictQuote ([makeAssign ('a', a, true),
                                                makeAssign ('b', b, true)])])])
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
