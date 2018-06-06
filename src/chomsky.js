// set config.normal to force max two symbols on RHS of any rule (despite the name, this isn't quite Chomsky normal form, as it includes empty rules, transitions, multi-character terminal strings...)
function makeGrammar (ParseTree, config) {
  var vars = config.vars || {}, root = config.root
  var cfg = {}
  var start = makeGrammarSymbol (ParseTree, config, cfg, [typeof(root) === 'string' ? ParseTree.parseRhs(root) : root], 'start')
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
  return { cfg: cfg,
           ranked: sortOrder.map (function (sym) { return cfg[sym] }),
	   empties: toposort.empties,
	   cyclic: toposort.cyclic,
	   sort: sortOrder,
           rank: symbolRank,
	   start: start.name }
}

function makeGrammarRules (ParseTree, config, cfg, name, checkVars, checkSym, expand) {
  var vars = config.vars || {}
  var opts, symDef, cfgName
  if (checkVars && vars[name]) {
    symDef = vars[name]
    cfgName = expand ? (ParseTree.funcChar + ParseTree.varChar + name) : (ParseTree.varChar + name)
  } else if (checkSym && config.get && (symDef = config.get ({ symbolName: name }))) {
    symDef = symDef.join('')
    cfgName = expand ? (ParseTree.symChar + name) : (ParseTree.funcChar + 'xget' + ParseTree.name)
  }
  if (symDef) {
    if (checkVars && checkSym)
      cfgName = ParseTree.traceryChar + name + ParseTree.traceryChar
    opts = expand ? [ParseTree.parseRhs (symDef)] : [symDef]
  } else
    opts = []
  return makeGrammarSymbol (ParseTree, config, cfg, opts, 'sym', cfgName)
}

function makeGrammarSymbol (ParseTree, config, cfg, rhsList, type, name, weight) {
  var vars = config.vars || {}
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
			  cfgNode = makeGrammarSymbol (ParseTree, config, cfg, node.opts, 'alt')
			else if (node.type === 'sym')
			  cfgNode = makeGrammarRules (ParseTree, config, cfg, node.name, false, true, true)
			else if (node.type === 'lookup')
			  cfgNode = makeGrammarRules (ParseTree, config, cfg, node.varname, true, false, false)
			else if (ParseTree, ParseTree.isTraceryExpr (node))
			  cfgNode = makeGrammarRules (ParseTree, config, cfg, node.test[0].varname, true, true, true)
			else if (ParseTree, ParseTree.isEvalVar (node))
			  cfgNode = makeGrammarRules (ParseTree, config, cfg, node.args[0].varname, true, false, true)
			else
			  throw new Error ("Can't convert to context-free grammar: " + ParseTree.makeRhsText ([node]))
		      }
		      return (cfgNode
			      ? (!config.normal || normalRhs.rhs.length < 2
				 ? { rhs: [cfgNode].concat (normalRhs.rhs),
				     weight: normalRhs.weight }
				 : { rhs: [cfgNode, makeGrammarSymbol (ParseTree, config, cfg, [normalRhs.rhs], 'elim')],
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
    console.warn(L)
  }

  trans.sort = L
  return trans
}

// Inside algorithm c.f. Durbin, Eddy, Krogh & Mitchison (1998) "Biological Sequence Analysis"
// or other sources e.g. https://en.wikipedia.org/wiki/Inside%E2%80%93outside_algorithm
function ruleWeight (inside, text, maxSubseqLen, i, j, k, rhs) {
  var rhsLen = rhs.rhs.length
  if ((rhsLen === 0 && i !== j) || (rhsLen === 1 && k < j))
    return 0
  var w = rhs.weight
  for (var pos = 0; w && pos < rhsLen; ++pos) {
    var node = rhs.rhs[pos]
    var start = pos ? k : i, len = pos ? (j-k) : (k-i), idx = len
    if (start && len > maxSubseqLen) {
      if (start + len === text.length)
        idx = maxSubseqLen + 1
      else
        return 0
    }
    w *= (node.type === 'term'
	  ? (node.text.length === len && node.text === text.substr(start,len) ? 1 : 0)
	  : (inside[start][idx][node.rank] || 0))
  }
  return w
}

function sampleTrace (config, cfg, text, inside, i, j, lhs, rng) {
  rng = rng || Math.random
  var applications = [], weights = [], totalWeight = 0
  for (var k = i; k <= j; ++k) {
    cfg.ranked[lhs].opts.forEach (function (rhs) {
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
  var app = applications[n], k = app.k, rhs = app.rhs
  return [cfg.sort[lhs]].concat (rhs.rhs.map (function (node, pos) {
    return (node.type === 'term'
            ? node.text
            : sampleTrace (config, cfg, text, inside, pos ? k : i, pos ? j : k, node.rank, rng))
  }))
}

function transformTrace (ParseTree, config, cfg, trace) {
  return trace.slice(1).reduce (function (t, node) {
    if (typeof(node) === 'string')
      return t.concat ([node])
    var name = node[0], type = cfg.cfg[name].type, rest = transformTrace (ParseTree, config, cfg, node).slice(1)
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
//  console.warn('cfg',JSON.stringify(cfg,null,2))
  var len = text.length, nSym = cfg.sort.length
  var maxSubseqLen = config.maxSubsequenceLength || len
  var inside = new Array(len+1).fill(0).map (function (_, i) {
    return new Array(i === 0 ? (len+1) : Math.min(maxSubseqLen+2,len+1-i)).fill(0).map (function() {
      return new Array(nSym).fill(0)
    })
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
      for (var s = nSym - 1; s >= 0; --s) {
        var opts = cfg.ranked[s].opts
        for (var r = 0; r < opts.length; ++r) {
          var rhs = opts[r]
          for (var k = rhs.length === 1 ? j : i; k <= j; ++k) {
	    var weight = ruleWeight (inside, text, maxSubseqLen, i, j, k, rhs)
//            console.warn ('fillInside', 'weight='+weight, 'i='+i, 'j='+j, 'k='+k, 'lhs='+cfg.sort[s], 'rhs='+JSON.stringify(rhs))
            if (weight)
	      inside[i][ijIndex][s] = (inside[i][ijIndex][s] || 0) + weight
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
  var cfg = makeGrammar (ParseTree, ParseTree.extend ({}, config, { normal: true }))
  var text = config.text, rng = config.rng
  var inside = fillInside (config, cfg, text)
  if (!inside[0][text.length][cfg.rank[cfg.start]])
    return ''
  var trace = sampleTrace (config, cfg, text, inside, 0, text.length, cfg.rank[cfg.start], rng)
  return ['root'].concat (transformTrace (ParseTree, ParseTree, cfg, trace).slice(1))
}

module.exports = { makeGrammar: makeGrammar,
		   parseInside: parseInside }
