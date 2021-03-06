RHS
  = OuterNodeList

Node
  = "\\n" { return "\n" }
  / "\\t" { return "\t" }
  / "\\" escaped:. { return escaped }
  / Text
  / LocalAssignment
  / Repetition
  / Conditional
  / Function
  / VarAssignment
  / VarLookup
  / Alternation
  / LinkShortcut
  / args:DummyBrackets { return wrapNodes (args) }
  / char:[@\~\#&\$\+\-] { return char }

NodeList
  = nl:RawNodeList { return addLocation(nl) }

RawNodeList
  = "&," tail:NodeList { return concatNodes (makeValue([]), tail) }
  / head:Node "&," tail:NodeList { return concatNodes (makeValue([head]), tail.length ? tail : [makeValue([])]) }
  / head:Node tail:NodeList { return concatNodes (head, tail) }
  / head:Node { return [head] }
  / "" { return [] }

OuterNode
  = Node
  / char:. { return char }

OuterNodeList
  = head:OuterNode tail:OuterNodeList { return concatNodes (head, tail) }
  / head:OuterNode { return [head] }
  / "" { return [] }

LocalAssignment
  = "&let" _ assigns:VarAssignmentList _ scope:FunctionArg { return makeLocalAssignChain (assigns, scope) }
  / "#" _ assigns:VarAssignmentList _ sym:Identifier mods:TraceryModifiers "#" { return makeLocalAssignChain (assigns, [makeTraceryExpr (sym, mods)]) }

Repetition
  = "&rep" unit:FunctionArg "{" min:Number "," max:Number "}" { return validRange (min, max) ? makeRep (unit, min, max) : text() }
  / "&rep" unit:FunctionArg "{" min:Number "}" { return makeRep (unit, min, min) }

Conditional
  = "&if" testArg:FunctionArg ("then" / "") trueArg:FunctionArg ("else" / "") falseArg:FunctionArg { return makeConditional (testArg, trueArg, falseArg) }
  / "&if" testArg:FunctionArg ("then" / "") trueArg:FunctionArg { return makeConditional (testArg, trueArg, []) }
  / "&prob" probArg:FunctionArg trueArg:FunctionArg falseArg:FunctionArg { return makeProbExpr (probArg, trueArg, falseArg) }

Function
  = SymbolFunction
  / BinaryVarFunction
  / UnaryVarFunction
  / BinaryFunction
  / UnaryFunction
  / NullaryFunction
  / MapFunction
  / RegexFunction
  / CallFunction
  / DefineFunction
  / MathFunction
  / MeterFunction
  / ScheduleFunction
  / ImportanceSamplingFunction
  / LinkFunction
  / LayoutFunction
  / ParseFunction
  / ListConstructor
  / ShortUnaryFunction  /* this goes last because it includes the one-letter function "a", which otherwise causes the PEG parser to miss all other function names beginning with "a" */

SymbolFunction
  = PlainSymbol
  / sym:CallSymbol args:ArgList { return makeSugaredSymbol (sym, makeArgList (args)) }
  / sym:ApplySymbol args:FunctionArg { return makeSugaredSymbol (sym, args) }
  / "#" sym:LocatedIdentifier mods:TraceryModifiers "#" { return makeTraceryExpr (sym, mods) }
  / sym:GetSymbol { return makeGetSymbol (sym) }
  / sym:SetSymbol args:FunctionArg { return makeSetSymbol (sym, args) }

PlainSymbol
  = sym:PrefixedSymIdentifier { return makeSugaredSymbol (sym, makeArgList ([])) }

CallSymbol
  = "&xcall" sym:SymIdentifier { return sym }
  / "&" sym:PrefixedSymIdentifier { return sym }

ApplySymbol
  = "&xapply" sym:SymIdentifier { return sym }

GetSymbol
  = "&xget" sym:SymIdentifier { return sym }

SetSymbol
  = "&xset" sym:SymIdentifier { return sym }

SymIdentifier
  = PrefixedSymIdentifier
  / "{" sym:PrefixedSymIdentifier "}" { return addLocation (sym) }
  / "{" sym:OwnedNamedSymID "}" { return addLocation (sym) }

PrefixedSymIdentifier
  = "~" sym:OwnedNamedSymID { return addLocation (sym) }
  / "~{" _ sym:OwnedNamedSymID _ "}" { return addLocation (sym) }

NamedSymID
  = name:LocatedIdentifier { return addLocation ({ name: name }, 'sympos') }

OwnedNamedSymID
  = user:LocatedIdentifier "/" name:LocatedIdentifier { return addLocation ({ user: user, name: name }, 'sympos') }
  / NamedSymID

TraceryModifiers
  = mod:TraceryModifier mods:TraceryModifiers { return [mod].concat (mods) }
  / "" { return [] }

TraceryModifier
  = ".capitalizeAll" { return "uc" }
  / ".capitalize" { return "cap" }
  / ".a" { return "a" }
  / ".ed" { return "past" }
  / ".s" { return "plural" }

MapFunction
  = "&" name:MapFunctionName varname:MapVarIdentifier list:FunctionArg func:StrictQuotedFunctionArg { return makeListFunction (name, varname, list, func) }
  / "&" name:MapFunctionName list:FunctionArg func:StrictQuotedFunctionArg { return makeListFunction (name, defaultListVarName, list, func) }
  / "&" name:DefaultableMapFunctionName list:FunctionArg { return makeListFunction (name, defaultListVarName, list, [makeQuote ([makeLookup (defaultListVarName)])]) }
  / "&reduce" varname:MapVarIdentifier list:FunctionArg result:VarIdentifier ("=" / "") init:FunctionArg func:StrictQuotedFunctionArg { return makeReduceFunction (varname, list, result, init, func) }

MapFunctionName = "map" / "for" / DefaultableMapFunctionName
DefaultableMapFunctionName = "filter" / "numsort" / "lexsort"

MapVarIdentifier
  = name:VarIdentifier (":" / "") { return name }
  / "{" name:VarIdentifier "}" { return name }

RegexFunction
  = "&" name:BinaryRegexFunctionName pattern:RegularExpressionLiteral text:FunctionArg expr:StrictQuotedFunctionArg { return makeRegexFunction (name, pattern, text, expr) }
  / "&" name:UnaryRegexFunctionName pattern:RegularExpressionLiteral text:FunctionArg { return makeRegexFunction (name, pattern, text) }
  / "&split" text:FunctionArg { return makeRegexFunction ('split', { body: [defaultSplitPattern], flags: [] }, text) }

BinaryRegexFunctionName = "match" / "replace"
UnaryRegexFunctionName = "grep" / "split"

RegexUnquote
  = "&unquote" args:FunctionArg { return makeFunction ('unquote', args) }

CallFunction
  = "&call" expr:FunctionArg args:ArgList { return makeFunction ('call', [wrapNodes (expr), makeFunction ('list', args.map (wrapNodes))]) }
  / "&" lookup:VarLookup args:ArgList { return makeFunction ('call', [lookup, makeFunction ('list', args.map (wrapNodes))]) }

DefineFunction
  = "&function" args:ArgIdentifierList expr:FunctionArg { return makeDefineFunction (args, expr) }
  / "&function" "{" args:ArgIdentifierList "}" expr:FunctionArg { return makeDefineFunction (args, expr) }
  / "&function{}" expr:FunctionArg { return makeDefineFunction ([], expr) }

ArgIdentifierList
  = head:ArgIdentifier ("," / "") tail:ArgIdentifierList { return [head].concat (tail) }
  / head:ArgIdentifier { return [head] }

ArgIdentifier
  = VarIdentifier
  / "{" name:VarIdentifier "}" { return name }

BinaryFunction
  = "&" func:BinaryFunctionName left:FunctionArg right:FunctionArg { return makeFunction (func, [wrapNodes (left), wrapNodes (right)]) }
  / "&join" left:FunctionArg { return makeFunction ('join', [wrapNodes (left), defaultJoinText]) }

UnaryFunction
  = "&" func:UnaryFunctionName args:FunctionArg { return makeFunction (func, args) }
  / "&rotate" arg:FunctionArg _ { return makeRotate (arg) }

ShortUnaryFunction
  = "&" func:ShortUnaryFunctionName args:FunctionArg { return makeFunction (func, args) }

NullaryFunction
  = "&" func:NullaryFunctionName { return makeFunction (func, []) }

BinaryVarFunction
  = "&" func:PushOrUnshift v:VarFunctionArg right:FunctionArg _ { return makeFunction (func, [wrapNodes (v), wrapNodes (right)]) }
  / "&" func:PushOrUnshift right:FunctionArg _ { return makeFunction (func, [makeStrictQuote ([makeLookup (defaultListVarName)]), wrapNodes (right)]) }

UnaryVarFunction
  = "&" func:ShiftOrPop v:VarFunctionArg { return makeFunction (func, v) }
  / "&" func:ShiftOrPop { return makeFunction (func, [makeStrictQuote ([makeLookup (defaultListVarName)])] ) }
  / "&" func:IncOrDec v:VarFunctionArg _ { return makeFunction (func, v) }
  / "++" v:VarFunctionArg { return wrapNodes ([makeFunction ('inc', v)].concat (v[0].args)) }
  / "--" v:VarFunctionArg { return wrapNodes ([makeFunction ('dec', v)].concat (v[0].args)) }
  / v:VarFunctionArg "++" { return wrapNodes (v[0].args.concat ([makeFunction ('inc', v)])) }
  / v:VarFunctionArg "--" { return wrapNodes (v[0].args.concat ([makeFunction ('dec', v)])) }

MeterFunction
  = "&meter" icon:FunctionArg expr:MathExpr status:StrictQuotedFunctionArg _ { return makeMeter (icon, expr, status) }
  / "&meter" icon:FunctionArg expr:MathExpr _ { return makeMeter (icon, expr) }

ScheduleFunction
  = "&cycle" v:VarFunctionArg list:FunctionArg { return makeCycle (v, list, false) }
  / "&playlist" v:VarFunctionArg list:FunctionArg { return makeCycle (v, list, true) }
  / "&queue" v:VarFunctionArg list:FunctionArg { return makeQueue (v, list) }

ImportanceSamplingFunction
  = "&imp{" num:Number "}{" _ expr:MathExpr _ "}" template:StrictQuotedFunctionArg { return makeImportanceSampler (num, expr, template) }
  / "&preserve" arg:FunctionArg { return makePreserve (arg) }
  / "&rhyme{" num:Number "}" a:FunctionArg b:FunctionArg { return makeRhyme (a, b, num) }
  / "&rhyme" a:FunctionArg b:FunctionArg { return makeRhyme (a, b) }

MathFunction
  = "&math{" _ math:MathExpr _ "}" { return makeFunction ('math', [math]) }
  / "&math{}" { return makeFunction ('math', []) }

LinkFunction
  = "&link" text:FunctionArg link:FunctionArg { return makeFunction ('link', [wrapNodes(text), pseudoQuote(link)]) }
  / "&link@" coord:XYCoord text:FunctionArg link:FunctionArg { return makeLayoutNoQuote (coord, makeFunction ('link', [wrapNodes(text), pseudoQuote(link)])) }
  / "&reveal" text:FunctionArg link:FunctionArg { return makeFunction ('reveal', [wrapNodes(text), wrapNodes(link)]) }

LinkShortcut
  = "[[" text:Text "]]" { return makeLinkShortcut (text) }
  / "[" text:NodeList "]@" coord:XYCoord link:DelimitedNodeList { return makeLayoutNoQuote (coord, makeFunction ('link', [wrapNodes(text), pseudoQuote(link)])) }
  / "[" text:NodeList "]" link:DelimitedNodeList { return makeFunction ('link', [wrapNodes(text), pseudoQuote(link)]) }

LayoutFunction
  = "&layout" coord:DelimitedXYCoord arg:FunctionArg { return makeLayoutNoQuote (coord, wrapNodes(arg)) }
  / "&placeholder" arg:PlaceholderArg coord:DelimitedXYCoord _ { return makePlaceholder (arg, coord) }
  / "@" coord:XYCoord arg:PlaceholderArg _ { return makePlaceholder (arg, coord) }

PlaceholderArg
  = r:RawPlaceholderArg { return addLocation(r) }

RawPlaceholderArg
  = v:PlainVarLookup { return [v] }
  / s:PlainSymbol { return [s] }
  / ("{}" / ":START") { return [] }

DelimitedXYCoord
  = "{" coord:XYCoord "}" { return coord }

XYCoord
  = x:SignedNumber comma:"," y:SignedNumber { return x + comma + y }

ParseFunction
  = "&parse" grammar:StrictQuotedFunctionArg text:FunctionArg { return makeFunction ('parse', [wrapNodes(grammar), wrapNodes(text)]) }
  / "&grammar" grammar:StrictQuotedFunctionArg { return makeFunction ('grammar', grammar) }

ListConstructor
  = "&{" args:NodeList "}" { return makeFunction ('list', args) }
  / "&makelist" args:ArgList { return makeFunction ('list', args.map (makeValue)) }
  / "&quotelist" args:ArgList { return makeFunction ('list', args.map (makeStrictQuote)) }

BinaryFunctionName
  = "add" / "subtract" / "multiply" / "divide" / "pow"
  / "gt" / "geq" / "lt" / "leq"
  / "eq" / "neq"
  / "min" / "max"
  / "same"
  / "and" / "or"
  / "cat" / "prepend" / "append" / "join" / "nth" / "indexof"
  / "apply" / "xapply"
  / "assonance"

UnaryFunctionName
  = "eval" / "syntax" / "tree" / "jparse"
  / "escape" / "quotify" / StrictQuote / Quote / Unquote
  / "random" / "floor" / "ceil" / "round" / "abs" / "percent"
  / "wordnum" / "dignum" / "ordinal" / "cardinal"
  / "plural" / "singular" / "nlp_plural" / "topic" / "person" / "place" / "past" / "present" / "future" / "infinitive"
  / "json" / "parsejson"
  / "list" / "value" / "islist" / "first" / "last" / "notfirst" / "notlast" / "iota" / "sample"
  / "strlen" / "length" / "shuffle" / "bump" / "reverse" / "revstr"
  / "not"
  / "comment"
  / "charclass"
  / "alt"
  / "gerund" / "adjective" / "negative" / "positive" / "uc" / "lc" / "cap"

ShortUnaryFunctionName = "a" / "q"

NullaryFunctionName = "vars"

PushOrUnshift = "push" / "unshift"
ShiftOrPop = "shift" / "pop"
IncOrDec = "inc" / "dec"

StrictQuote = ("strictquote" / "'") { return 'strictquote' }
Quote = ("quote" / "`") { return 'quote' }
Unquote = ("unquote" / ",") { return 'unquote' }

QuotedFunctionArg
  = func:FunctionArg { return [makeQuote (func)] }

StrictQuotedFunctionArg
  = func:FunctionArg { return [makeStrictQuote (func)] }

VarFunctionArg
  = lookup:PlainVarLookup { return [makeStrictQuote ([lookup])] }
  / "{" lookup:PlainVarLookup "}" { return [makeStrictQuote ([lookup])] }

FunctionArg
  = a:RawFunctionArg { return addLocation(a) }

RawFunctionArg
  = loc:LocalAssignment { return [loc] }
  / rep:Repetition { return [rep] }
  / cond:Conditional { return [cond] }
  / func:Function { return [func] }
  / assign:VarAssignment { return [assign] }
  / lookup:VarLookup { return [lookup] }
  / alt:Alternation { return [alt] }
  / args:DelimitedNodeList { return args }

DummyBrackets
  = "[" args:NodeList "]" { return concatReduce (['['].concat(args).concat(']')) }
  / "{" args:NodeList "}" { return concatReduce (['{'].concat(args).concat('}')) }

DelimitedNodeList
  = "{" args:NodeList "}" { return args }

ArgList
  = head:DelimitedNodeList tail:ArgList { return [head].concat (tail) }
  / "" { return [] }

VarAssignmentList
  = head:VarAssignment _ tail:VarAssignmentList { return [head].concat(tail) }
  / head:VarAssignment { return [head] }

VarAssignment
  = "&set$" varname:LocatedIdentifier args:FunctionArg _ { return makeAssign (varname, args) }
  / "&set{" ("$" / "") varname:LocatedIdentifier "}" args:FunctionArg { return makeAssign (varname, args) }
  / "[" varname:LocatedIdentifier ":" args:NodeList "]" _ { return makeAssign (varname, args) }
  / "[" varname:LocatedIdentifier "=>" opts:AltList "]" _ { return makeAssign (varname, arrayWithPos (pseudoQuote (makeAltAssignRhs(opts)))) }
  / "[" varname:LocatedIdentifier "@" coord:XYCoord "=>" opts:AltList "]" _ { return makeAssign (varname, arrayWithPos (makeLayout (coord, makeAltAssignRhs(opts)))) }
  / "[" varname:LocatedIdentifier "@(" coord:XYCoord ")=>" opts:AltList "]" _ { return makeAssign (varname, arrayWithPos (makeLayout (coord, makeAltAssignRhs(opts)))) }
  / "$" varname:LocatedIdentifier "=" target:VarAssignmentTarget { return makeAssign (varname, target) }
  / "$" varname:LocatedIdentifier ":=" target:VarAssignmentTarget { return makeAssign (varname, target, true) }
  / "$" varname:LocatedIdentifier "+=" delta:VarAssignmentTarget { return makeModify (varname, 'add', delta) }
  / "$" varname:LocatedIdentifier "-=" delta:VarAssignmentTarget { return makeModify (varname, 'subtract', delta) }
  / "$" varname:LocatedIdentifier "*=" scale:VarAssignmentTarget { return makeModify (varname, 'multiply', scale) }
  / "$" varname:LocatedIdentifier "/=" scale:VarAssignmentTarget { return makeModify (varname, 'divide', scale) }
  / "$" varname:LocatedIdentifier ".=" suffix:VarAssignmentTarget { return makeModifyConcat (varname, suffix) }
  / "&tag" tag:FunctionArg _ { return makeModifyConcat ('tags', [' '].concat (tag)) }
  / "&" varname:VarAssignFunctionName arg:QuotedFunctionArg _ { return makeAssign (varname, arg) }

VarAssignFunctionName = "accept" / "reject" / "status" / "footer"

VarAssignmentTarget
  = DelimitedNodeList
  / func:FunctionArg _ { return func }
  / chars:[^ \t\n\r\=\~\#&\$\{\}\[\]\|\\]+ _ { return [chars.join("")] }

VarLookup
  = "$$" num:Number { return makeLookup (makeGroupVarName (num)) }
  / "$${" num:Number "}" { return makeLookup (makeGroupVarName (num)) }
  / varname:VarIdentifier { return makeSugaredLookup (varname) }

PlainVarLookup
  = varname:VarIdentifier { return makeLookup (varname) }

VarIdentifier
  = "$" varname:LocatedIdentifier { return varname }
  / "${" _ varname:LocatedIdentifier _ "}" { return varname }

Alternation
  = "{" head:NodeList "|" tail:AltList "}" { return makeAlternation ([head].concat(tail)) }
  / "[" head:NodeList "|" tail:AltList "]" { return makeAlternation ([head].concat(tail)) }

AltList
  = head:NodeList "|" tail:AltList { return addLocation ([head].concat(tail)) }
  / head:NodeList { return addLocation ([head]) }

CappedIdentifier
  = firstChar:[A-Z] mid:[A-Za-z_0-9]* lc:[a-z] rest:[A-Za-z_0-9]* { return firstChar + mid.join("") + lc + rest.join("") }

UpperCaseIdentifier
  = firstChar:[A-Z] rest:[A-Z_0-9]* { return firstChar + rest.join("") }

// Atoms
Text = chars:[^\@\~\#&\$\+\-\{\}\[\]\|\\]+ { return chars.join("") }

Number
  = num:[0-9]+ { return parseInt (num.join('')) }

Float
  = left:[0-9]* "." right:[0-9]+ { return parseFloat(left.join("") + "." +   right.join("")) }

SignedNumber
  = ("+" _ / "") n:Number { return n }
  / "-" n:Number { return -n }

LocatedIdentifier
  = id:RawIdentifier { return wrapIdentifier(id) }

Identifier
  = RawIdentifier

RawIdentifier
  = firstChar:[A-Za-z_] rest:[A-Za-z_0-9]* { return firstChar + rest.join("") }

_ "whitespace"
  = [ \t\n\r]*

// Math grammar
// via https://stackoverflow.com/a/30798758
MathExpr
  = AdditiveExpr

AdditiveExpr
  = first:MultiplicativeExpr rest:(_ ("+" / "-") _ MultiplicativeExpr)+ {
    return rest.reduce (function (left, next) {
      var op = next[1], right = next[3]
      return makeFunction (op === '+' ? 'add' : 'subtract', [left, right])
    }, first)
  }
  / MultiplicativeExpr

MultiplicativeExpr
  = first:PrimaryExpr rest:(_ ("*" / "/") _ PrimaryExpr)+ {
    return rest.reduce (function (left, next) {
      var op = next[1], right = next[3]
      return makeFunction (op === '*' ? 'multiply' : 'divide', [left, right])
    }, first)
  }
  / PowerExpr

PowerExpr
  = base:PrimaryExpr _ ("^"/"**") _ exp:PrimaryExpr { return makeFunction ('pow', [base, exp]) }
  / ("e"/"exp") _ ("^"/"**") _ exp:PrimaryExpr { return makeFunction ('pow', [Math.exp(1).toString(), exp]) }
  / "exp" _ "(" _ exp:AdditiveExpr _ ")" _ { return makeFunction ('pow', [Math.exp(1).toString(), exp]) }
  / PrimaryExpr

PrimaryExpr
  = f:Float { return f.toString() }
  / n:Number { return n.toString() }
  / arg:FunctionArg { return wrapNodes (arg) }
  / "(" _ additive:AdditiveExpr _ ")" { return makeFunction ('value', [additive]) }

// Regular expression PegJS grammar
// via https://gist.github.com/deedubs/1392590
// modified to return arrays, allowing &unquote{...}
RegularExpressionLiteral
  = "/" body:RegularExpressionBody "/" flags:RegularExpressionFlags { return { body: body, flags: flags } }
  / "//" flags:RegularExpressionFlags { return { body: [], flags: flags } }

RegularExpressionBody
  = c:RegularExpressionFirstChar chars:RegularExpressionChars { return concatReduce ([c].concat (chars)) }

RegularExpressionChars
  = chars:RegularExpressionChar* { return chars }

RegularExpressionFirstChar
  = RegexUnquote
  / ![*\\/[] c:RegularExpressionNonTerminator { return c }
  / RegularExpressionBackslashSequence
  / RegularExpressionClass

RegularExpressionChar
  = RegexUnquote
  / ![\\/[] c:RegularExpressionNonTerminator { return c }
  / RegularExpressionBackslashSequence
  / RegularExpressionClass

RegularExpressionBackslashSequence
  = "\\" c:RegularExpressionNonTerminator { return "\\" + c }

RegularExpressionNonTerminator
  = !LineTerminator c:SourceCharacter { return c }

RegularExpressionClass
  = "[" chars:RegularExpressionClassChars "]" { return wrapNodes (concatReduce (['['].concat(chars[0] || '').concat(']'))) }

RegularExpressionClassChars
  = chars:RegularExpressionClassChar* { return concatReduce (chars) }

RegularExpressionClassChar
  = ![\]\\] c:RegularExpressionNonTerminator { return c }
  / RegularExpressionBackslashSequence

RegularExpressionFlags
  = parts:[gimuy]* { return parts }

LineTerminator
  = [\n\r\u2028\u2029]

SourceCharacter
  = .
