var ParseTree = require('./ParseTree')

function makeChomskyNormalCFG (bracery, vars, rhs) {
  if (!rhs) {
    rhs = vars
    vars = {}
  }
  var cfg = {}
  var start = makeChomskyNormalSymbol (bracery, vars, cfg, [typeof(rhs) === 'string' ? ParseTree.parseRhs(rhs) : rhs])
  if (!start)
    return null
  var toposort = toposortSymbols (cfg)
  return { cfg: cfg,
	   empties: toposort.empties,
	   cyclic: toposort.cyclic,
	   sort: toposort.sort,
	   start: start.name }
}

function makeChomskyNormalRules (bracery, vars, cfg, name) {
  var opts, rules
  if (vars[name])
    opts = [ParseTree.parseRhs (vars[name])]
  else if (rules = bracery.rules[name])
    opts = (typeof(rules) === 'string' ? [rules] : rules).map (function (rule) {
      return typeof(rule) === 'string' ? ParseTree.parseRhs (rule) : rule
    })
  else
    opts = []
  return makeChomskyNormalSymbol (bracery, vars, cfg, opts, name)
}

function makeChomskyNormalSymbol (bracery, vars, cfg, rhsList, name, weight) {
  name = name || (Object.keys(cfg).filter(function(name){return name.match(/^[0-9]+$/)}).length + 1).toString()
  if (typeof(cfg[name]) === 'undefined') {
    cfg[name] = true  // placeholder
    cfg[name] = rhsList.map (function (rhs, node) {
      return (typeof(rhs) === 'string' ? [rhs] : rhs).slice(0).reverse().reduce (function (normalRhs, node) {
	var cfgNode
	if (normalRhs) {
	  if (typeof(node) === 'string')
	    cfgNode = { type: 'term', text: node }
	  else if (node.type === 'term' || node.type === 'nonterm')
	    cfgNode = node
	  else if (node.type === 'alt')
	    cfgNode = makeChomskyNormalSymbol (bracery, vars, cfg, node.opts)
	  else if (node.type === 'sym')
	    cfgNode = makeChomskyNormalRules (bracery, vars, cfg, node.name)
	  else if (ParseTree.isTraceryExpr (node))
	    cfgNode = makeChomskyNormalRules (bracery, vars, cfg, node.test[0].varname)
	  else if (ParseTree.isEvalVar (node))
	    cfgNode = makeChomskyNormalRules (bracery, vars, cfg, node.args[0].varname)
	  else
	    throw new Error ("Can't convert to context-free grammar: " + JSON.stringify(node))
	}
	return (cfgNode
		? (normalRhs.rhs.length < 2
		   ? { rhs: [cfgNode].concat (normalRhs.rhs),
		       weight: normalRhs.weight }
		   : { rhs: [cfgNode, makeChomskyNormalSymbol (bracery, vars, cfg, [normalRhs.rhs])],
		       weight: normalRhs.weight })
		: null)
      }, { rhs: [], weight: 1 / rhsList.length })
    })
  }
  return cfg[name] ? { type: 'nonterm', name: name } : null
}

function getSymbols (cfg) {
  return Object.keys (cfg)
}

function getSources (cfg) {
  var isSource = {}, symbols = getSymbols (cfg)
  symbols.forEach (function (sym) {
    cfg[sym].forEach (function (rhs) {
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
  return cfg[sym].reduce (function (foundEmptyRhs, rhs) {
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
    cfg[source].forEach (function (rhs) {
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

function toposortSymbols (cfg) {
  var symbols = getSymbols (cfg), trans = getNullTransitions (cfg)
  // Kahn, Arthur B. (1962), "Topological sorting of large networks", Communications of the ACM 5 (11): 558–562, doi:10.1145/368996.369025
  // https://en.wikipedia.org/wiki/Topological_sorting
  var S = [], L = []
  var nParents = [], edges = 0
  symbols.forEach (function (c) {
    nParents[c] = trans.sources[c].length
    edges += nParents[c]
    if (nParents[c] == 0)
      S.push (c)
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

  if (edges > 0)
    trans.cyclic = true
  else
    trans.sort = L

  return trans
}

module.exports = { makeChomskyNormalCFG: makeChomskyNormalCFG }
