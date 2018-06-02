RHS
  = OuterNodeList

Node
  = "\\n" { return "\n" }
  / "\\t" { return "\t" }
  / "\\" escaped:. { return escaped }
  / "&." text:Text { return makeFunction ('value', [text]) }
  / Text
  / Symbol
  / LocalAssignment
  / Repetition
  / Conditional
  / Function
  / VarAssignment
  / VarLookup
  / Alternation
  / List
  / args:DummyBrackets { return wrapNodes (args) }
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

Text = chars:[^\~\#&\$\{\}\[\]\|\\]+ { return chars.join("") }

Symbol
  = sym:SymIdentifier args:ArgList { return makeSugaredSymbol (sym, makeArgList (args)) }
  / "&" sym:SymIdentifier args:FunctionArg { return makeSugaredSymbol (sym, args) }
  / "#" sym:Identifier mods:TraceryModifiers "#" { return makeTraceryExpr (sym, mods) }

SymIdentifier
  = "~" sym:Identifier { return sym }
  / "~{" _ sym:Identifier _ "}" { return sym }

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
  / CallFunction
  / DefineFunction
  / BinaryFunction
  / UnaryFunction
  / NullaryFunction
  / BinaryVarFunction
  / UnaryVarFunction
  / MathFunction
  / LinkFunction
  / List

MapFunction
  = "&map" varname:MapVarIdentifier list:FunctionArg func:QuotedFunctionArg { return makeListFunction ('map', varname, list, func) }
  / "&filter" varname:MapVarIdentifier list:FunctionArg func:QuotedFunctionArg { return makeListFunction ('filter', varname, list, func) }
  / "&reduce" varname:MapVarIdentifier list:FunctionArg result:VarIdentifier ("=" / "") init:FunctionArg func:QuotedFunctionArg { return makeReduceFunction (varname, list, result, init, func) }

MapVarIdentifier
  = name:VarIdentifier (":" / "") { return name }
  / "{" name:VarIdentifier "}" { return name }
  / "" { return "_" }

RegexFunction
  = "&match" pattern:RegularExpressionLiteral text:FunctionArg expr:QuotedFunctionArg { return makeRegexFunction ('match', pattern, text, expr) }
  / "&replace" pattern:RegularExpressionLiteral text:FunctionArg expr:QuotedFunctionArg { return makeRegexFunction ('replace', pattern, text, expr) }
  / "&split" text:FunctionArg { return makeRegexFunction ('split', { body: ['[ \\t\\r\\n]+'], flags: [] }, text) }
  / "&split" pattern:RegularExpressionLiteral text:FunctionArg { return makeRegexFunction ('split', pattern, text) }

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
  = head:ArgIdentifier tail:ArgIdentifierList { return [head].concat (tail) }
  / head:ArgIdentifier { return [head] }

ArgIdentifier
  = VarIdentifier
  / "{" name:VarIdentifier "}" { return name }

BinaryFunction
  = "&" func:BinaryFunctionName left:FunctionArg right:FunctionArg { return makeFunction (func, [wrapNodes (left), wrapNodes (right)]) }

UnaryFunction
  = "&" func:UnaryFunctionName args:FunctionArg { return makeFunction (func, args) }

NullaryFunction
  = "&" func:NullaryFunctionName { return makeFunction (func, []) }

BinaryVarFunction
  = "&" func:VoidBinaryVarFunctionName v:VarFunctionArg right:FunctionArg _ { return makeFunction (func, [wrapNodes (v), wrapNodes (right)]) }

UnaryVarFunction
  = "&" func:UnaryVarFunctionName v:VarFunctionArg { return makeFunction (func, v) }
  / "&" func:VoidUnaryVarFunctionName v:VarFunctionArg _ { return makeFunction (func, v) }

MathFunction
  = "&math{" _ math:MathExpr _ "}" { return makeFunction ('math', [math]) }
  / "&math{}" { return makeFunction ('math', []) }

LinkFunction
  = "&link" text:FunctionArg link:FunctionArg { return makeFunction ('link', [wrapNodes(text), makeQuote(link)]) }

List
  = "&{" args:NodeList "}" { return makeFunction ('list', args) }

BinaryFunctionName
  = "strip"
  / "add" / "subtract" / "multiply" / "divide"
  / "gt" / "geq" / "lt" / "leq"
  / "eq" / "neq"
  / "same"
  / "and"
  / "cat" / "prepend" / "append" / "join"
  / "apply"

UnaryFunctionName = "eval" / "escape" / StrictQuote / Quote / Unquote
  / "plural" / "singular" / "nlp_plural" / "topic" / "person" / "place" / "past" / "present" / "future" / "infinitive"
  / "gerund" / "adjective" / "negative" / "positive" / "a" / "uc" / "lc" / "cap"
  / "random" / "floor" / "ceil" / "round" / "wordnum" / "dignum" / "ordinal" / "cardinal"
  / "list" / "quotify" / "value" / "json" / "islist" / "first" / "last" / "notfirst" / "notlast"
  / "strlen" / "length"
  / "not"
  / "comment"

NullaryFunctionName = "vars"

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

DummyBrackets
  = "[" args:NodeList "]" { return concatReduce (['['].concat(args).concat(']')) }
  / "{" args:NodeList "}" { return concatReduce (['{'].concat(args).concat('}')) }

DelimitedNodeList
  = "{" args:NodeList "}" { return args }

ArgList
  = head:DelimitedNodeList tail:ArgList { return [head].concat (tail) }
  / "" { return [] }

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
  / "[" varname:Identifier "=>" opts:AltList "]" _ { return makeAssign (varname, [makeQuote (opts.length === 1 ? opts[0] : [makeAlternation (opts)])]) }
  / "$" varname:Identifier "=" target:VarAssignmentTarget _ { return makeAssign (varname, target) }
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
  / PrimaryExpr

PrimaryExpr
  = n:Number { return n }
  / arg:FunctionArg { return wrapNodes (arg) }
  / "(" _ additive:AdditiveExpr _ ")" { return makeFunction ('value', [additive]) }

// Regular expression PegJS grammar
// via https://gist.github.com/deedubs/1392590
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
