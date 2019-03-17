function makeRep (unit, min, max) { return { type: 'rep', unit: unit, min: min, max: max } }
function makeSymbolMethod (name, method, args) { return { type: 'sym', name: name.toLowerCase(), method: method, bind: args } }
function makeLookup (name) { return { type: 'lookup', varname: name } }
function makeAssign (name, value, visible) { return { type: 'assign', varname: name, value: value, visible: visible } }
function makeLocalAssign (name, value, scope) { return { type: 'assign', varname: name, value: value, local: scope } }
function makeAlternation (opts) { return { type: 'alt', opts: opts } }
function makeConditional (testArg, trueArg, falseArg) { return { type: 'cond', test: testArg, t: trueArg, f: falseArg } }
function makeFunction (name, args) { return { type: 'func', funcname: funcAlias[name] || name, args: args } }

var funcAlias = { q: 'quotify' }

function wrapNodes (args) { return args.length === 1 ? args[0] : makeRoot (args) }
function makeRoot (args) { return { type: 'root', rhs: args } }

function makeValue (args) { return makeFunction ('value', args) }
function makeQuote (args) { return makeFunction ('quote', args) }
function makeStrictQuote (args) { return makeFunction ('strictquote', args) }

function makeListFunction (func, listvar, list, inner) { return makeFunction (func, [makeLocalAssign (listvar, list, inner)]) }
function makeReduceFunction (varname, list, result, init, func) { return makeListFunction ('reduce', varname, list, [makeLocalAssign (result, init, func)]) }
function makeRegexFunction (func, pattern, text, expr) { return makeFunction (func, [wrapNodes(pattern.body), wrapNodes(pattern.flags), wrapNodes(text)].concat (expr || [])) }

function makeDefineFunction (args, inner) {
  return makeQuote ([makeLocalAssignChain (args.map (function (arg, n) { return makeAssign (arg, [makeLookup (makeGroupVarName (n + 1))]) }), inner)])
}

function makeModify (name, func, val) { return makeAssign (name, [makeFunction (func, [makeLookup (name), wrapNodes (val)])]) }
function makeModifyConcat (name, suffix) { return makeAssign (name, [makeLookup (name)].concat (suffix)) }

function makeArgList (args) {
  return args && args.length ? [makeFunction ('list', args.map (wrapNodes))] : undefined
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
	  ? makeFunction ('link', [text, makeQuote ([makeSymbol (symName)])])
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

function makeProbExpr (probArg, trueArg, falseArg) {
  return makeConditional ([makeFunction ('lt',
                                         [makeFunction ('random', ['1']),
                                          wrapNodes (probArg)])],
                          trueArg,
                          falseArg)
}

function validRange (min, max) {
  return min <= max
}

function makeMeter (icon, expr, status) {
  return makeFunction ('push', [makeStrictQuote ([makeLookup ('meters')]),
                                wrapNodes (makeArgList ([makeArgList ([icon,
                                                                       [makeStrictQuote ([makeFunction ('math', [expr])])]]
                                                                      .concat (status ? [status] : []))]))])
}

function makeRotate (arg) {
  return makeFunction ('append', [makeFunction ('notfirst', arg),
                                  makeFunction ('first', arg)])
}

function makeCycle (v, list, bump) {
  var vLookup = v[0].args, varname = v[0].args[0].varname
  return makeFunction ('eval',
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
                                                            true)])])
}

function makeQueue (v, list) {
  var vLookup = v[0].args, varname = v[0].args[0].varname
  return makeFunction ('eval',
                       [makeConditional ([makeFunction ('islist',
                                                        wrapNodes ([vLookup]))],
                                         [],
                                         [makeAssign (varname, list)]),
                        makeFunction ('shift', v)])
}

/*
&imp{num}{expr}{template}
=>
&let$samples={}$weights=
&map&iota{num}{
&push$samples{&eval$template}
&eval$expr
}{
&nth{&sample$weights}$samples
}
*/
function makeImportanceSampler (num, expr, template) {
  return makeLocalAssignChain
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
                   makeLookup ('samples')])])
}
