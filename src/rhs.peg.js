RHS
  = OuterNodeList

Node
  = "\\n" { return "\n" }
  / "\\t" { return "\t" }
  / "\\" escaped:. { return escaped }
  / text:[^\~\#&\$\{\}\[\]\|\\]+ { return text.join("") }
  / Symbol
  / LocalAssignment
  / Repetition
  / Conditional
  / Function
  / VarAssignment
  / VarLookup
  / Alternation
  / args:DummyAlternation { return wrapNodes (args) }
  / List
  / char:[\~\#&\$] { return char }

NodeList
  = head:Node tail:NodeList { return concatNodes (head, tail) }
  / head:Node { return [head] }
  / "" { return [] }

OuterNode
  = Node
  / char:. { return char }

OuterNodeList
  = head:OuterNode tail:OuterNodeList { return concatNodes (head, tail) }
  / head:OuterNode { return [head] }
  / "" { return [] }

Symbol
  = "~" sym:Identifier { return makeSugaredSymbol (sym) }
  / "~{" _ sym:Identifier _ "}" { return makeSugaredSymbol (sym) }
  / "#" sym:Identifier mods:TraceryModifiers "#" { return makeTraceryExpr (sym, mods) }

TraceryModifiers
  = mod:TraceryModifier mods:TraceryModifiers { return [mod].concat (mods) }
  / "" { return [] }

TraceryModifier
  = ".capitalizeAll" { return "uc" }
  / ".capitalize" { return "cap" }
  / ".a" { return "a" }
  / ".ed" { return "past" }
  / ".s" { return "plural" }

Conditional
  = "&if" testArg:FunctionArg ("then" / "") trueArg:FunctionArg ("else" / "")  falseArg:FunctionArg { return makeConditional (testArg, trueArg, falseArg) }

LocalAssignment
  = "&let" _ assigns:VarAssignmentList _ scope:FunctionArg { return makeLocalAssignChain (assigns, scope) }
  / "#" _ assigns:VarAssignmentList _ sym:Identifier mods:TraceryModifiers "#" { return makeLocalAssignChain (assigns, [makeTraceryExpr (sym, mods)]) }

Function
  = MapFunction
  / RegexFunction
  / BinaryFunction
  / UnaryFunction
  / BinaryVarFunction
  / UnaryVarFunction

MapFunction
  = "&map$" varname:Identifier (":" / "") list:FunctionArg func:QuotedFunctionArg { return makeListFunction ('map', varname, list, func) }
  / "&filter$" varname:Identifier (":" / "") list:FunctionArg func:QuotedFunctionArg { return makeListFunction ('filter', varname, list, func) }
  / "&reduce$" varname:Identifier (":" / "") list:FunctionArg "$" result:Identifier ("=" / "") init:FunctionArg func:QuotedFunctionArg { return makeReduceFunction (varname, list, result, init, func) }

RegexFunction
  = "&match" pattern:RegularExpressionLiteral text:FunctionArg expr:QuotedFunctionArg { return makeRegexFunction ('match', pattern, text, expr) }
  / "&replace" pattern:RegularExpressionLiteral text:FunctionArg expr:QuotedFunctionArg { return makeRegexFunction ('replace', pattern, text, expr) }
  / "&split" pattern:RegularExpressionLiteral text:FunctionArg { return makeRegexFunction ('split', pattern, text) }

RegexUnquote
  = "&unquote" args:FunctionArg { return makeFunction ('unquote', args) }

BinaryFunction
  = "&" func:BinaryFunctionName left:FunctionArg right:FunctionArg { return makeFunction (func, [wrapNodes (left), wrapNodes (right)]) }

UnaryFunction
  = "&" func:UnaryFunctionName args:FunctionArg { return makeFunction (func, args) }

BinaryVarFunction
  = "&" func:VoidBinaryVarFunctionName v:VarFunctionArg right:FunctionArg _ { return makeFunction (func, [wrapNodes (v), wrapNodes (right)]) }

UnaryVarFunction
  = "&" func:UnaryVarFunctionName v:VarFunctionArg { return makeFunction (func, v) }
  / "&" func:VoidUnaryVarFunctionName v:VarFunctionArg _ { return makeFunction (func, v) }

BinaryFunctionName = "strip"
  / "add" / "subtract" / "multiply" / "divide"
  / "gt" / "geq" / "lt" / "leq"
  / "eq" / "neq"
  / "same"
  / "and"
  / "cat" / "prepend" / "append" / "join"

UnaryFunctionName = "eval" / "escape" / StrictQuote / Quote / Unquote
  / "plural" / "singular" / "nlp_plural" / "topic" / "person" / "place" / "past" / "present" / "future" / "infinitive"
  / "gerund" / "adjective" / "negative" / "positive" / "a" / "uc" / "lc" / "cap"
  / "random" / "floor" / "ceil" / "round" / "wordnum" / "dignum" / "ordinal" / "cardinal"
  / "list" / "quotify" / "value" / "json" / "islist" / "first" / "last" / "notfirst" / "notlast"
  / "not"

VoidBinaryVarFunctionName = "push" / "unshift"
UnaryVarFunctionName = "shift" / "pop"
VoidUnaryVarFunctionName = "inc" / "dec"

StrictQuote = ("strictquote" / "'") { return 'strictquote' }
Quote = ("quote" / "`") { return 'quote' }
Unquote = ("unquote" / ",") { return 'unquote' }

QuotedFunctionArg
  = func:FunctionArg { return [makeStrictQuote (func)] }

VarFunctionArg
  = lookup:PlainVarLookup { return [makeStrictQuote ([lookup])] }
  / "{" lookup:PlainVarLookup "}" { return [makeStrictQuote ([lookup])] }

FunctionArg
  = sym:Symbol { return [sym] }
  / loc:LocalAssignment { return [loc] }
  / rep:Repetition { return [rep] }
  / cond:Conditional { return [cond] }
  / func:Function { return [func] }
  / assign:VarAssignment { return [assign] }
  / lookup:VarLookup { return [lookup] }
  / alt:Alternation { return [alt] }
  / args:DelimitedNodeList { return args }

DummyAlternation
  = "[" args:NodeList "]" { return concatReduce (['['].concat(args).concat(']')) }

DelimitedNodeList
  = "{" args:NodeList "}" { return args }

List
  = "{" args:NodeList "}" { return makeFunction ('list', args) }

Repetition
  = "&rep" unit:FunctionArg "{" min:Number "," max:Number "}" { return validRange (min, max) ? makeRep (unit, min, max) : text() }
  / "&rep" unit:FunctionArg "{" min:Number "}" { return makeRep (unit, min, min) }

Number
  = num:[0-9]+ { return parseInt (num.join('')) }

VarLookup
  = "$$" num:Number { return makeLookup (makeGroupVarName (num)) }
  / varname:VarIdentifier { return makeSugaredLookup (varname) }

PlainVarLookup
  = varname:VarIdentifier { return makeLookup (varname) }

VarIdentifier
  = "$" varname:Identifier { return varname }
  / "${" _ varname:Identifier _ "}" { return varname }

VarAssignmentList
  = head:VarAssignment _ tail:VarAssignmentList { return [head].concat(tail) }
  / head:VarAssignment { return [head] }

VarAssignment
  = "&set$" varname:Identifier args:FunctionArg { return makeAssign (varname, args) }
  / "&set{" ("$" / "") varname:Identifier "}" args:FunctionArg { return makeAssign (varname, args) }
  / "[" varname:Identifier ":" args:NodeList "]" { return makeAssign (varname, args) }
  / "[" varname:Identifier "=>" opts:AltList "]" _ { return makeAssign (varname, [makeFunction ('quote', opts.length === 1 ? opts[0] : [makeAlternation (opts)])]) }
  / "$" varname:Identifier "=" target:VarAssignmentTarget { return makeAssign (varname, target) }
  / "$" varname:Identifier ":=" target:VarAssignmentTarget { return makeAssign (varname, target, true) }

VarAssignmentTarget
  = FunctionArg
  / chars:[^ \t\n\r\=\~\#&\$\{\}\[\]\|\\]+ _ { return [chars.join("")] }

Alternation
  = "{" head:NodeList "|" tail:AltList "}" { return makeAlternation ([head].concat(tail)) }
  / "[" head:NodeList "|" tail:AltList "]" { return makeAlternation ([head].concat(tail)) }

AltList
  = head:NodeList "|" tail:AltList { return [head].concat(tail) }
  / head:NodeList { return [head] }

CappedIdentifier
  = firstChar:[A-Z] mid:[A-Za-z_0-9]* lc:[a-z] rest:[A-Za-z_0-9]* { return firstChar + mid.join("") + lc + rest.join("") }

UpperCaseIdentifier
  = firstChar:[A-Z] rest:[A-Z_0-9]* { return firstChar + rest.join("") }

Identifier
  = firstChar:[A-Za-z_] rest:[A-Za-z_0-9]* { return firstChar + rest.join("") }

_ "whitespace"
  = [ \t\n\r]*


// Regular expression PegJS grammar via https://gist.github.com/deedubs/1392590
// modified to return arrays, allowing &unquote{...}
RegularExpressionLiteral
  = "/" body:RegularExpressionBody "/" flags:RegularExpressionFlags { return { body: body, flags: flags } }

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
