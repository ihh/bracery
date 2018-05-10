var RhsParser = require('./rhs')

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

// Parse tree constants
var symChar = '$', varChar = '^', funcChar = '&', leftBraceChar = '{', rightBraceChar = '}', leftSquareBraceChar = '[', rightSquareBraceChar = ']', assignChar = '=', traceryChar = '#'

// Parse tree manipulations
function sampleParseTree (rhs, rng) {
  var pt = this
  rng = rng || Math.random
  return rhs.map (function (node, n) {
    var result, index
    if (typeof(node) === 'string')
      result = node
    else
      switch (node.type) {
      case 'assign':
	result = { type: 'assign',
                   varname: node.varname,
		   value: pt.sampleParseTree (node.value, rng),
                   local: node.local ? pt.sampleParseTree (node.local, rng) : undefined }
        break
      case 'alt':
        index = pt.randomIndex (node.opts)
	result = { type: 'opt',
                   n: index,
                   rhs: pt.sampleParseTree (node.opts[index], rng) }
        break
      case 'cond':
	result = { type: 'cond',
                   test: node.test,
		   t: pt.sampleParseTree (node.t, rng),
                   f: pt.sampleParseTree (node.f, rng) }
        break
      case 'func':
	result = { type: 'func',
                   funcname: node.funcname,
		   args: node.funcname === 'quote' ? node.args : pt.sampleParseTree (node.args, rng) }
        break
      case 'lookup':
	result = node
        break
      default:
      case 'sym':
	result = { type: 'sym' }
        if (typeof(node.name) !== 'undefined')
	  result.name = node.name
        if (typeof(node.id) !== 'undefined')
	  result.id = node.id
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
        r = pt.getSymbolNodes (node.value.concat (node.local || []))
        break
      case 'alt':
        r = node.opts.reduce (function (altResults, opt) {
          return altResults.concat (pt.getSymbolNodes (opt))
        }, [])
        break
      case 'func':
	switch (node.funcname) {
	case 'quote':
	  break
	case 'eval':
	  r = pt.getSymbolNodes (node.args.concat (node.value || []))
	  break
        default:
	  r = pt.getSymbolNodes (node.args)
          break
	}
        break
      case 'cond':
        r = pt.getSymbolNodes (node.test.concat (node.t, node.f))
        break
      case 'root':
      case 'opt':
        r = pt.getSymbolNodes (node.rhs)
        break
      default:
      case 'sym':
        r = [node]
	if (node.rhs)
	  r = r.concat (pt.getSymbolNodes (node.rhs))
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
      if (typeof(node) === 'string' && node.match(/\S/))
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
        case 'opt':
	  if (node.rhs)
	    result = pt.parseTreeEmpty (node.rhs)
	  break
        default:
        case 'sym':
	  if (node.rhs)
	    result = pt.parseTreeEmpty (node.rhs)
          else if (!node.notfound && !node.limit)
            result = false
	  break
        }
      }
    }
    return result
  }, true)
}

function isTraceryExpr (node, makeSymbolName) {
  makeSymbolName = makeSymbolName || defaultMakeSymbolName
  return typeof(node) === 'object' && node.type === 'cond'
    && node.test.length === 1 && typeof(node.test[0]) === 'object' && node.test[0].type === 'lookup'
    && node.t.length === 1 && typeof(node.t[0]) === 'object' && node.t[0].type === 'func'
    && node.t[0].funcname === 'eval' && node.t[0].args.length === 1 && node.t[0].args[0].type === 'lookup'
    && node.f.length === 1 && typeof(node.f[0]) === 'object' && node.f[0].type === 'sym'
    && node.test[0].varname.toLowerCase() === node.t[0].args[0].varname.toLowerCase()
    && node.test[0].varname.toLowerCase() === makeSymbolName (node.f[0]).toLowerCase()
}

function makeRhsText (rhs, makeSymbolName) {
  var pt = this
  makeSymbolName = makeSymbolName || defaultMakeSymbolName
  return rhs.map (function (tok, n) {
    var result
    if (typeof(tok) === 'string')
      result = tok.replace(/[\$&\^\{\}\|\\]/g,function(m){return'\\'+m})
    else {
      var nextTok = (n < rhs.length - 1) ? rhs[n+1] : undefined
      var nextIsAlpha = typeof(nextTok) === 'string' && nextTok.match(/^[A-Za-z0-9_]/)
      switch (tok.type) {
      case 'root':
        result = pt.makeRhsText (tok.rhs, makeSymbolName)
        break
      case 'lookup':
        result = (nextIsAlpha
                  ? (varChar + leftBraceChar + tok.varname + rightBraceChar)
                  : (varChar + tok.varname))
	break
      case 'assign':
        var assign = varChar + tok.varname + assignChar + leftBraceChar + pt.makeRhsText(tok.value,makeSymbolName) + rightBraceChar
        if (tok.local)
          result = funcChar + 'let' + assign + leftBraceChar + pt.makeRhsText(tok.local,makeSymbolName) + rightBraceChar
        else
          result = assign
	break
      case 'alt':
        result = leftSquareBraceChar + tok.opts.map (function (opt) { return pt.makeRhsText(opt,makeSymbolName) }).join('|') + rightSquareBraceChar
	break
      case 'cond':
        result = (isTraceryExpr (tok, makeSymbolName)
                  ? (traceryChar + tok.test[0].varname + traceryChar)
                  : (funcChar + [['if',tok.test],
				 ['then',tok.t],
				 ['else',tok.f]].map (function (keyword_arg) { return keyword_arg[0] + leftBraceChar + pt.makeRhsText (keyword_arg[1], makeSymbolName) + rightBraceChar }).join('')))
        break;
      case 'func':
	var sugaredName = pt.makeSugaredName (tok, makeSymbolName)
	if (sugaredName)
	  result = (nextIsAlpha
		    ? (sugaredName[0] + leftBraceChar + sugaredName.substr(1) + rightBraceChar)
		    : sugaredName)
	else {
          var noBraces = tok.args.length === 1 && (tok.args[0].type === 'func' || tok.args[0].type === 'lookup' || tok.args[0].type === 'alt')
          result = funcChar + tok.funcname + (noBraces ? '' : leftBraceChar) + pt.makeRhsText(tok.args,makeSymbolName) + (noBraces ? '' : rightBraceChar)
        }
	break
      case 'opt':
        break
      default:
      case 'sym':
        result = (nextIsAlpha
                  ? (symChar + leftBraceChar + makeSymbolName(tok) + rightBraceChar)
                  : (symChar + makeSymbolName(tok)))
	break
      }
    }
    return result
  }).join('')
}

function makeSugaredName (funcNode, makeSymbolName) {
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
      if (funcNode.funcname === 'cap' && name.match(/[a-z]/))
	sugaredName = prefixChar + name.replace(/[a-z]/,function(c){return c.toUpperCase()})
      else if (funcNode.funcname === 'uc' && name.match(/[a-z]/))
	sugaredName = prefixChar + name.toUpperCase()
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

function throwExpandError (node) {
  throw new Error ('unexpanded symbol node')
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
                            : (config.expand || throwExpandError)) })
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

function makeRhsExpansionPromise (config) {
  var pt = this
  var rhs = config.rhs || this.sampleParseTree (parseRhs (config.rhsText))
  var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
  return rhs.reduce (function (promise, child) {
    return promise.then (function (expansion) {
      return pt.makeExpansionPromise (extend ({},
                                              config,
                                              { node: child,
                                                vars: expansion.vars }))
        .then (function (childExpansion) {
          return extend (expansion,
                         childExpansion,
                         { text: expansion.text + childExpansion.text,
                           tree: expansion.tree.concat (childExpansion.tree) })
        })
    })
  }, resolve ({ text: '',
                vars: config.vars,
                tree: [] }))
}

function makeRhsExpansionPromiseForConfig (config, resolve, rhs, contextName) {
  var pt = this
  var newConfig = extend ({}, config, { rhs: rhs })
  if (contextName) {
    newConfig.depth = extend ({}, config.depth || {})
    var maxDepth = Math.min (config.maxDepth || pt.maxDepth,
                             config.maxDepthForExpr || pt.maxDepthForExpr)
    var oldDepth = newConfig.depth[contextName] || 0
    if (oldDepth >= maxDepth)
      return resolve ({ text: '', vars: config.vars })
    newConfig.depth[contextName] = oldDepth + 1
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

function makeExpansionPromise (config) {
  var pt = this
  var node = config.node
  var varVal = config.vars || {}
  var depth = config.depth || {}
  var makeSymbolName = config.makeSymbolName || defaultMakeSymbolName
  var resolve = config.sync ? syncPromiseResolve : Promise.resolve.bind(Promise)
  return handlerPromise ([node, varVal, depth], resolve(), config.before, node.type, 'all')
    .then (function() {
      var expansion = { text: '', vars: varVal }
      var expansionPromise = resolve (expansion), promise = expansionPromise
      var makeRhsExpansionPromiseFor = makeRhsExpansionPromiseForConfig.bind (pt, config, resolve)
      if (node) {
        if (typeof(node) === 'string') {
          expansion.text = node
        } else {
          
          switch (node.type) {
          case 'assign':
            var name = node.varname.toLowerCase()
            var oldValue = varVal[name]
            promise = makeRhsExpansionPromiseFor (node.value)
              .then (function (valExpansion) {
                expansion.vars = valExpansion.vars
                expansion.vars[name] = valExpansion.text
                if (node.local)
                  return makeRhsExpansionPromiseForConfig.call (pt, extend ({}, config, { vars: expansion.vars }), resolve, node.local)
                  .then (function (localExpansion) {
                    expansion.text = localExpansion.text
                    extend (expansion.vars, localExpansion.vars)
                    if (typeof(oldValue) === 'undefined')
                      delete expansion.vars[name]
                    else
                      expansion.vars[name] = oldValue
                    return expansionPromise
                  })
                else
                  return expansionPromise
              })
            break

          case 'lookup':
            var name = node.varname.toLowerCase()
            expansion.text = varVal[name] || ''
            break

          case 'cond':
            promise = makeRhsExpansionPromiseFor (node.test)
              .then (function (testExpansion) {
                var testValue = testExpansion.text.match(/\S/) ? true : false
                var condRhs = testValue ? node.t : node.f
                node.value = testValue  // for debugging
                return makeRhsExpansionPromiseFor (condRhs)
              })
            break

          case 'func':
            if (node.funcname === 'quote') {
              expansion.text = pt.makeRhsText (node.args, makeSymbolName)
	    } else {
              promise = makeRhsExpansionPromiseFor (node.args)
                .then (function (argExpansion) {
                  var arg = argExpansion.text
                  switch (node.funcname) {

                  case 'eval':
                    if (typeof(node.evaltext) === 'undefined') {
                      node.evaltext = arg
                      node.evaltree = parseRhs (arg)
                      node.value = pt.sampleParseTree (node.evaltree)
                    } else if (config.validateEvalText) {
	              var storedEvalText = pt.makeRhsText (node.evaltree, makeSymbolName)
                      if (storedEvalText !== arg) {
                        if (config.invalidEvalTextCallback)
		          config.invalidEvalTextCallback (node, storedEvalText, arg)
                        else
                          throw new Error ('evaltext mismatch')
                      }
                    }
                    return makeRhsExpansionPromiseFor (node.value, arg)
                      .then (function (evalExpansion) {
                        extend (expansion, evalExpansion)
                        return expansion
                      })
                    break

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

                  default:
                    expansion.text = arg
                    break
                  }
                }).then (function() {
                  return expansion
                })
            }
            break
          case 'root':
          case 'opt':
          case 'sym':
            var symbolExpansionPromise
            var expr = (node.type === 'sym' ? (symChar + (node.name || node.id)) : '')
            if (!node.rhs && config.expand)
              symbolExpansionPromise = handlerPromise ([node, varVal, depth], resolve(), config.before, 'expand')
              .then (function() {
                return config.expand (extend ({},
                                              config,
                                              { node: node,
                                                vars: varVal }))
              }).then (function (rhs) {
                node.rhs = rhs
                return handlerPromise ([node, varVal, depth, rhs], resolve(), config.after, 'expand')
              })
            else
              symbolExpansionPromise = resolve()
            promise = symbolExpansionPromise.then (function() {
              return makeRhsExpansionPromiseFor (node.rhs || [], expr)
            })
            break
          case 'alt':
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
  var pt = this
  return config.rhs.map (function (child) {
    return pt.makeExpansionText (extend ({}, config, { node: child }))
  }).join('')
}

function makeRhsExpansionTextForConfig (config, rhs) {
  return this.makeRhsExpansionText (extend ({}, config, { rhs: rhs }))
}

function makeExpansionText (config) {
  var node = config.node
  var leaveSymbolsUnexpanded = config.leaveSymbolsUnexpanded
  var varVal = config.vars || {}
  var makeSymbolName = config.makeSymbolName || defaultMakeSymbolName
  var expandCallback = config.expandCallback
  var expansion = ''
  var makeRhsExpansionTextFor = makeRhsExpansionTextForConfig.bind (this, config)
  if (node) {
    if (typeof(node) === 'string')
      expansion = node
    else
      switch (node.type) {
      case 'assign':
        var name = node.varname.toLowerCase()
        var oldValue = varVal[name]
        varVal[name] = makeRhsExpansionTextFor (node.value)
        if (node.local) {
          expansion = makeRhsExpansionTextFor (node.local)
          varVal[name] = oldValue
        }
        break
      case 'lookup':
        var name = node.varname.toLowerCase()
        expansion = varVal[name]
        break
      case 'cond':
        var test = makeRhsExpansionTextFor (node.test)
        expansion = makeRhsExpansionTextFor (test.match(/\S/) ? node.t : node.f)
        break;

      case 'func':
        if (node.funcname === 'quote')
          expansion = this.makeRhsText (node.args, makeSymbolName)
	else {
          var arg = makeRhsExpansionTextFor (node.args)
          switch (node.funcname) {

          case 'eval':
            var evaltext = makeRhsExpansionTextFor (node.args)
	    if (config.validateEvalText && typeof(node.evaltext) !== 'undefined') {
	      var storedEvalText = this.makeRhsText (node.evaltext, makeSymbolName)
	      if (evaltext !== storedEvalText)
		config.validateEvalText (storedEvalText, evalText)
	    }
            if (expandCallback && typeof(node.value) === 'undefined')
              expansion = expandCallback ({ node: node,
                                            text: evaltext,
                                            vars: varVal })
            else
              expansion = makeRhsExpansionTextFor (node.value)
            break

          case 'cap':
            expansion = capitalize (arg)
            break
          case 'uc':
            expansion = arg.toUpperCase()
            break
          case 'lc':
            expansion = arg.toLowerCase()
            break
          case 'plural':
            expansion = pluralForm(arg)
            break
          case 'a':
            expansion = indefiniteArticle (arg)
            break

            // nlp: nouns
          case 'nlp_plural':  // alternative to built-in plural
            expansion = nlp(arg).nouns(0).toPlural().text()
            break
          case 'singular':
            expansion = nlp(arg).nouns(0).toSingular().text()
            break
          case 'topic':
            expansion = nlp(arg).topics(0).text()
            break
          case 'person':
            expansion = nlp(arg).people(0).text()
            break
          case 'place':
            expansion = nlp(arg).places(0).text()
            break

            // nlp: verbs
          case 'past':
            expansion = nlp(arg).verbs(0).toPastTense().text()
            break
          case 'present':
            expansion = nlp(arg).verbs(0).toPresentTense().text()
            break
          case 'future':
            expansion = nlp(arg).verbs(0).toFutureTense().text()
            break
          case 'infinitive':
            expansion = nlp(arg).verbs(0).toInfinitive().text()
            break
          case 'gerund':
            expansion = nlp(arg).verbs(0).toGerund().text()
            break
          case 'adjective':
            expansion = nlp(arg).verbs(0).asAdjective()[0] || ''
            break
          case 'negative':
            expansion = nlp(arg).verbs(0).toNegative().text()
            break
          case 'positive':
            expansion = nlp(arg).verbs(0).toPositive().text()
            break

          default:
            expansion = arg
            break
          }
        }
        break
      case 'root':
      case 'opt':
      case 'sym':
/*
        if (leaveSymbolsUnexpanded && node.name)
          expansion = symCharHtml + node.name + '.' + (node.limit ? ('limit' + node.limit.type) : (node.notfound ? 'notfound' : 'unexpanded'))
        else
*/
          if (node.rhs)
          expansion = makeRhsExpansionTextFor (node.rhs)
        break
      case 'alt':
      default:
        break
      }
  }
  return expansion
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
  maxDepthForExpr: 3,

  // parsing
  RhsParser: RhsParser,
  parseRhs: parseRhs,
  makeRoot: makeRoot,

  // parse tree constants
  symChar: symChar,
  varChar: varChar,
  funcChar: funcChar,
  leftBraceChar: leftBraceChar,
  rightBraceChar: rightBraceChar,
  leftSquareBraceChar: leftSquareBraceChar,
  rightSquareBraceChar: rightSquareBraceChar,
  assignChar: assignChar,
  traceryChar: traceryChar,

  // parse tree manipulations
  sampleParseTree: sampleParseTree,
  getSymbolNodes: getSymbolNodes,
  parseTreeEmpty: parseTreeEmpty,
  isTraceryExpr: isTraceryExpr,
  makeSugaredName: makeSugaredName,
  makeRhsText: makeRhsText,
  makeExpansionText: makeExpansionText,
  makeRhsExpansionText: makeRhsExpansionText,

  makeExpansionPromise: makeExpansionPromise,
  makeRhsExpansionPromise: makeRhsExpansionPromise,
  makeExpansionSync: makeExpansionSync,
  makeRhsExpansionSync: makeRhsExpansionSync,

  summarizeRhs: summarizeRhs,
  summarizeExpansion: summarizeExpansion,
  finalVarVal: finalVarVal,
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
