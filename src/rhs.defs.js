function makeRep (unit, min, max) { return { type: 'rep', unit: unit, min: min, max: max } }
function makeSymbol (name, args) { return { type: 'sym', name: name.toLowerCase(), bind: args } }
function makeLookup (name) { return { type: 'lookup', varname: name } }
function makeAssign (name, value, visible) { return { type: 'assign', varname: name, value: value, visible: visible } }
function makeLocalAssign (name, value, scope) { return { type: 'assign', varname: name, value: value, local: scope } }
function makeAlternation (opts) { return { type: 'alt', opts: opts } }
function makeFunction (name, args) { return { type: 'func', funcname: name, args: args } }
function makeConditional (testArg, trueArg, falseArg) { return { type: 'cond', test: testArg, t: trueArg, f: falseArg } }

function wrapNodes (args) { return args.length === 1 ? args[0] : { type: 'root', rhs: args } }

function makeQuote (args) { return makeFunction ('quote', args) }
function makeStrictQuote (args) { return makeFunction ('strictquote', args) }

function makeListFunction (func, listvar, list, inner) { return makeFunction (func, [makeLocalAssign (listvar, list, inner)]) }
function makeReduceFunction (varname, list, result, init, func) { return makeListFunction ('reduce', varname, list, [makeLocalAssign (result, init, func)]) }
function makeRegexFunction (func, pattern, text, expr) { return makeFunction (func, [wrapNodes(pattern.body), wrapNodes(pattern.flags), wrapNodes(text)].concat (expr || [])) }

function makeDefineFunction (args, inner) {
  return makeQuote ([makeLocalAssignChain (args.map (function (arg, n) { return makeAssign (arg, [makeLookup (makeGroupVarName (n + 1))]) }), inner)])
}

function makeArgList (args) {
  return args && args.length ? [makeFunction ('list', args.map (wrapNodes))] : undefined
}

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

function validRange (min, max) {
  return min <= max
}
