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
function makeSymbolMethod (name, method, args) { return makeNode ('sym', { name: name.toLowerCase(), method: method, bind: args }) }
function makeLookup (name) { return makeNode ('lookup', { varname: name }) }
function makeAssign (name, value, visible) { return makeNode ('assign', { varname: name, value: value, visible: visible }) }
function makeLocalAssign (name, value, scope) { return makeNode ('assign', { varname: name, value: value, local: scope }) }
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

function makeSymbol (name, args) { return makeSymbolMethod (name, 'expand', args) }
function makeGetSymbol (name) { return makeSymbolMethod (name, 'get') }
function makeSetSymbol (name, args) { return makeSymbolMethod (name, 'set', args) }

function makeLinkShortcut (text) {
  var symName = text.toLowerCase()
      .replace(/^[^a-z0-9_]*/,'')
      .replace(/[^a-z0-9_]*$/,'')
      .replace(/[^a-z0-9_]+/g,'_')
  return (symName.length
	  ? makeFunction ('link', [text, makeQuote ([makeTraceryExpr (symName, [])])])
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
  return makeFunction ('layout', [coord, pseudoQuote (args)])
}

function makePlaceholder (args, coord) {
  return makeFunction ('placeholder', [pseudoQuote (args), coord])
}
