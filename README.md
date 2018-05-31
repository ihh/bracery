[![License](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Build Status](https://travis-ci.org/ihh/bracery.svg?branch=master)](https://travis-ci.org/ihh/bracery)
[![Coverage Status](https://coveralls.io/repos/github/ihh/bracery/badge.svg?branch=master)](https://coveralls.io/github/ihh/bracery?branch=master)

# Bracery

Bracery is a small procedural text generation language (and library).
It's heavily influenced by [Tracery](http://tracery.io/) (by [@galaxykate](https://github.com/galaxykate)),
and while they are not officially related, Bracery deliberately uses some Tracery-like syntax:

- `[name:value]` sets the value of a variable called `name`
- `#name#` dynamically expands a variable called `name`
- `#[x:value]name#` locally binds variable `x` to `value` while expanding `#name#`

Like [ChoiceScript](https://www.choiceofgames.com/make-your-own-games/choicescript-intro/),
[Tracery](http://tracery.io/),
Twine's [Harlowe](https://twine2.neocities.org/) format,
and other programming languages for interactive fiction,
anything in a Bracery program that isn't code is implicitly output.
So, for example, the Bracery program to generate the text "hello world" is just `hello world`, which is a [quine](https://en.wikipedia.org/wiki/Quine_(computing)).

Bracery includes elements of other languages and libraries:

- the concept of _alternations_ is borrowed from [regular expressions](https://en.wikipedia.org/wiki/Regular_expression)
- many natural language processing functions are provided by the [compromise](https://github.com/spencermountain/compromise) library
- the core language is otherwise modeled on [Scheme](https://en.wikipedia.org/wiki/Scheme_(programming_language)), including lists, dynamic evaluation, etc.

See [below](#syntax) for details.

# Usage

## Web usage

### An example

The following Bracery code generates lines like
`how goes it with thee, magician of Middle Earth`
and `well met now, magus of the world`

~~~~
[greetings=>[hello|well met] [now|there]|how [goes|fares] it with [you|thee]]
[wizard=>wizard|witch|mage|magus|magician|sorcerer|enchanter]
[earthsea=>earthsea|Earth|Middle Earth|the planet|the world]
#greetings#, #wizard# of #earthsea#
~~~~

Here is that example as a [web demo](http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/no_defs.html) ([source](web/no_defs.html)).

### Another example

Here is another example, taken from Kate Compton's [online tutorial](http://www.crystalcodepalace.com/traceryTut.html) to Tracery:

~~~~
[name=>Arjun|Yuuma|Darcy|Mia|Chiaki|Izzi|Azra|Lina]
[animal=>unicorn|raven|sparrow|scorpion|coyote|eagle|owl|lizard|zebra|duck|kitten]
[mood=>vexed|indignant|impassioned|wistful|astute|courteous]
[story=>#hero# traveled with her pet #heroPet#.  #hero# was never #mood#, for the #heroPet# was always too #mood#.]
[origin=>#[hero:#name#][heroPet:#animal#]story#]
#origin#
~~~~

Here's the [web demo](http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/travel.html) ([source](web/travel.html))
for Kate's example, which generates lines like the following:

~~~~
Darcy traveled with her pet kitten.  Darcy was never wistful, for the kitten was always too astute.
~~~~

### Alternate formats

There are several other ways you can specify these kinds of template
(including, that is, the overall structure of the sentence, along with the various options for `greetings`, `wizard`, and `earthsea`).

For example, you can use Tracery-style JSON:

~~~~
{"name": ["Arjun","Yuuma","Darcy","Mia","Chiaki","Izzi","Azra","Lina"],
"animal": ["unicorn","raven","sparrow","scorpion","coyote","eagle","owl","lizard","zebra","duck","kitten"],
"mood": ["vexed","indignant","impassioned","wistful","astute","courteous"],
"story": ["#hero# traveled with her pet #heroPet#.  #hero# was never #mood#, for the #heroPet# was always too #mood#."],
"origin": ["#[hero:#name#][heroPet:#animal#]story#"]}
~~~~

Here is a [web demo](http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/index.html) ([source](web/index.html))
using the JSON symbol definitions.
These can also be [found](examples/travel.json), along with other examples from Kate's online tutorial,
in the [examples](examples/) directory of this repository.

## Command-line usage

Give Bracery some text to expand:

~~~~
bracery -e '[hello|hi] [world|planet]!'
~~~~

Or specify a definitions file and play with command-line options.
(The first `curl` line just fetches the above-referenced tutorial example file, [travel.json](examples/travel.json).)

~~~~
curl -O https://raw.githubusercontent.com/ihh/bracery/master/examples/travel.json

bracery -d travel.json
bracery -d travel.json -n5
bracery -d travel.json -n5 --eval '$origin And then they met $name.'
bracery -d travel.json -n5 --eval '$origin And they had [fun|trouble|no luck], until they met $name.'
bracery -d travel.json --tree
bracery -d travel.json --repl
bracery -d travel.json -n5 --async
~~~~

(The square-bracket and pipe characters `[hello|hi]` are part of the syntax extensions to Tracery, described [below](#syntax-extensions).
This syntax allows the compact specification of alternate possibilities, in this case `hello` or `hi`.)

You can run it in client/server mode (NB this is a very light implementation, mostly just a toy example to demonstrate networked symbol expansion):

~~~~
bracery -d travel.json -S 8000 &
bracery -C http://localhost:8000/ -e '#origin#'
~~~~

To get a list of available options (there aren't many)

~~~~
bracery --help
~~~~

## From NodeJS

Same example from @galaxykate's [online tutorial](http://www.crystalcodepalace.com/traceryTut.html)

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

The `expand()` method tries to guess the starting nonterminal, but you can override this, or add other stuff like variable bindings, e.g.

~~~~
console.log (b.expand('#origin#',{vars:{name:'Berenice'}}))
console.log (b.expand('#origin# And then they met #name#.'))
~~~~
and so on.

### Dynamic bindings

When using the node API, symbols can be bound to JavaScript functions that return strings:

~~~~
var bracery = require('../bracery')

var b = new bracery.Bracery
  ({"percentage": function (config) { return Math.round (config.random() * 100) + ' percent' }})

console.log (b.expand('I [love|hate|like] you $percentage!').text)
~~~~

They can also, if a `callback` is specified,
be bound to functions that return [promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) of strings:

~~~~
var bracery = require('../bracery')

var b = new bracery.Bracery ({ percentage: function (config) {
  return new Promise (function (resolve, reject) {
    setTimeout (function() {
      resolve (Math.round (config.random() * 100) + ' percent')
    }, 1000)
  })
}})

console.log ('Calculating...')
b.expand ('I [love|hate|like] you $percentage!',
          { callback: function (expansion) { console.log (expansion.text) } })
~~~~

# Technical details

Bracery defines three separate namespaces, distinguished by the prefix character.
You can ignore these and just use the Tracery syntax `#name#` if you want, but for a deeper understanding of what's going on:

- `^name` refers to a variable
- `&name` refers to a core library function or macro
- `$name` refers to a user extension (local or remote)

## Comparison with Tracery

In Tracery, variables and symbols share the same namespace, as part of the design.
For example, `#sentence#` is the syntax to expand the nonterminal symbol `sentence`,
and it is also the syntax for retrieving and expanding the value of the variable named `sentence`.
If the variable has been specified in the local context of the running program (i.e. the text up to that point),
then that specified value overrides the original nonterminal symbol definition (if there was one).

Bracery keeps faith with this aspect of Tracery's design, expanding `#sentence#` the same way as Tracery does, with locally-specified variables overriding globally-specified symbol definitions.
However, Bracery also has syntax allowing programmers to access the local variable's value directly (as `^sentence`) or expand the original global nonterminal (as `$sentence`).
It also introduces dynamic evaluation and conditional primitives, which are required to connect the above elements (`#sentence#`, `$sentence` and `^sentence`),
but are also quite powerful in their own right.

## Syntax extensions

Bracery has a number of extensions from Tracery syntax, and also a mapping for many Tracery expressions into an alternate form that, often, involves the use of curly braces.

### Distinction between symbols and variables

As well as the flanking hash-character notation that Tracery uses for symbol expansions from the grammar, `#symbol#`,
Bracery allows the dollar character prefix, `$symbol`.
The Bracery variant carries the additional, specific nuance that you want to use the original symbol definitions file (or other authority) to expand the symbol,
as opposed to any subsequently defined variables.

Thus, if `b` is the Bracery object with the example grammar defined in the [NodeJS](#from-nodejs) section above,
then `b.expand('[name:PERRY] #name# ').text` will always give the result `  PERRY  `,
but `b.expand('[name:PERRY] $name ').text` will give `  Arjun  `, or `  Yuuma  `, or `  Darcy  ` and so on,
according to the example grammar.

If you just want the variable value, you can use the caret character prefix, `^name`, which will evaluate to the empty string if the variable has not been defined.
So, `b.expand('[name:PERRY] ^name ').text`. will always be `  PERRY  `, again,
but `b.expand('^name').text` will be the empty string.

### Regex-like shorthands for procedural grammars

Bracery also allows other ways of generating repetitive, regex-like grammars, such as alternations

~~~~
console.log (b.expand ('[hello|hallo|hullo]').text)
~~~~

which should give `hello`, `hallo` or `hullo`, and repetitions

~~~~
console.log (b.expand ('&rep{hello }{3,5}').text)
~~~~

which should yield from three to five `hello`'s, with a space after each.

See [tests](test/) for more examples using the JavaScript API.

### Built-in functions

Bracery also offers a number of built-in functions for processing text
(e.g. case, tense, plurals) and lists.
These are described under [Syntax](#syntax).

## Rationale

Bracery works just fine as a synchronous library, running from a local symbol definitions file, like Tracery (this is the default when running from the command-line, or using the node API).
However, Bracery was specifically designed to work well for asynchronous applications where the client is decoupled from the symbol definition store.

In asynchronous mode, the symbol expansion code can run on a server somewhere remote from the client
(i.e. the place where procedural text generation is happening, such as the user's web browser).
This means that, for example, the set of definitions can potentially be very big (including a "standard library"), or can be continually updated, or collaboratively edited.

In order to allow programmers to write efficient code in this framework,
Bracery's syntax distinguishes between expansions that can be performed on the client, from those that must be performed by the server.
The former (client expansions) are called _variables_ and the latter (server expansions) are called _symbols_.

# Syntax

The formal grammar for Bracery is in [src/rhs.peg.js](src/rhs.peg.js) (specified using [PegJS](https://pegjs.org/))

Language features include

- named nonterminals:
   - Tracery-style `#symbol_name#`
   - Bracery-style `$symbol_name` or `${symbol_name}`
   - subtle difference: the Tracery style allows the symbol definition to be overridden by a local variable
- alternations (anonymous nonterminals):
   - `[option1|option 2|Option number three|Some other option...]`
   - can be nested: `[option1|option 2|3rd opt|4th|more [options|nested options]...]`
- variables:
   - Tracery-style
      - `[variable_name:value]` to assign
      - `#variable_name#` to retrieve and expand (names are case-insensitive)
   - Bracery-style
      - `^variable_name={value}` to assign
      - `^variable_name` or `^{variable_name}` to retrieve (without expanding)
   - the Tracery-style syntax `#variable_name#` evaluates the variable dynamically, if defined
- built-in text-processing functions:
   - `&plural{...}` (plural), `&a{...}` ("a" or "an")
   - `&cap{...}` (Capitalize), `&lc{...}` and `&uc{...}` (lower- & UPPER-case)
   - selected natural language-processing functions from [compromise](https://github.com/spencermountain/compromise) including
      - (for nouns) `&singular` and `&topic`
      - (for verbs) `&past`, `&present`, `&future`, `&infinitive`,  `&adjective`, `&negative`
   - natural language-friendly arithmetic using compromise:
      - `&add{2}{4}` gives `6`
      - `&add{two}{4}` gives `six`, `&add{two cats}{4}` gives `six cats`
         - form of result is determined by first argument, so `&add{4}{two}` and `&add{4}{two cats}` both evaluate to `6`
      - `&subtract{x}{y}` behaves like `&add`
      - `&multiply{x}{y}`, `&divide{x}{y}` return digits only: `&multiply{ten cats}{two dogs}` is `20`
      - `&ordinal{3}` is `3rd`, `&cardinal{3rd}` is `3`
      - `&dignum{3}` is `3`, `&wordnum{three}` is `three`
      - `&random{n}`, `&floor{x}`, `&ceil{x}`, `&round{x}` do what you probably expect
      - `&eq{x}{y}`, `&neq{x}{y}`, `&gt{x}{y}`, `&geq{x}{y}`, `&lt{x}{y}`, `&leq{x}{y}` also fairly predictable
   - remove substrings: `&strip{ac}{abacus}` evaluates to `abus`, `&strip{gh}{lightweight}` to `litweit`, etc.
- special functions:
   - conditionals:
      - `&if{testExpr}then{trueExpr}else{falseExpr}`
      - Evaluates to `trueExpr` if `testExpr` contains any non-whitespace characters, and `falseExpr` otherwise.
      - The `then` and `else` keywords are optional; you can write `&if{testExpr}{trueExpr}{falseExpr}`
      - The conditional test (`testExpr`) can use arithmetic operators `&eq`, `&neq`, `&gt`, `&lt`, `&geq`, `&leq`
         - also comparison `&same{x}{y}` and boolean operators `&and{x}{y}`, `&not{x}`
   - dynamic evaluation
      - `&eval{expr}` parses `expr` as Bracery and dynamically expands it
         - conversely, `&quote{expr}` returns `expr` as a text string, without doing any expansions
         - `&quote{...}`, `&unquote{...}`, `&strictquote{...}` work pretty much like quasiquote/unquote/quote in Scheme
      - `&eval{&quote{expr}}` is the same as `expr`, although...
         - there is a configurable limit on the number of dynamic evaluations that an expression can use, to guard against infinite recursion or hammering the server
      - `&quotify{expr}` wraps with `&quote` and `&list`
   - locally scoped variables:
      - Tracery-style `#[x:value1][y:value2]symbol_name#` (what Tracery calls "actions")
      - Bracery-style `&let^x={value1}^y={value2}{something involving x and y}`
   - repetition:
      - `&rep{x}{3}` expands to `xxx`
      - `&rep{x}{3,5}` expands to `xxx`, `xxxx`, or `xxxxx`
- lists:
   - `&list{...}` creates an explicit nested list context, vs the default concatenation context
      - `&{}` is the empty list, equivalent to `&list{}`
      - beginning a concatenation context with `&{}` (or any other list) makes it a list context
      - beginning a concatenation context with a string, or wrapping it in `&string{...}` makes it a string context
   - `&islist{x}` returns true if, and only if, `x` is a list
   - list-coercing functions:
      - `&prepend{item}{list}`, `&append{list}{item}` return lists
      - `&first{list}`, `&last{list}` return individual list items (can be strings or nested lists)
      - `&notfirst{list}`, `&notlast{list}` return lists
      - `&cat{list1}{list2}` returns a list
      - `&join{list}{item}` returns a string
      - `&map^varname:{list}{expr}` and `&filter^varname:{list}{expr}` return lists
      - `&reduce^varname:{list}^result={init}{expr}` can return list or string
   - when coerced into a list context by one of the above functions, the empty string becomes the empty list and any nonempty string becomes a single-element list
   - when coerced into a string context (i.e. most contexts), a list is invisibly joined/flattened as if by `&join{list}{}`
- functions, alternations, repetitions, variable assignments, and conditionals can be arbitrarily nested
- everything can occur asynchronously, so symbols can be resolved and expanded from a remote store
   - but if you have a synchronously resolvable store (i.e. a local Tracery object), everything can work synchronously too
- syntactic sugar/hacks/apologies
   - the Tracery-style expression `#name#` is parsed and implemented as `&if{^name}then{&eval{^name}}else{$name}`. Tracery overloads the same namespace for symbol and variable names, and uses the variable if it's defined; this quasi-macro reproduces that behavior (almost)
   - braces around single-argument functions or symbols can be omitted, e.g. `^currency=&cap&plural$name` means the same as `^currency={&cap{&plural{$name}}}`
   - variable and symbol names are case-insensitive
      - the case used when a variable is referenced can be a shorthand for capitalization: you can use `$Nonterminal_name` as a shorthand for `&cap{$nonterminal_name}`, and `^Variable_name` for `&cap{^variable_name}`
      - similarly, `$NONTERMINAL_NAME` is a shorthand for `&uc{$nonterminal_name}`, and  `^VARIABLE_NAME` for `&uc{^variable_name}`
   - some Tracery modifier syntax works, e.g. `#symbol_name.capitalize#` instead of `&cap{#symbol_name#}`
   - the syntax `[name=>value1|value2|value3|...]` is shorthand for `^name={&quote{[value1|value2|value3|...]}` and ensures that every occurrence of `#name#` (or `&eval{^name}`) will be expanded from an independently-sampled one of the values
      - note that a similar effect could be achieved with a Tracery symbol file of the form `{"name":["value1","value2","value3",...]}`; this would ensure that every occurrence of `$name` would be expanded, as well as `#name#`

Most/all of these features are exercised in the file [test/basic.js](test/basic.js).

## Plain text symbol definitions

Like Tracery, Bracery allows you to specify symbol definitions in JSON.
However, for convenience, Bracery also allows an (optional) plaintext format for symbol definitions. This lets you avoid typing so much distracting punctuation.

In the plaintext format, a symbol definition block begins with a greater-than symbol `>`, followed by the name of the symbol, then the end of the line.
Each subsequent line represents an alternate definition for that symbol. The block is terminated by a blank line.

For example, the following consists of two blocks:

~~~~
>body_part
head
leg
arm
foot
nose

>sentence
"Hey! Look at my #body_part#!"
My #body_part# feels [funny|odd|great].
The #body_part#-bone's connected to the #body_part#-bone.
~~~~

This is exactly equivalent to the following JSON definitions file.
Note how much less punctuation is needed for the plaintext version,
especially for the first expansion of `sentence` where JSON requires that the quotation marks be backslash-escaped:

~~~~
{
  "body_part": [
    "head",
    "leg",
    "arm",
    "foot",
    "nose"
  ],
  "sentence": [
    "\"Hey! Look at my #body_part#!\"",
    "My #body_part# feels [funny|odd|great].",
    "The #body_part#-bone's connected to the #body_part#-bone."
  ]
}
~~~~

Backslash-escaping works in the plaintext format, too; so you can use `\n` if you need a newline within a definition line.

The file [examples/travel.txt](examples/travel.txt) contains the `#hero# traveled with...` example in this plaintext format
([examples/travel.json](examples/travel.json) contains the same definitions in JSON).

## Import scripts

The [import/](#import/) directory contains scripts to import various word and phrase sets,
notably from Darius Kazemi's [corpora](https://github.com/dariusk/corpora).
Type `cd import; make` to run.

# Braceplate message sequences

Braceplates _(Bracery message templates)_ are a lightweight scheme for sequencing a series of Bracery messages in a Markov chain,
allowing for limited contextual continuity between successive messages.

The idea is that each template has a set of _past-tags_ and a set of _future-tags_.
Tags are arbitrary strings, excluding spaces.
Matches between tags determine the connectivity of the Markov chain.

The past and future-tags are interpreted as follows:
- For template B to be considered as a possible successor (i.e. reply) to a message generated from template A, at least one of A's future-tags must also be one of B's past-tags
- If any of A's future-tags appear in B's past-tags with an exclamation point in front (e.g. A has future-tag `tag` and B has past-tag `!tag`), then B is disallowed as a successor to A (these tags are referred to as B's _excluded-past-tags_)
- The special past-tag `root` is used to denote _root templates_ that can be used at the top of a thread (or the past-tags can be left empty for the same effect)

Each Bracery message template has the following fields:
- the _past-tags_
- the _future-tags_
- the _title_
- the Bracery _source text_ that is used to generate individual messages from this template
- (optional) the name of the _sender_ (or, more generally, a user or NPC associated with the message)
- (optional, defaults to 1) the integer _weight_ of the template (used by the recommendation engine)

An individual Braceplate _message_, generated from one of the above templates, exists in the context of a _thread_ of messages.
The first message in the thread must be generated from a root template, as described above.
Successive messages are generated by matching tags between consecutive templates.

Each message has the following fields:
- an associated template
- an _expansion tree_ that is a parse tree generated from the Bracery grammar defined by the template's source text
- a set of _future-tags_ which by default are the same as the template's future-tags, but can be overridden by the `^tags` variable, if that variable is assigned a value in the expansion tree
- (if not the first message in the thread) a _predecessor_ message, with appropriate overlap between the predecessor's future-tags and the template's past-tags

The root node of the expansion tree "inherits" any variable assignments from the predecessor,
with two special variables overridden as follows:
- the `tags` variable, at the beginning of the expansion, is set to the template's future-tags (joined by whitespace into a single string)
- the `prevtags` variable, at the beginning of the expansion, is set to the predecessor message's future-tags (joined by whitespace into a single string)
The value of the `tags` variable by the end of the expansion is used to find the message's future-tags (it is considered to be a whitespace-separated list).
Thus, the template's default future-tags can be "overridden" by variable assignments from the Bracery source text.

## Braceplate syntax

Templates can be specified in JSON or in the following plaintext shorthand

~~~~
100@template_author>Template title#past_tag1 past_tag2#future_tag1 future_tag2 future_tag3
The template itself, featuring $nonterminals, [alternations|etc.]
(it can be split over multiple lines)
~~~~

This defines a template with weight `100` by `@template_author`, with the title "Template title", and the specified past tags (`past_tag1` and `past_tag2`) and future tags (`future_tag1`, `future_tag2`, and `future_tag3`). 
The weight (`100`), author (`@template_author`), and past/future tags (everything from `#` onwards) can be omitted.

For an example, see [examples/markov/good_news_bad_news.txt](examples/markov/good_news_bad_news.txt).

## Using braceplates

### Web simulation

[Bracery message template demo](http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/markov.html) (source in [web/markov.html](web/markov.html))

### Command line simulation

You can test template sequencing from the command line using bracery's `-m` option
(short for `--markov`, because it samples a trajectory through the Markov chain).
Make sure to also load any required symbol definitions.
For example:

~~~~
bracery -m examples/markov/good_news_bad_news.txt
~~~~

Or for an interactive experience that allows you to keep re-randomizing the next message in the thread until you're happy with it,
use bracery with the `-q` option (short for `--quiz`) instead of `-m`:

~~~~
bracery -q examples/markov/good_news_bad_news.txt
~~~~

### Visualization

You can also use the `templates2dot.js` script to get a visualization of the Markov chain as a GraphViz dot file
(the `-o` option will create and open the PDF automatically, but only on a Mac with GraphViz installed)

~~~~
bin/templates2dot.js -o examples/markov/good_news_bad_news.txt
~~~~
 