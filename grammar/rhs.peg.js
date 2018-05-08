RHS
  = OuterNodeList

Node
  = "\\n" { return "\n" }
  / "\\t" { return "\t" }
  / "\\" escaped:. { return escaped }
  / text:[^\$\#&\^\{\}\[\]\|\\]+ { return text.join("") }
  / Symbol
  / Conditional
  / LocalAssignment
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
  = "&let" assigns:VarAssignmentList scope:FunctionArg { return makeLocalAssignChain (assigns, scope) }
  / "#" assigns:VarAssignmentList sym:Identifier mods:TraceryModifiers "#" { return makeLocalAssignChain (assigns, [makeTraceryExpr (sym, mods)]) }

Function
  = "&" func:FunctionName args:FunctionArg { return makeFunction (func, args) }

FunctionName = "eval" / "quote" / "uc" / "lc" / "cap" / "plural" / "singular" / "a" / "nlp_plural" / "topic" / "person" / "place" / "past" / "present" / "future" / "infinitive" / "gerund" / "adjective" / "negative" / "positive"

FunctionArg
  = "{" args:NodeList "}" { return args }
  / sym:Symbol { return [sym] }
  / alt:Alternation { return [alt] }
  / lookup:VarLookup { return [lookup] }
  / innerFunc:Function { return [innerFunc] }

VarLookup
  = "^" varname:Identifier { return makeSugaredLookup (varname) }
  / "^{" _ varname:Identifier _ "}" { return makeSugaredLookup (varname) }

VarAssignment
  = "^" varname:Identifier "=" args:FunctionArg { return makeAssign (varname, args) }
  / "[" varname:Identifier ":" args:NodeList "]" { return makeAssign (varname, args) }

VarAssignmentList
  = head:VarAssignment tail:VarAssignmentList { return [head].concat(tail) }
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
