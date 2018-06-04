var ParseTree = require('./ParseTree')

// despite the name, this doesn't quite return Chomsky normal form, as we do not eliminate empty rules or transitions
function makeChomskyNormalCFG (bracery, vars, rhs) {
  if (!rhs) {
    rhs = vars
    vars = {}
  }
  var cfg = {}
  var start = makeChomskyNormalSymbol (bracery, vars, cfg, [typeof(rhs) === 'string' ? ParseTree.parseRhs(rhs) : rhs], 'start')
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
  return makeChomskyNormalSymbol (bracery, vars, cfg, opts, 'sym', name)
}

function makeChomskyNormalSymbol (bracery, vars, cfg, rhsList, type, name, weight) {
  name = name || (Object.keys(cfg).filter(function(name){return name.match(/^[0-9]+$/)}).length + 1).toString()
  if (typeof(cfg[name]) === 'undefined') {
    cfg[name] = true  // placeholder
    cfg[name] = { type: type,
		  opts: rhsList.map (function (rhs, node) {
		    return (typeof(rhs) === 'string' ? [rhs] : rhs).slice(0).reverse().reduce (function (normalRhs, node) {
		      var cfgNode
		      if (normalRhs) {
			if (typeof(node) === 'string')
			  cfgNode = { type: 'term', text: node }
			else if (node.type === 'term' || node.type === 'nonterm')
			  cfgNode = node
			else if (node.type === 'alt')
			  cfgNode = makeChomskyNormalSymbol (bracery, vars, cfg, node.opts, 'alt')
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
				 : { rhs: [cfgNode, makeChomskyNormalSymbol (bracery, vars, cfg, [normalRhs.rhs], 'elim')],
				     weight: normalRhs.weight })
			      : null)
		    }, { rhs: [], weight: 1 / rhsList.length })
		  })
		}
  }
  return cfg[name] ? { type: 'nonterm', name: name } : null
}

function getSymbols (cfg) {
  return Object.keys (cfg)
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

function getSplit (text, i, j, k) {
  return { subseq: [text.substr(i,k-i), text.substr(k,j-k)],
	   start: [i, k],
	   end: [k, j],
	   len: [k-i, j-k] }
}

function ruleWeight (cfg, inside, split, rhs) {
  return rhs.rhs.reduce (function (w, node, pos) {
    return w * (node.type === 'term'
		? (node.text === split.subseq[pos] ? 1 : 0)
		: (inside[split.start[pos]][split.len[pos]][node.name] || 0))
  }, rhs.weight)
}

function sampleTrace (cfg, text, inside, i, j, lhs, rng) {
  rng = rng || Math.random
  var applications = [], weights = [], totalWeight = 0
  for (var k = i; k <= j; ++k) {
    var split = getSplit (text, i, j, k)
    cfg.cfg[lhs].opts.forEach (function (rhs) {
      var w = ruleWeight (cfg, inside, split, rhs)
      applications.push ({ split: split, rhs: rhs})
      weights.push (w)
      totalWeight += w
    })
  }
  var r = rng() * totalWeight, n
  for (n = 0; n < applications.length - 1; ++n)
    if ((r -= weights[n]) <= 0)
      break
  var app = applications[n], split = app.split, rhs = app.rhs
  return [lhs].concat (rhs.rhs.map (function (node, pos) {
    return node.type === 'term' ? node.text : sampleTrace (cfg, text, inside, split.start[pos], split.end[pos], node.name, rng)
  }))
}

function transformTrace (cfg, trace) {
  return trace.slice(1).reduce (function (t, node) {
    if (typeof(node) === 'string')
      return t.concat ([node])
    var name = node[0], type = cfg.cfg[name].type, rest = transformTrace (cfg, node).slice(1)
    switch (type) {
    case 'sym':
      return t.concat ([[ParseTree.traceryChar + name + ParseTree.traceryChar].concat (rest)])
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

function fillInside (cfg, text) {
  var len = text.length
  var inside = new Array(len+1).fill(0).map (function (_, n) {
    return new Array(len+1-n).fill(0).map (function() {
      return {}
    })
  })
  var insideFillOrder = (cfg.sort || Object.keys(cfg.cfg).sort()).slice(0).reverse()
  for (var i = len; i >= 0; --i)
    for (var j = i; j <= len; ++j)
      for (var k = i; k <= j; ++k) {
	var split = getSplit (text, i, j, k)
	insideFillOrder.forEach (function (lhs) {
	  cfg.cfg[lhs].opts.forEach (function (rhs) {
	    var weight = ruleWeight (cfg, inside, split, rhs)
	    inside[i][j-i][lhs] = (inside[i][j-i][lhs] || 0) + weight
	  })
	})
      }
  return inside
}

function parseInside (cfg, text, rng) {
  var inside = fillInside (cfg, text)
  var trace = sampleTrace (cfg, text, inside, 0, text.length, cfg.start, rng)
  return ['root'].concat (transformTrace (cfg, trace).slice(1))
}

function parse (config) {
  var bracery = config.bracery
  var root = config.root || (ParseTree.traceryChar + bracery.getDefaultSymbol() + ParseTree.traceryChar)
  var cfg = makeChomskyNormalCFG (bracery, config.vars || {}, root)
  return parseInside (cfg, config.text, config.rng || bracery.rng)
}

module.exports = { makeChomskyNormalCFG: makeChomskyNormalCFG,
		   parse: parse }
