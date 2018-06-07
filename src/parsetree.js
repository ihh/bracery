var RhsParser = require('./rhs')
var Chomsky = require('./chomsky')

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
function parseRhs (rhsText) {
  var result
  try {
    result = RhsParser.parse (rhsText)
  } catch (e) {
    console.warn ('parse error', e)
    result = [rhsText]
  }
  return result
}

function makeRoot (rhs) {
  return { type: 'root',
           rhs: rhs }
}

var newSymbolDefReg = /^>([A-Za-z_]\w*)\s*$/;
function parseTextDefs (text) {
  var rules = {}
  try {
    var currentRules, newSymbolDefMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        if (currentRules)
          currentRules.push (line)
        else if (newSymbolDefMatch = newSymbolDefReg.exec (line))
          rules[newSymbolDefMatch[1]] = currentRules = []
      } else {
        // line is empty
        currentRules = undefined
      }
    })
  } catch(e) { console.log(e) }
  return rules
}

// Parse tree constants
var symChar = '~', varChar = '$', funcChar = '&', leftBraceChar = '{', rightBraceChar = '}', leftSquareBraceChar = '[', rightSquareBraceChar = ']', pipeChar = '|', assignChar = '=', traceryChar = '#'
var nodeArgKeys = ['rhs','args','unit','value','local','cond','t','f','bind']
var nodeListArgKeys = ['opts']

// Parse tree manipulations
// sampleParseTree is the main method for constructing a new, clean parse tree from a template.
// in the process, it samples any alternations or repetitions
function sampleParseTree (rhs, config) {
  var pt = this
  var rng = config && config.rng ? config.rng : Math.random
  return rhs.map (function (node, n) {
    var result, index
    if (typeof(node) === 'string')
      result = node
    else if (config.quoteLevel > 0) {
      if (node.type === 'func' && node.funcname === 'unquote')
	result = { type: 'func',
                   funcname: 'unquote',
                   args: pt.sampleParseTree (node.args, extend ({}, config, { quoteLevel: (config.quoteLevel || 0) - 1 })) }
      else {
        result = extend ({}, node)
        if (node.type === 'func' && node.funcname === 'quote')
          config = extend ({}, config, { quoteLevel: (config.quoteLevel || 0) + 1 })
        nodeArgKeys.forEach (function (key) {
          if (node[key])
            result[key] = pt.sampleParseTree (node[key], config)
        })
        if (node.opts)
          result.opts = node.opts.map (function (opt) { return pt.sampleParseTree (opt, config) })
      }
    } else
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
        index = pt.randomIndex (node.opts)
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
                             ? pt.sampleParseTree (node.args, extend ({}, config, { quoteLevel: (config.quoteLevel || 0) + 1 }))
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
    return result
  })
}

function getSymbolNodes (rhs) {
  var pt = this
  return rhs.reduce (function (result, node) {
    var r
    if (typeof(node) === 'object')
      switch (node.type) {
      case 'lookup':
        break
      case 'assign':
        r = pt.getSymbolNodes ((node.value || []).concat (node.local || []))
        break
      case 'alt':
        r = node.opts.reduce (function (altResults, opt) {
          return altResults.concat (pt.getSymbolNodes (opt))
        }, [])
        break
      case 'rep':
        r = pt.getSymbolNodes (node.unit)
        break
      case 'func':
	switch (node.funcname) {
	case 'eval':
	  r = pt.getSymbolNodes (node.args.concat (node.value || []))
	  break
	case 'strictquote':
	case 'quote':
	case 'unquote':
        default:
	  r = pt.getSymbolNodes (node.args)
          break
	}
        break
      case 'cond':
        r = pt.getSymbolNodes (node.test.concat (node.t, node.f))
        break
      case 'root':
      case 'alt_sampled':
        r = pt.getSymbolNodes (node.rhs)
        break
      case 'rep_sampled':
        r = pt.getSymbolNodes (node.reps.reduce (function (all, rep) { return all.concat(rep) }, []))
        break
      default:
      case 'sym':
        r = [node]
	r = r.concat (pt.getSymbolNodes (node.rhs || node.bind || []))
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
      if (typeof(node) === 'string' && isTruthy (node))
	result = false
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
	  result = pt.parseTreeEmpty (node.rhs || node.bind || [])
	  break
        }
      }
    }
    return result
  }, true)
}

function isEvalVar (node) {
  return typeof(node) === 'object' && node.type === 'func'
    && node.funcname === 'eval' && node.args.length === 1 && node.args[0].type === 'lookup'
}

function isTraceryExpr (node, makeSymbolName) {
  makeSymbolName = makeSymbolName || defaultMakeSymbolName
  return typeof(node) === 'object' && node.type === 'cond'
    && node.test.length === 1 && typeof(node.test[0]) === 'object' && node.test[0].type === 'lookup'
    && node.t.length === 1 && isEvalVar (node.t[0])
    && node.f.length === 1 && typeof(node.f[0]) === 'object' && node.f[0].type === 'sym' && !(node.f[0].bind && node.f[0].bind.length && node.f[0].bind[0].args && node.f[0].bind[0].args.length)
    && node.test[0].varname.toLowerCase() === node.t[0].args[0].varname.toLowerCase()
    && node.test[0].varname.toLowerCase() === makeSymbolName (node.f[0]).toLowerCase()
}

function traceryVarName (traceryNode) {
  return traceryNode.test[0].varname.toLowerCase()
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
  return rhs.map (function (tok, n) {
    var result
    if (typeof(tok) === 'string')
      result = escapeString (tok)
    else {
      var nextTok = (n < rhs.length - 1) ? rhs[n+1] : undefined
//      console.warn('nextTok',tok,nextTok)
      var nextIsAlpha = (typeof(nextTok) === 'undefined'
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
        var assign = [varChar, tok.varname, (tok.visible ? ':' : '') + assignChar, [leftBraceChar, pt.makeRhsTree(tok.value,makeSymbolName), rightBraceChar]]
        if (tok.local)
          result = [funcChar, 'let'].concat (assign, [[leftBraceChar, pt.makeRhsTree(tok.local,makeSymbolName), rightBraceChar]])
        else
          result = assign
	break
      case 'alt':
        result = [leftSquareBraceChar,
                  tok.opts.map (function (opt, n) {
                    var optTree = pt.makeRhsTree(opt,makeSymbolName)
                    if (n === 0 && optTree.length && typeof(optTree[0]) === 'string')
                      optTree[0] = optTree[0].replace (/(:|=>)/g, function (_m, g) { return '\\' + g })
                    return [optTree].concat (n < tok.opts.length - 1 ? [pipeChar] : [])
                  }),
                  rightSquareBraceChar]
	break
      case 'rep':
        result = [funcChar, 'rep', makeFuncArgTree (pt, tok.unit, makeSymbolName), [leftBraceChar, tok.min + (tok.max !== tok.min ? (',' + tok.max) : ''), rightBraceChar]]
	break
      case 'cond':
        result = (isTraceryExpr (tok, makeSymbolName)
                  ? [traceryChar, tok.test[0].varname, traceryChar]
                  : [['if',tok.test],
		     ['then',tok.t],
		     ['else',tok.f]].reduce (function (memo, keyword_arg, n) {
                       return memo.concat ([(n ? '' : funcChar) + keyword_arg[0], [leftBraceChar, pt.makeRhsTree (keyword_arg[1], makeSymbolName), rightBraceChar]])
                     }, []))
        break;
      case 'func':
        if (tok.funcname === 'link') {
          result = [funcChar, tok.funcname].concat ([tok.args[0], tok.args[1], tok.args[2].args[0]].map (function (arg) { return makeFuncArgTree (pt, [arg], makeSymbolName) }))
        } else if (tok.funcname === 'parse') {
          result = [funcChar, tok.funcname].concat ([tok.args[0].args, [tok.args[1]]].map (function (args) { return makeFuncArgTree (pt, args, makeSymbolName) }))
        } else if (binaryFunction[tok.funcname] || tok.funcname === 'apply') {
          result = [funcChar, tok.funcname].concat (tok.args.map (function (arg) { return makeFuncArgTree (pt, [arg], makeSymbolName) }))
        } else if (varFunction[tok.funcname]) {
          result = [funcChar, tok.funcname, varChar, tok.args[0].args[0].varname].concat (tok.args.length > 1 ? [makeFuncArgTree (pt, tok.args.slice(1), makeSymbolName)] : [])
        } else if (regexFunction[tok.funcname]) {
          result = [funcChar, tok.funcname, '/', pt.makeRhsTree ([tok.args[0]], makeSymbolName), '/', pt.makeRhsTree ([tok.args[1]], makeSymbolName)]
            .concat (tok.args.slice(2).map (function (arg, n) { return makeFuncArgTree (pt, n>0 ? arg.args : [arg], makeSymbolName) }))
        } else if (tok.funcname === 'map' || tok.funcname === 'filter' || tok.funcname === 'weightsort' || tok.funcname === 'lexsort' || tok.funcname === 'reduce') {
          result = [funcChar, tok.funcname, (tok.args[0].varname === '_' ? '' : [varChar, tok.args[0].varname, ':']), makeFuncArgTree (pt, tok.args[0].value, makeSymbolName)]
            .concat (tok.funcname === 'reduce'
                     ? [varChar, tok.args[0].local[0].varname, '=', makeFuncArgTree (pt, tok.args[0].local[0].value, makeSymbolName), makeFuncArgTree (pt, tok.args[0].local[0].local[0].args, makeSymbolName)]
                     : [makeFuncArgTree (pt, tok.args[0].local[0].args, makeSymbolName)])
        } else if (tok.funcname === 'vars') {
          result = [funcChar, tok.funcname]
        } else if (tok.funcname === 'call') {
          result = [funcChar, tok.funcname, makeFuncArgTree (pt, [tok.args[0]], makeSymbolName)].concat (makeArgList.call (pt, tok.args[1].args, makeSymbolName))
        } else if (tok.funcname === 'strictquote' || tok.funcname === 'quote' || tok.funcname === 'unquote') {
          result = [funcChar, tok.funcname, makeFuncArgTree (pt, tok.args, makeSymbolName, tok.funcname === 'unquote')]
        } else if (tok.funcname === 'math') {
          return [funcChar, tok.funcname, [leftBraceChar, makeMathTree (pt, tok.args[0], makeSymbolName), rightBraceChar]]
        } else {
	  var sugaredName = pt.makeSugaredName (tok, makeSymbolName, nextIsAlpha)
          if (sugaredName) {
	    result = sugaredName
          } else {
            result = [funcChar, tok.funcname, makeFuncArgTree (pt, tok.args, makeSymbolName, nextIsAlpha)]
          }
        }
	break
      case 'alt_sampled':
      case 'rep_sampled':
        break
      default:
      case 'sym':
        var hasArgList = tok.bind && tok.bind.length && tok.bind[0] && tok.bind[0].type === 'func' && tok.bind[0].funcname === 'list'
        var hasNonemptyArgList = hasArgList && tok.bind[0].args.length
        var isApply = tok.bind && !hasArgList
        result = (isApply
                  ? [funcChar + symChar, makeSymbolName(tok), makeFuncArgTree (pt, tok.bind)]
                  : (nextIsAlpha && !hasNonemptyArgList
                     ? [symChar, [leftBraceChar, makeSymbolName(tok), rightBraceChar]]
                     : [symChar, makeSymbolName(tok)].concat ([makeArgList.call (pt, tok.bind, makeSymbolName)])))
	break
      }
    }
    return result
  })
}

function makeArgList (args, makeSymbolName) {
  var pt = this
  return (args && args.length && args[0].args && args[0].args.length
          ? args[0].args.map (function (arg) { return [leftBraceChar].concat (pt.makeRhsTree ([arg], makeSymbolName)).concat ([rightBraceChar]) })
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

function throwSymbolError (config) {
  throw new Error ('unhandled method (' + config.node.method + ') for symbol ' + symChar + config.node.name)
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
                            : (config.expand || throwSymbolError)),
                   get: (config.getSync
                         ? makeSyncResolver (config, config.getSync)
                         : (config.get || throwSymbolError)),
                   set: (config.setSync
                         ? makeSyncResolver (config, config.setSync)
                         : (config.set || throwSymbolError)) })
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

function makeRhsExpansionPromise (config) {
  var pt = this
  var rhs = config.rhs || this.sampleParseTree (parseRhs (config.rhsText), config)
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

function toNumber (text) {
  return nlp(text).values().numbers()[0] || 0
}

function cloneItem (item) {
  return (typeof(item) === 'undefined'
          ? undefined
          : (typeof(item) === 'string'
             ? item
             : item.map(cloneItem)))
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

function makeGenerator (item) {
  return (item
          ? (typeof(item) === 'string'
             ? (funcChar + 'value{' + item + '}')
             : (funcChar + 'list{' + item.map(makeGenerator).join('') + '}'))
          : '')
}

function shuffleArray (a, rng) {
  for (var n = 0; n < a.length - 1; ++n) {
    var m = Math.floor (rng() * (a.length - n))
    var tmp = a[n]
    a[n] = a[m]
    a[m] = tmp
  }
  return a
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
          return makeAssignmentPromise.call (pt, config, match.map (function (group, n) { return [''+n, [group]] }), sampledExprTree)
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
  add: function (l, r) {
    var lVals = nlp(l).values()
    return (lVals.length ? lVals.add(toNumber(r)).out() : r) || zeroVal
  },
  subtract: function (l, r) {
    var lVals = nlp(l).values()
    return (lVals.length ? lVals.subtract(toNumber(r)).out() : r) || zeroVal
  },
  multiply: function (l, r) {
    return (toNumber(l) * toNumber(r)).toString()
  },
  divide: function (l, r) {
    return (toNumber(l) / toNumber(r)).toString()
  },
  gt: function (l, r) {
    return nlp(l).values().greaterThan(toNumber(r)).out()
  },
  lt: function (l, r) {
    return nlp(l).values().lessThan(toNumber(r)).out()
  },
  eq: function (l, r) {
    return toNumber(l) === toNumber(r) ? l : falseVal
  },
  neq: function (l, r) {
    return toNumber(l) === toNumber(r) ? falseVal : l
  },
  leq: function (l, r) {
    return binaryFunction.eq(l,r) || binaryFunction.lt(l,r)
  },
  geq: function (l, r) {
    return binaryFunction.eq(l,r) || binaryFunction.gt(l,r)
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
  parse: function (l, r, lv, rv, config) {
    var result = ''
    if (!(r.length > (config.maxParseLength || this.maxParseLength))) {
      var parse
      try {
        parse = Chomsky.parseInside (this,
                                     extend ({},
                                             config,
                                             { root: l,
                                               text: r,
                                               maxSubsequenceLength: config.maxSubsequenceLength || this.maxSubsequenceLength }))
      } catch (e) {
        if (config.verbose > 1)
          console.warn (e)
      }
      if (parse)
        result = makeArray (parse)
    }
    return result
  }
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
    expansion.tree = [nodeCopy]
    return expansion
  })
}

function makeEvalPromise (config, makeSymbolName, evalNode, evalNodeRhs, argsNodeRhs) {
  var pt = this
  var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
  var makeRhsExpansionPromiseFor = makeRhsExpansionReducer (pt, config, textReducer, {})
  return makeRhsExpansionPromiseFor (evalNodeRhs)
    .then (function (evalExpansion) {
      var evalText = evalExpansion.text
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
          return makeAssignmentPromise.call (pt,
                                             config,
                                             [[makeGroupVarName(0), null, args]]
                                             .concat (args.map (function (arg, n) {
                                               return [makeGroupVarName(n+1), null, arg]
                                             })),
                                             evalNode.value)
        })
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
	    if (node.expansion) {
	      // guard against double expansion
	      extend (expansion, node.expansion)
            } else if (node.funcname === 'strictquote') {
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
            } else if (node.funcname === 'weightsort' || node.funcname === 'lexsort') {
              // weightsort/lexsort. first arg is &let$VAR:LIST{&strictquote{EXPR}}
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
                      var weights = makeArray (weightListExpansion.value).map (node.funcname === 'weightsort' ? toNumber : makeString)
                      var indices = listExpansion.value.map (function (_val, n) { return n })
                      var sortedIndices = indices.sort (node.funcname === 'weightsort'
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
              promise = makeRhsExpansionPromiseFor ([node.args[0].args[0]])
                .then (function (varExpansion) {
                  expansion.nodes += varExpansion.nodes
                  return (node.args.length === 1   // unary or binary?
                          ? func.call (pt, name, varVal, varExpansion.text, varExpansion.value, config)
                          : (makeRhsExpansionPromiseFor ([node.args[1]])
                             .then (function (argExpansion) {
                               return func.call (pt, name, varVal, varExpansion.text, argExpansion.text, varExpansion.value, argExpansion.value, config)
                             })))
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
                .then (function (typeArg) {
                  return makeRhsExpansionPromiseFor ([node.args[1]])
                    .then (function (textArg) {
                      return makeRhsExpansionPromiseFor ([node.args[2]])
                        .then (function (linkArg) {
                          expansion.nodes += typeArg.nodes + textArg.nodes + linkArg.nodes
                          expansion.text = (config.makeLink
                                            ? config.makeLink (typeArg, textArg, linkArg)
                                            : (funcChar + node.funcname
                                               + leftBraceChar + typeArg.text + rightBraceChar
                                               + leftBraceChar + textArg.text + rightBraceChar
                                               + leftBraceChar + linkArg.text + rightBraceChar))
                          expansion.value = expansion.text
                          return expansionPromise
                        })
                    })
                })
	    } else {
              // unary functions
              promise = makeRhsExpansionPromiseFor (node.args)
                .then (function (argExpansion) {
                  var arg = argExpansion.text
                  expansion.nodes += argExpansion.nodes
                  switch (node.funcname) {

                    // eval
                  case 'eval':
                    return makeEvalPromise.call (pt, config, makeSymbolName, node, node.args, null)
                      .then (addExpansionNodes)
                    break

                    // tree
                  case 'tree':
                    expansion.value = ['root'].concat (makeParseTree (argExpansion.tree))
                    expansion.text = makeString (expansion.value)
                    break

                    // syntax
                  case 'syntax':
                    node.evaltree = parseRhs (arg)
                    expansion.value = pt.makeRhsTree (node.evaltree, makeSymbolName)
                    expansion.text = makeString (expansion.value)
                    break

                    // call, apply
                  case 'call':
                  case 'apply':
                    return makeEvalPromise.call (pt, config, makeSymbolName, node, [node.args[0]], [node.args[1]])
                      .then (addExpansionNodes)
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
                    expansion.text = makeGenerator (argExpansion.value || argExpansion.text)
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
                    expansion.value = shuffleArray (makeArray (argExpansion.value), config.rng || Math.random)
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
                    expansion.text = isTruthy (arg) ? '' : trueVal
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
                    expansion.text = nlp(arg).topics(0).text()
                    break
                  case 'person':
                    expansion.text = nlp(arg).people(0).text()
                    break
                  case 'place':
                    expansion.text = nlp(arg).places(0).text()
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
                    expansion.text = (rng() * toNumber(arg)) + ''
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
	    promise = promise.then (function (expansion) {
	      // guard against double expansion
	      node.expansion = { text: expansion.text,
				 value: cloneItem (expansion.value),
                                 vars: extend ({}, expansion.vars) }
	      return expansion
	    })
            break
          case 'sym':
            var symbolExpansionPromise
            var expr = symChar + (node.name || node.id)
            var method = node.method
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
                    return makeAssignmentPromise.call (pt,
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
      tree.push ([funcChar + 'eval' + varChar + node.args[0].varname].concat (makeParseTree (node.value)))
    else if (node.type === 'sym')
      tree.push ([(node.method === 'get' ? (funcChar + 'xget') : '') + symChar + node.name].concat (makeParseTree (node.rhs)))
    else if (node.type === 'lookup')
      tree.push ([varChar + node.varname, makeString (node.value)])
    else if (node.type === 'alt_sampled')
      tree.push ([pipeChar].concat (makeParseTree (node.rhs)))
    else
      tree.push (typeof(node) === 'string' ? node : node.expansion.text)
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

// Externally exposed functions
module.exports = {
  // config
  maxDepth: 100,
  maxRecursion: 3,
  maxReps: 10,
  maxNodes: 1000,
  maxLength: 1000,
  maxParseLength: undefined,
  maxSubsequenceLength: 100,

  // parsing
  RhsParser: RhsParser,
  parseRhs: parseRhs,
  parseTextDefs: parseTextDefs,
  makeRoot: makeRoot,

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

  // parse tree manipulations
  sampleParseTree: sampleParseTree,
  getSymbolNodes: getSymbolNodes,
  parseTreeEmpty: parseTreeEmpty,
  isTraceryExpr: isTraceryExpr,
  isEvalVar: isEvalVar,
  makeSugaredName: makeSugaredName,
  makeRhsText: makeRhsText,
  makeRhsTree: makeRhsTree,
  makeExpansionText: makeExpansionText,
  makeRhsExpansionText: makeRhsExpansionText,

  makeExpansionPromise: makeExpansionPromise,
  makeRhsExpansionPromise: makeRhsExpansionPromise,
  makeExpansionSync: makeExpansionSync,
  makeRhsExpansionSync: makeRhsExpansionSync,

  summarizeRhs: summarizeRhs,
  summarizeExpansion: summarizeExpansion,
  finalVarVal: finalVarVal,

  makeString: makeString,
  makeArray: makeArray,
  makeGenerator: makeGenerator,
  escapeString: escapeString,
  
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
  // general numerics
  ordinal: ordinal,
  nPlurals: nPlurals,
  // general utility
  extend: extend,
  isArray: isArray,
  randomIndex: randomIndex,
  randomElement: randomElement,
  nRandomElements: nRandomElements
}
