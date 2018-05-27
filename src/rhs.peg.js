RHS
  = OuterNodeList

Node
  = "\\n" { return "\n" }
  / "\\t" { return "\t" }
  / "\\" escaped:. { return escaped }
  / text:[^\$\#&\^\{\}\[\]\|\\]+ { return text.join("") }
  / Repetition
  / Symbol
  / Conditional
  / LocalAssignment
  / PushOrPop
  / Strip
  / Function
  / VarAssignment
  / VarLookup
  / Alternation
  / char:[\$\#&\^] { return char }

NodeList
  = head:Node tail:NodeList {
      return typeof(head) === 'string' && tail.length && typeof(tail[0]) === 'string'
     	? [head + tail[0]].concat(tail.slice(1))
        : [head].concat(tail)
    }
  / head:Node { return [head] }
  / "" { return [] }

OuterNode
  = Node
  / char:. { return char }

OuterNodeList
  = head:OuterNode tail:OuterNodeList {
      return typeof(head) === 'string' && tail.length && typeof(tail[0]) === 'string'
     	? [head + tail[0]].concat(tail.slice(1))
        : [head].concat(tail)
    }
  / head:OuterNode { return [head] }
  / "" { return [] }

Symbol
  = "$" sym:Identifier { return makeSugaredSymbol (sym) }
  / "${" _ sym:Identifier _ "}" { return makeSugaredSymbol (sym) }
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

PushOrPop
  = "&" func:("push" / "pop" / "shift" / "unshift") arg:VarLookup { return makeFunction (func, [arg]) }
  / "&" func:("push" / "pop" / "shift" / "unshift") "{" _ args:VarLookupList _ "}" { return makeFunction (func, args) }

VarLookupList
  = head:VarLookup _ tail:VarLookupList { return [head].concat(tail) }
  / head:VarLookup { return [head] }

Strip
  = "&strip" strip:FunctionArg source:FunctionArg { return makeFunction ('strip', [wrapNodes (strip), wrapNodes (source)]) }

Function
  = "&" func:FunctionName args:FunctionArg { return makeFunction (func, args) }

FunctionName = "eval" / "quote" / "plural" / "singular" / "nlp_plural" / "topic" / "person" / "place" / "past" / "present" / "future" / "infinitive"
  / "gerund" / "adjective" / "negative" / "positive" / "a" / "uc" / "lc" / "cap"

FunctionArg
  = rep:Repetition { return [rep] }
  / Unit

Unit
  = sym:Symbol { return [sym] }
  / cond:Conditional { return [cond] }
  / local:LocalAssignment { return [local] }
  / pushpop:PushOrPop { return [pushpop] }
  / strip:Strip { return [strip] }
  / func:Function { return [func] }
  / assign:VarAssignment { return [assign] }
  / lookup:VarLookup { return [lookup] }
  / alt:Alternation { return [alt] }
  / args:DelimitedNodeList { return args }

DelimitedNodeList
  = "{" args:NodeList "}" { return args }

Repetition
  = "&rep" unit:Unit "{" min:Number "," max:Number "}" { return validRange (min, max) ? makeRep (unit, min, max) : text() }
  / "&rep" unit:Unit "{" min:Number "}" { return makeRep (unit, min, min) }

Number
  = num:[0-9]+ { return parseInt (num.join('')) }

VarLookup
  = "^" varname:Identifier { return makeSugaredLookup (varname) }
  / "^{" _ varname:Identifier _ "}" { return makeSugaredLookup (varname) }

VarAssignment
  = "^" varname:Identifier "=" args:FunctionArg { return makeAssign (varname, args) }
  / "[" varname:Identifier ":" args:NodeList "]" { return makeAssign (varname, args) }
  / "[" varname:Identifier "=>" opts:AltList "]" { return makeAssign (varname, [makeFunction ('quote', opts.length === 1 ? opts[0] : [makeAlternation (opts)])]) }

VarAssignmentList
  = head:VarAssignment _ tail:VarAssignmentList { return [head].concat(tail) }
  / head:VarAssignment { return [head] }

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
