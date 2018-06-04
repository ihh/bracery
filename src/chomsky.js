var ParseTree = require('./ParseTree')

function makeChomskyNormalCFG (bracery, vars, rhs) {
  if (!rhs) {
    rhs = vars
    vars = {}
  }
  var cfg = {}
  var start = makeChomskyNormalSymbol (bracery, vars, cfg, [typeof(rhs) === 'string' ? ParseTree.parseRhs(rhs) : rhs])
  return start ? { cfg: cfg, start: start.name } : null
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

module.exports = { makeChomskyNormalCFG: makeChomskyNormalCFG }
