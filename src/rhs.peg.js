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
  / args:DummyBrackets { return wrapNodes (args) }
  / char:[\~\#&\$] { return char }

NodeList
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
  / "&prob" probArg:FunctionArg trueArg:FunctionArg falseArg:FunctionArg
{ return makeConditional ([makeFunction ('lt', [makeFunction ('random', ['1']), wrapNodes (probArg)])], trueArg, falseArg) }

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
  / LinkFunction
  / ParseFunction
  / ListConstructor
  / ShortUnaryFunction  /* this goes last because it includes the one-letter function "a", which otherwise causes the PEG parser to miss all other function names beginning with "a" */

SymbolFunction
  = sym:PrefixedSymIdentifier { return makeSugaredSymbol (sym, makeArgList ([])) }
  / sym:CallSymbol args:ArgList { return makeSugaredSymbol (sym, makeArgList (args)) }
  / sym:ApplySymbol args:FunctionArg { return makeSugaredSymbol (sym, args) }
  / "#" sym:Identifier mods:TraceryModifiers "#" { return makeTraceryExpr (sym, mods) }
  / sym:GetSymbol { return makeGetSymbol (sym) }
  / sym:SetSymbol args:FunctionArg { return makeSetSymbol (sym, args) }

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
  / "{" sym:PrefixedSymIdentifier "}" { return sym }
  / "{" sym:Identifier "}" { return sym }

PrefixedSymIdentifier
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

MapFunction
  = "&" name:MapFunctionName varname:MapVarIdentifier list:FunctionArg func:QuotedFunctionArg { return makeListFunction (name, varname, list, func) }
  / "&" name:MapFunctionName list:FunctionArg func:QuotedFunctionArg { return makeListFunction (name, defaultListVarName, list, func) }
  / "&" name:DefaultableMapFunctionName list:FunctionArg { return makeListFunction (name, defaultListVarName, list, [makeQuote ([makeLookup (defaultListVarName)])]) }
  / "&reduce" varname:MapVarIdentifier list:FunctionArg result:VarIdentifier ("=" / "") init:FunctionArg func:QuotedFunctionArg { return makeReduceFunction (varname, list, result, init, func) }

MapFunctionName = "map" / DefaultableMapFunctionName
DefaultableMapFunctionName = "filter" / "numsort" / "lexsort"

MapVarIdentifier
  = name:VarIdentifier (":" / "") { return name }
  / "{" name:VarIdentifier "}" { return name }

RegexFunction
  = "&" name:BinaryRegexFunctionName pattern:RegularExpressionLiteral text:FunctionArg expr:QuotedFunctionArg { return makeRegexFunction (name, pattern, text, expr) }
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

MathFunction
  = "&math{" _ math:MathExpr _ "}" { return makeFunction ('math', [math]) }
  / "&math{}" { return makeFunction ('math', []) }

LinkFunction
  = "&link" type:FunctionArg text:FunctionArg link:FunctionArg { return makeFunction ('link', [wrapNodes(type), wrapNodes(text), makeQuote(link)]) }

ParseFunction
  = "&parse" grammar:QuotedFunctionArg text:FunctionArg { return makeFunction ('parse', [wrapNodes(grammar), wrapNodes(text)]) }
  / "&grammar" grammar:QuotedFunctionArg { return makeFunction ('grammar', grammar) }

ListConstructor
  = "&{" args:NodeList "}" { return makeFunction ('list', args) }

BinaryFunctionName
  = "add" / "subtract" / "multiply" / "divide"
  / "gt" / "geq" / "lt" / "leq"
  / "eq" / "neq"
  / "min" / "max"
  / "same"
  / "and"
  / "cat" / "prepend" / "append" / "join"
  / "apply" / "xapply"

UnaryFunctionName
  = "eval" / "syntax" / "tree" / "jparse"
  / "escape" / "quotify" / StrictQuote / Quote / Unquote
  / "random" / "floor" / "ceil" / "round" / "abs"
  / "wordnum" / "dignum" / "ordinal" / "cardinal"
  / "plural" / "singular" / "nlp_plural" / "topic" / "person" / "place" / "past" / "present" / "future" / "infinitive"
  / "json" / "parsejson"
  / "list" / "value" / "islist" / "first" / "last" / "notfirst" / "notlast"
  / "strlen" / "length" / "shuffle" / "reverse" / "revstr"
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
  = func:FunctionArg { return [makeStrictQuote (func)] }

VarFunctionArg
  = lookup:PlainVarLookup { return [makeStrictQuote ([lookup])] }
  / "{" lookup:PlainVarLookup "}" { return [makeStrictQuote ([lookup])] }

FunctionArg
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
  = "&set$" varname:Identifier args:FunctionArg _ { return makeAssign (varname, args) }
  / "&set{" ("$" / "") varname:Identifier "}" _ args:FunctionArg { return makeAssign (varname, args) }
  / "[" varname:Identifier ":" args:NodeList "]" _ { return makeAssign (varname, args) }
  / "[" varname:Identifier "=>" opts:AltList "]" _ { return makeAssign (varname, [makeQuote (opts.length === 1 ? opts[0] : [makeAlternation (opts)])]) }
  / "$" varname:Identifier "=" target:VarAssignmentTarget _ { return makeAssign (varname, target) }
  / "$" varname:Identifier ":=" target:VarAssignmentTarget { return makeAssign (varname, target, true) }

VarAssignmentTarget
  = FunctionArg
  / chars:[^ \t\n\r\=\~\#&\$\{\}\[\]\|\\]+ _ { return [chars.join("")] }

VarLookup
  = "$$" num:Number { return makeLookup (makeGroupVarName (num)) }
  / "$${" num:Number "}" { return makeLookup (makeGroupVarName (num)) }
  / varname:VarIdentifier { return makeSugaredLookup (varname) }

PlainVarLookup
  = varname:VarIdentifier { return makeLookup (varname) }

VarIdentifier
  = "$" varname:Identifier { return varname }
  / "${" _ varname:Identifier _ "}" { return varname }

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

// Atoms
Text = chars:[^\~\#&\$\{\}\[\]\|\\]+ { return chars.join("") }

Number
  = num:[0-9]+ { return parseInt (num.join('')) }

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
  = n:Number { return n.toString() }
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
