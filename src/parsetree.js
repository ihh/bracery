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

// Specialized findNodes for symbol nodes (common use case)
function getSymbolNodes (rhs, gsnConfig) {
  gsnConfig = gsnConfig || {}
  return this.findNodes (rhs, {
    nodePredicate: function (nodeConfig, node) {
      var waitingForLink = (gsnConfig.linkOnly && !nodeConfig.inLink)
      function addLinkText (foundNode) {
	return extend ({}, foundNode, nodeConfig.linkText ? { linkText: nodeConfig.linkText } : {})
      }
      if (typeof(node) === 'object')
        switch (node.type) {
        case 'cond':
	  if (isTraceryExpr (node)
	      && !gsnConfig.ignoreTracery
              && !waitingForLink)
	    return addLinkText (node.f[0])
          break
        case 'sym':
          if (!gsnConfig.traceryOnly
              && !waitingForLink)
	    return addLinkText (node)
          break
        default:
          break
        }
      return false
    },
    makeChildConfig: function (nodeConfig, node, nChild) {
      if (typeof(node) === 'object')
        switch (node.type) {
        case 'func':
          if (node.funcname === 'link')
            return (gsnConfig.ignoreLink && nChild === 1
                    ? { excludeSubtree: true }
                    : extend (nodeConfig,
                              { inLink: true,
                                linkText: node.args[0] }))
          break
        case 'cond':
          if (isTraceryExpr(node))
            return { excludeSubtree: true }
          break
        default:
          break
        }
      return nodeConfig
    }
  })
}

// Specialized findNodes for checking if a tree contains no variables or symbols
function isStaticExpr (rhs) {
  return this.findNodes (rhs, {
    nodePredicate: function (nodeConfig, node) {
      return typeof(node) === 'object' && (node.type === 'sym' || node.type === 'lookup')
    }
  }).length === 0
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

function getQuoteAssignRhs (node) {
  return node.value[0].args
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

function getLayoutContent (node) {
  return node.args[1].args
}

function getLayoutExpr (node) {
  return node.value[0]
}

// $var=&layout{X,Y}{...}
function isLayoutAssign (node) {
  return typeof(node) === 'object' && node.type === 'assign' && !node.local && !node.visible && node.value.length === 1 && isLayoutExpr(node.value[0])
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
          case 'link':
            result = [funcChar, tok.funcname].concat ([[tok.args[0]], tok.args[1].args].map (function (args) { return makeFuncArgTree (pt, args, makeSymbolName, true) }))
            break
          case 'reveal':
            result = [funcChar, tok.funcname].concat (tok.args.map (function (arg) { return makeFuncArgTree (pt, [arg], makeSymbolName, true) }))
            break
          case 'placeholder':
            result = [funcChar, tok.funcname].concat ([tok.args[0].args, [tok.args[1]]].reduce (function (arr, args, n) { return (n || args.length
																  ? arr.concat ([makeFuncArgTree (pt, args, makeSymbolName, n > 0, n === 0)])
																  : arr) }, []))
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
  if (funcname === 'reduce' || funcname === 'vars' || funcname === 'math' || funcname === 'parse' || funcname === 'placeholder' || funcname === 'reveal')
    return funcname
  if (funcname === 'link' || funcname === 'layout')
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
  
  // parse tree manipulations
  sampleParseTree: sampleParseTree,
  findNodes: findNodes,
  getSymbolNodes: getSymbolNodes,
  parseTreeEmpty: parseTreeEmpty,
  isStaticExpr: isStaticExpr,
  isPlainSymExpr: isPlainSymExpr,
  isTraceryExpr: isTraceryExpr,
  traceryVarName: traceryVarName,
  isProbExpr: isProbExpr,
  isQuoteAssignKeywordExpr: isQuoteAssignKeywordExpr,
  isQuoteAssignExpr: isQuoteAssignExpr,
  getQuoteAssignRhs: getQuoteAssignRhs,
  isTagExpr: isTagExpr,
  getTagExprRhs: getTagExprRhs,
  isMeterExpr: isMeterExpr,
  getMeterIcon: getMeterIcon,
  getMeterLevel: getMeterLevel,
  getMeterStatus: getMeterStatus,
  isLayoutExpr: isLayoutExpr,
  getLayoutCoord: getLayoutCoord,
  getLayoutContent: getLayoutContent,
  isLayoutAssign: isLayoutAssign,
  getLayoutExpr: getLayoutExpr,
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
