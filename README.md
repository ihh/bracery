# Bracery

Bracery is a small procedural text generation language (and library)
blending elements of [Tracery](http://tracery.io/) by @galaxykate and [regular expression](https://en.wikipedia.org/wiki/Regular_expression) syntax.

# Usage

Basic Tracery (an example from @galaxykate's [online tutorial](http://www.crystalcodepalace.com/traceryTut.html))
~~~~
var bracery = require('bracery')

var b = new bracery.Bracery
({"name": ["Arjun","Yuuma","Darcy","Mia","Chiaki","Izzi","Azra","Lina"],
  "animal": ["unicorn","raven","sparrow","scorpion","coyote","eagle","owl","lizard","zebra","duck","kitten"],
  "mood": ["vexed","indignant","impassioned","wistful","astute","courteous"],
  "story": ["#hero# traveled with her pet #heroPet#.  #hero# was never #mood#, for the #heroPet# was always too #mood#."],
  "origin": ["#[hero:#name#][heroPet:#animal#]story#"]})

console.log (b.expand().text)
~~~~

See [tests](test/) for more examples

# Syntax

Language features include

- named nonterminals: Tracery-style `#symbol_name#`, or Bracery-style `$symbol_name` or `${symbol_name}` (the latter is useful if you want to follow it with an alphanumeric or underscore)
- alternations (anonymous nonterminals), which can be nested: `[option1|option 2|3rd opt|4th|more [options|nested options]...]`
- variables: Tracery-style `[variable_name:value]` or `^variable_name={value}` to assign, `^variable_name` or `^{variable_name}` to retrieve (names are case-insensitive)
   - the Tracery-style syntax `#variable_name#` can also be used to access the variable, but it also does a dynamic evaluation; see below
- built-in text-processing functions:
   - `&plural{...}` (plural), `&a{...}` ("a" or "an")
   - `&cap{...}` (Capitalize), `&lc{...}` and `&uc{...}` (lower- & UPPER-case)
   - selected natural language-processing functions from [compromise](https://github.com/spencermountain/compromise) including (for nouns) `&singular` and `&topic`, and (for verbs) `&past`, `&present`, `&future`, `&infinitive`,  `&adjective`, `&negative`
- special functions:
   - conditionals: `&if{testExpr}{trueExpr}{falseExpr}` evaluates to `trueExpr` if `testExpr` contains any non-whitespace characters, and `falseExpr` otherwise
   - dynamic evaluation: `&eval{expr}` parses `expr` as Bracery and dynamically expands it. Conversely, `&quote{expr}` returns `expr` as a text string, without doing any expansions. So `&eval{&quote{expr}}` is the same as `expr` (with a subtle side effect: there is a limit on the number of dynamic evaluations that an expression can use, to guard against infinite recursion or hammering the server)
   - local scoped variables: `&let^x={value1}^y={value2}{something involving x and y}` or the Tracery-style `#[x:value1][y:value2]symbol_name#` (what Tracery calls "actions"; other cool effects can be achieved with `&eval` and `&quote`, use sparingly)
- functions, alternations, variable assignments, and conditionals can be arbitrarily nested
- syntactic sugar/hacks
   - the Tracery-style expression `#name#` is actually shorthand for `&if{^name}{&eval{^name}}{$name}`. Tracery overloads the same namespace for symbol and variable names, and uses the variable if it's defined; this reproduces that behavior (almost; it won't be quite the same if `^name` is set to whitespace or the empty string)
   - braces can be omitted in many situations where context is obvious, e.g. `^currency=&cap&plural$name` means the same as `^currency={&cap{&plural{$name}}}`
   - as a shorthand, you can use `$Nonterminal_name` as a shorthand for `&cap{$nonterminal_name}`, and `^Variable_name` for `&cap{^variable_name}`
   - similarly, `$NONTERMINAL_NAME` is a shorthand for `&uc{$nonterminal_name}`, and  `^VARIABLE_NAME` for `&uc{^variable_name}`
   - as well as the Tracery syntax for nonterminals, i.e. `#symbol_name#` instead of `$symbol_name`, you can optionally use the Tracery modifier syntax, e.g. `#symbol_name.capitalize#` instead of `&cap{$symbol_name}`
