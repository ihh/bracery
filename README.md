[![Build Status](https://travis-ci.org/ihh/bracery.svg?branch=master)](https://travis-ci.org/ihh/bracery)
[![License](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)

# Bracery

Bracery is a small procedural text generation language (and library)
that may be viewed as a [dialect](https://en.wikipedia.org/wiki/Programming_language#Dialects,_flavors_and_implementations)
of [Tracery](http://tracery.io/) (by [@galaxykate](https://github.com/galaxykate)),
with influences from [regular expression](https://en.wikipedia.org/wiki/Regular_expression) syntax and 
[Scheme](https://en.wikipedia.org/wiki/Scheme_(programming_language)).

Bracery is specialized for asynchronous, distributed settings e.g. where the Tracery client is decoupled from the symbol definition store.
Expansion of Bracery expressions occurs using promises, which may e.g. involve calls to web services.
However, it also works just fine as a synchronous library, like Tracery (this is the default when running from the command-line, or using the main API).

# Usage

## From NodeJS

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

You should see an output like

~~~~
Lina traveled with her pet owl.  Lina was never wistful, for the owl was always too courteous.
~~~~

See [tests](test/) for more examples using the JavaScript API

## From the command line

Trying various command line settings with the same symbol defintions file, [examples/travel.json](examples/travel.json) (`#hero# traveled with her pet...`):

~~~~
bin/bracery -d examples/travel.json
bin/bracery -d examples/travel.json -n5
bin/bracery -d examples/travel.json -n5 --eval '$origin And then they met $name.'
bin/bracery -d examples/travel.json -n5 --eval '$origin And they had [fun|trouble|no luck], until they met $name.'
bin/bracery -d examples/travel.json --tree
bin/bracery -d examples/travel.json --repl
bin/bracery -d examples/travel.json -n5 --async
~~~~

To get a list of available options (there aren't many)

~~~~
bin/bracery --help
~~~~

See [examples](examples/) for more examples from the Tracery [online tutorial](http://www.crystalcodepalace.com/traceryTut.html)

## In the browser

[Basic demo](http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/browser/index.html) (source in [browser/](browser/))

# Syntax

The formal grammar for Bracery is in [src/rhs.peg.js](src/rhs.peg.js) (specified using [PegJS](https://pegjs.org/))

Language features include

- named nonterminals: Tracery-style `#symbol_name#`, or Bracery-style `$symbol_name` or `${symbol_name}`
   - subtle difference: the Tracery style allows the symbol definition to be overridden by a local variable
- alternations (anonymous nonterminals), which can be nested: `[option1|option 2|3rd opt|4th|more [options|nested options]...]`
- variables:
   - Tracery-style `[variable_name:value]` to assign, `#variable_name#` to retrieve and evaluate (names are case-insensitive)
   - Bracery-style `^variable_name={value}` to assign, `^variable_name` or `^{variable_name}` to retrieve
   - the Tracery-style syntax `#variable_name#` evaluates the variable dynamically, if defined
- built-in text-processing functions:
   - `&plural{...}` (plural), `&a{...}` ("a" or "an")
   - `&cap{...}` (Capitalize), `&lc{...}` and `&uc{...}` (lower- & UPPER-case)
   - selected natural language-processing functions from [compromise](https://github.com/spencermountain/compromise) including (for nouns) `&singular` and `&topic`, and (for verbs) `&past`, `&present`, `&future`, `&infinitive`,  `&adjective`, `&negative`
- special functions:
   - conditionals: `&if{testExpr}then{trueExpr}else{falseExpr}` evaluates to `trueExpr` if `testExpr` contains any non-whitespace characters, and `falseExpr` otherwise. The `then` and `else` keywords are optional; you can write `&if{testExpr}{trueExpr}{falseExpr}`
   - dynamic evaluation: `&eval{expr}` parses `expr` as Bracery and dynamically expands it. Conversely, `&quote{expr}` returns `expr` as a text string, without doing any expansions. So `&eval{&quote{expr}}` is the same as `expr` (with a subtle side effect: there is a limit on the number of dynamic evaluations that an expression can use, to guard against infinite recursion or hammering the server)
   - local scoped variables: `&let^x={value1}^y={value2}{something involving x and y}` or the Tracery-style `#[x:value1][y:value2]symbol_name#` (what Tracery calls "actions"; other cool effects can be achieved with `&eval` and `&quote`, use sparingly)
- functions, alternations, variable assignments, and conditionals can be arbitrarily nested
- everything can occur asynchronously, so symbols can be resolved and expanded from a remote store
   - but if you have a synchronously resolvable store (i.e. a local Tracery object), everything can work synchronously too
- syntactic sugar/hacks
   - the Tracery-style expression `#name#` is actually shorthand for `&if{^name}then{&eval{^name}}else{$name}`. Tracery overloads the same namespace for symbol and variable names, and uses the variable if it's defined; this reproduces that behavior (almost; it won't be quite the same if `^name` is set to whitespace or the empty string)
   - braces can be omitted in many situations where context is obvious, e.g. `^currency=&cap&plural$name` means the same as `^currency={&cap{&plural{$name}}}`
   - as a shorthand, you can use `$Nonterminal_name` as a shorthand for `&cap{$nonterminal_name}`, and `^Variable_name` for `&cap{^variable_name}`
   - similarly, `$NONTERMINAL_NAME` is a shorthand for `&uc{$nonterminal_name}`, and  `^VARIABLE_NAME` for `&uc{^variable_name}`
   - some Tracery modifier syntax works, e.g. `#symbol_name.capitalize#` instead of `&cap{#symbol_name#}`
