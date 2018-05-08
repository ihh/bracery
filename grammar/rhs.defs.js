function makeSymbol (name) { return { type: 'sym', name: name.toLowerCase() } }
function makeLookup (name) { return { type: 'lookup', varname: name } }
function makeAssign (name, value) { return { type: 'assign', varname: name, value: value } }
function makeAlternation (opts) { return { type: 'alt', opts: opts } }
function makeFunction (name, args) { return { type: 'func', funcname: name, args: args } }
function makeConditional (testArg, trueArg, falseArg) { return { type: 'cond', test: testArg, t: trueArg, f: falseArg } }

function makeCapped (args) { return makeFunction ('cap', args) }
function makeUpperCase (args) { return makeFunction ('uc', args) }

function sugarize (name, makeNode) {
  var node = makeNode (name)
  if (name.match(/^[0-9_]*[A-Z].*[a-z]/))
    return makeCapped ([node])
  if (name.match(/[A-Z]/) && !name.match(/[a-z]/))
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
