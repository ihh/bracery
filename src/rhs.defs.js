function makeRep (unit, min, max) { return { type: 'rep', unit: unit, min: min, max: max } }
function makeSymbol (name) { return { type: 'sym', name: name.toLowerCase() } }
function makeLookup (name) { return { type: 'lookup', varname: name } }
function makeAssign (name, value) { return { type: 'assign', varname: name, value: value } }
function makeLocalAssign (name, value, scope) { return { type: 'assign', varname: name, value: value, local: scope } }
function makeAlternation (opts) { return { type: 'alt', opts: opts } }
function makeFunction (name, args) { return { type: 'func', funcname: name, args: args } }
function makeConditional (testArg, trueArg, falseArg) { return { type: 'cond', test: testArg, t: trueArg, f: falseArg } }

function makeLocalAssignChain (assigns, scope) {
  var list = assigns.slice(0).reverse().reduce (function (chain, assign) {
    return [makeLocalAssign (assign.varname, assign.value, chain)]
  }, scope)
  return list[0]
}

function makeCapped (args) { return makeFunction ('cap', args) }
function makeUpperCase (args) { return makeFunction ('uc', args) }

function sugarize (name, makeNode) {
  var node = makeNode (name)
  if (name.match(/^[0-9_]*[A-Z].*[a-z]/))
    return makeCapped ([node])
  else if (name.match(/[A-Z]/) && !name.match(/[a-z]/))
    return makeUpperCase ([node])
  return node
}

function makeSugaredSymbol (name) {
  return sugarize (name, makeSymbol)
}

function makeSugaredLookup (name) {
  return sugarize (name, makeLookup)
}

function makeTraceryExpr (sym, mods) {
  return mods.reduce (function (expr, mod) {
    return makeFunction (mod, [expr])
  }, makeConditional ([makeLookup(sym)], [makeFunction('eval',[makeLookup(sym)])], [makeSymbol(sym)]))
}
