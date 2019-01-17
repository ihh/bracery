[![License](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Build Status](https://travis-ci.org/ihh/bracery.svg?branch=master)](https://travis-ci.org/ihh/bracery)
[![Coverage Status](https://coveralls.io/repos/github/ihh/bracery/badge.svg?branch=master)](https://coveralls.io/github/ihh/bracery?branch=master)

# Bracery

Bracery is a small language for procedural text generation.
Its purpose is to enable quick and fluid writing of text with random elements,
allowing for user extensions that may include calls to a server (e.g. for synonyms, rhymes, or other functions).

Bracery aims...

- **to keep out of the writer's way,** looking mostly like a markup language and close to plain text;
- **to be easy to work with,** presenting simply whether you're a casual user or an experienced programmer;
- **to avoid plundering the keyboard for syntax,** especially common punctuation, like quotes;
- **to allow real programming,** with variables, functions, and lists, but without forcing the writer to learn (or care) about all that;
- **to be usable offline by default,** but also readily connectable to online generative text servers;
- **to be secure** running random code from the internet, including limits on recursion and network/CPU usage;
- **to be compatible** as much as possible with previous work, especially [@galaxykate](https://github.com/galaxykate)'s [Tracery](http://tracery.io/).

Bracery combines a few different tricks well-known to computational linguistics and adjacent fields, such as
variable manipulation syntax from [Tracery](http://tracery.io/),
alternations from [regular expressions](https://en.wikipedia.org/wiki/Regular_expression),
natural language processing from the [compromise](https://github.com/spencermountain/compromise) library,
parsing algorithms from [bioinformatics](https://en.wikipedia.org/wiki/Bioinformatics),
and lists from [Scheme](https://en.wikipedia.org/wiki/Scheme_(programming_language)).

# Usage

The following Bracery code generates lines like
`how goes it, magician of Middle Earth`
and `well met, magus of the world`

~~~~
[hello|well met|how goes it|greetings], [wizard|witch|mage|magus|magician|sorcerer|enchanter] of [earthsea|Earth|Middle Earth|the planet|the world]
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://vega.biowiki.org/bracery/web/demo.html#%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%2C%20%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%20of%20%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D">Try this</a> </em>

Here's the same example, but using variables to keep track of the choices:

~~~~
$greetings=[hello|well met|how goes it|greetings]
$wizard=[wizard|witch|mage|magus|magician|sorcerer|enchanter]
$earthsea=[earthsea|Earth|Middle Earth|the planet|the world]
$greetings, $wizard of $earthsea
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://vega.biowiki.org/bracery/web/demo.html#%24greetings%3D%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%24wizard%3D%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%24earthsea%3D%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%24greetings%2C%20%24wizard%20of%20%24earthsea">Try this</a> </em>

You can also use variables to store Bracery code itself, for later expansion:

~~~~
$greetings=&quote{[hello|well met|how goes it|greetings]}

$wizard=&quote{[wizard|witch|mage|magus|magician|sorcerer|enchanter]}

$earthsea=&quote{[earthsea|Earth|Middle Earth|the planet|the world]}

&eval{$greetings}, &eval{$wizard} of &eval{$earthsea}
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://vega.biowiki.org/bracery/web/demo.html#%24greetings%3D%26quote%7B%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%7D%0A%0A%24wizard%3D%26quote%7B%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%7D%0A%0A%24earthsea%3D%26quote%7B%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%7D%0A%0A%26eval%7B%24greetings%7D%2C%20%26eval%7B%24wizard%7D%20of%20%26eval%7B%24earthsea%7D">Try this</a> </em>

The above example uses [dynamic evaluation](https://en.wikipedia.org/wiki/Eval).
Here's the same code with some [syntactic sugar](https://en.wikipedia.org/wiki/Syntactic_sugar)
for the way variables are assigned and expanded:

~~~~
[greetings=>hello|well met|how goes it|greetings]
[wizard=>wizard|witch|mage|magus|magician|sorcerer|enchanter]
[earthsea=>earthsea|Earth|Middle Earth|the planet|the world]
#greetings#, #wizard# of #earthsea#
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://vega.biowiki.org/bracery/web/demo.html#%5Bgreetings%3D%3Ehello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%5Bwizard%3D%3Ewizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%5Bearthsea%3D%3Eearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%23greetings%23%2C%20%23wizard%23%20of%20%23earthsea%23">Try this</a> </em>

Programmers may recognize this kind of thing too ([lambdas](https://en.wikipedia.org/wiki/Anonymous_function)):

~~~~
$greetings=[hello|well met|how goes it|greetings]
$wizard=[wizard|witch|mage|magus|magician|sorcerer|enchanter]
$earthsea=[earthsea|Earth|Middle Earth|the planet|the world]

$sentence=&function{$name}{$greetings, $name}

&$sentence{$wizard of $earthsea}
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://vega.biowiki.org/bracery/web/demo.html#%24greetings%3D%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%24wizard%3D%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%24earthsea%3D%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%0A%24sentence%3D%26function%7B%24name%7D%7B%24greetings%2C%20%24name%7D%0A%0A%26%24sentence%7B%24wizard%20of%20%24earthsea%7D">Try this</a> </em>

And maybe this as well ([lists](https://en.wikipedia.org/wiki/List_(abstract_data_type))):

~~~~
$greetings=[hello|well met|how goes it|greetings]
$wizard=[wizard|witch|mage|magus|magician|sorcerer|enchanter]
$earthsea=[earthsea|Earth|Middle Earth|the planet|the world]

$sentence={$greetings, $wizard of $earthsea}

&join{&shuffle{&split{$sentence}}}
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://vega.biowiki.org/bracery/web/demo.html#%24greetings%3D%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%24wizard%3D%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%24earthsea%3D%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%0A%24sentence%3D%7B%24greetings%2C%20%24wizard%20of%20%24earthsea%7D%0A%0A%26join%7B%26shuffle%7B%26split%7B%24sentence%7D%7D%7D">Try this</a> </em>

which gives jumbled-up output like

~~~~
witch the hello, of world
~~~~

Bracery's alternations and variable expansions form a [context-free grammar](https://en.wikipedia.org/wiki/Context-free_grammar),
and Bracery includes a limited parser.
In other words, if you have some text that you think might have been generated by a particular Bracery program,
then you can reconstruct _how_ that program could have generated that output.
This is like running the program backwards! And it only works if the program is very simple (e.g. no functions can be used, nor can variables be modified while the program is running).

Here's an example, using the syntactically ambiguous phrase ["fruit flies like a banana"](https://en.wikipedia.org/wiki/Time_flies_like_an_arrow;_fruit_flies_like_a_banana):

~~~~
[sentence=>[#singular_noun# #singular_verb#|#plural_noun# #plural_verb#] #noun_phrase#]
[noun_phrase=>#noun#|#preposition# #noun#]
[noun=>#plural_noun#|#singular_noun#]
[singular_noun=>fruit|a banana]
[singular_verb=>flies|likes|nears]
[plural_noun=>fruit flies|bananas]
[plural_verb=>fly|like|near]
[preposition=>like|near]
&json&parse#sentence#{fruit flies like a banana}
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://vega.biowiki.org/bracery/web/demo.html#%5Bsentence%3D%3E%5B%23singular_noun%23%20%23singular_verb%23%7C%23plural_noun%23%20%23plural_verb%23%5D%20%23noun_phrase%23%5D%0A%5Bnoun_phrase%3D%3E%23noun%23%7C%23preposition%23%20%23noun%23%5D%0A%5Bnoun%3D%3E%23plural_noun%23%7C%23singular_noun%23%5D%0A%5Bsingular_noun%3D%3Efruit%7Ca%20banana%5D%0A%5Bsingular_verb%3D%3Eflies%7Clikes%7Cnears%5D%0A%5Bplural_noun%3D%3Efruit%20flies%7Cbananas%5D%0A%5Bplural_verb%3D%3Efly%7Clike%7Cnear%5D%0A%5Bpreposition%3D%3Elike%7Cnear%5D%0A%26json%26parse%23sentence%23%7Bfruit%20flies%20like%20a%20banana%7D">Try this</a> </em>

This should output one of two different parses of the phrase.
One parse has "fruit flies" as the noun, and "like" as the verb:

~~~~
[["root",["#sentence#",["alt",["#plural_noun#",["alt","fruit flies"]]," ",["#plural_verb#",["alt","like"]]," ",["#prep_or_noun#",["alt",["#noun#",["alt",["#singular_noun#",["alt","a banana"]]]]]]]]]]
~~~~

The other parse has "fruit" as the noun, "flies" as the verb, and "like" as a preposition:

~~~~
[["root",["#sentence#",["alt",["#singular_noun#",["alt","fruit"]]," ",["#singular_verb#",["alt","flies"]]," ",["#prep_or_noun#",["alt",["#prep#",["alt","like"]]," ",["#noun#",["alt",["#singular_noun#",["alt","a banana"]]]]]]]]]]
~~~~

Bracery's `&parse` function is stochastic: if multiple valid parses exist, it will return a random parse,
sampled proportionally to the probability that it's the correct parse.

Finally, note that you don't need to use any of these programmer-oriented features, if you just want to write generative text.
Just [start typing](http://vega.biowiki.org/bracery/web/demo.html#%24greetings%3D%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%24wizard%3D%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%24earthsea%3D%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%24greetings%2C%20%24wizard%20of%20%24earthsea) and go!

## Web usage

The "wizard of earthsea" example is available as a [web demo](http://vega.biowiki.org/bracery/web/demo.html) ([source](web/demo.html)).

Here's another example, taken from Kate Compton's [online tutorial](http://www.crystalcodepalace.com/traceryTut.html) to Tracery:

~~~~
[name=>Arjun|Yuuma|Darcy|Mia|Chiaki|Izzi|Azra|Lina]
[animal=>unicorn|raven|sparrow|scorpion|coyote|eagle|owl|lizard|zebra|duck|kitten]
[mood=>vexed|indignant|impassioned|wistful|astute|courteous]
[story=>#hero# traveled with her pet #heroPet#.  #hero# was never #mood#, for the #heroPet# was always too #mood#.]
[origin=>#[hero:#name#][heroPet:#animal#]story#]
#origin#
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://vega.biowiki.org/bracery/web/demo.html#%5Bname%3D%3EArjun%7CYuuma%7CDarcy%7CMia%7CChiaki%7CIzzi%7CAzra%7CLina%5D%0A%5Banimal%3D%3Eunicorn%7Craven%7Csparrow%7Cscorpion%7Ccoyote%7Ceagle%7Cowl%7Clizard%7Czebra%7Cduck%7Ckitten%5D%0A%5Bmood%3D%3Evexed%7Cindignant%7Cimpassioned%7Cwistful%7Castute%7Ccourteous%5D%0A%5Bstory%3D%3E%23hero%23%20traveled%20with%20her%20pet%20%23heroPet%23.%20%20%23hero%23%20was%20never%20%23mood%23%2C%20for%20the%20%23heroPet%23%20was%20always%20too%20%23mood%23.%5D%0A%5Borigin%3D%3E%23%5Bhero%3A%23name%23%5D%5BheroPet%3A%23animal%23%5Dstory%23%5D%0A%23origin%23">Try this</a> </em>

This example generates lines like the following:

~~~~
Darcy traveled with her pet kitten.  Darcy was never wistful, for the kitten was always too astute.
~~~~

### Alternate formats

There are several other ways you can specify the definitions.
For example, you can use Tracery-style JSON:

~~~~
{
 "name": ["Arjun","Yuuma","Darcy","Mia","Chiaki","Izzi","Azra","Lina"],
 "animal": ["unicorn","raven","sparrow","scorpion","coyote","eagle","owl","lizard","zebra","duck","kitten"],
 "mood": ["vexed","indignant","impassioned","wistful","astute","courteous"],
 "story": ["#hero# traveled with her pet #heroPet#.  #hero# was never #mood#, for the #heroPet# was always too #mood#."],
 "origin": ["#[hero:#name#][heroPet:#animal#]story#"]
}
~~~~

Here is a [web demo](http://vega.biowiki.org/bracery/web/tracery.html) ([source](web/tracery.html))
using the Tracery-style JSON symbol definitions.
These can also be [found](examples/travel.json), along with other examples from Kate's online tutorial,
in the [examples](examples/) directory of this repository.

## Command-line usage

Give Bracery some text to expand:

~~~~
bracery -e '[hello|hi] [world|planet]!'
~~~~

Or specify a definitions file and play with command-line options.
For example, starting with a Tracery-format file, [travel.json](examples/travel.json),
which you can grab as follows

~~~~
curl -O https://raw.githubusercontent.com/ihh/bracery/master/examples/travel.json
~~~~

Then do a few things with it

~~~~
bracery -d travel.json
bracery -d travel.json -n5
bracery -d travel.json -n5 --eval '#origin# And then they met #name#.'
bracery -d travel.json -n5 --eval '#origin# And they had [fun|trouble|no luck], until they met #name#.'
bracery -d travel.json --tree
bracery -d travel.json --repl
bracery -d travel.json -n5 --async
~~~~

These examples all load the Tracery `travel.json` rules as user extensions, using the `-d` option.
If you specify the `-b` option, the command-line tool will convert and output the Tracery JSON to Bracery code.

You can run the tool in client/server mode (NB this is a very light implementation, mostly just a toy example to demonstrate networked symbol expansion):

~~~~
bracery -d travel.json -S 8000 &
bracery -C http://localhost:8000/ -e '#origin#'
~~~~

To get a list of available options

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

When using the node API, tilde-prefixed symbols like `~name` can be bound to JavaScript functions:

~~~~
var bracery = require('../bracery')

var b = new bracery.Bracery
  ({"percentage": function (config) { return Math.round (config.random() * 100) + ' percent' }})

console.log (b.expand('I [love|hate|like] you ~percentage!').text)
~~~~

If a `callback` is specified,
the functions can return [promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise):

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
b.expand ('I [love|hate|like] you ~percentage!',
          { callback: function (expansion) { console.log (expansion.text) } })
~~~~

# Technical details

## Namespaces

Bracery defines three separate namespaces, distinguished by the prefix character.
You can ignore these and just use the Tracery syntax `#name#` if you want, but for a deeper understanding of what's going on:

- `$name` refers to a variable
- `&name` refers to a core library function or macro
- `~name` refers to a user extension (local or remote)
- `#name#` means "expand variable `$name` if defined, otherwise call user extension `~name`

## Limits on program complexity

Bracery was designed to be run on unfiltered user input.
Since it is capable of general programming, it must also include configurable constraints on the amount of resources a program is allowed to consume,
otherwise a user program could easily send it into an infinite loop or otherwise hog CPU.
Another reason to impose limits is that recursion in Bracery is implemented using recursion in JavaScript, with no [tail call optimization](https://en.wikipedia.org/wiki/Tail_call),
so heavily recursive Bracery code can quickly max out the JavaScript stack.

The main constraints that Bracery enforces are maximum parse tree depth, parse tree node count, recursion depth, and output length.
For the `&parse` function, constraints on the parsed sequence and subsequence lengths are also enforced.

## Comparison with Tracery

In Tracery, variables and symbols share the same namespace, as part of the design.
For example, `#sentence#` is the syntax to expand the nonterminal symbol `sentence`,
and it is also the syntax for retrieving and expanding the value of the variable named `sentence`.
If the variable has been specified in the local context of the running program (i.e. the text up to that point),
then that specified value overrides the original nonterminal symbol definition (if there was one).

Bracery keeps faith with this aspect of Tracery's design, expanding `#sentence#` the same way as Tracery does, with locally-specified variables overriding globally-specified symbol definitions.
However, Bracery also has syntax allowing programmers to access the local variable's value directly (as `$sentence`) or expand the original global nonterminal (as `~sentence`).
It also introduces dynamic evaluation and conditional primitives, which are required to connect the above elements (`#sentence#`, `~sentence` and `$sentence`),
but are also quite powerful in their own right.

### Distinction between symbols and variables

As well as the flanking hash-character notation that Tracery uses for symbol expansions from the grammar, `#symbol#`,
Bracery allows the tilde character prefix, `~symbol`.
The Bracery variant carries the additional, specific nuance that you want to use the original symbol definitions file (or other authority) to expand the symbol,
as opposed to any subsequently defined variables.

Thus, if `b` is the Bracery object with the example grammar defined in the [NodeJS](#from-nodejs) section above,
then `b.expand('[name:PERRY] #name# ').text` will always give the result `  PERRY  `,
but `b.expand('[name:PERRY] ~name ').text` will give `  Arjun  `, or `  Yuuma  `, or `  Darcy  ` and so on,
according to the example grammar.

If you just want the variable value, you can use the dollar character prefix, `$name`, which will evaluate to the empty string if the variable has not been defined.
So, `b.expand('[name:PERRY] $name ').text`. will always be `  PERRY  `, again,
but `b.expand('$name').text` will be the empty string.

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

### Rationale

Bracery works just fine as a synchronous library, running from a local symbol definitions file, like Tracery (this is the default when running from the command-line, or using the node API).
However, Bracery was specifically designed to work well for asynchronous applications where the client is decoupled from the symbol definition store.

In asynchronous mode, the symbol expansion code can run on a server somewhere remote from the client
(i.e. the place where procedural text generation is happening, such as the user's web browser).
This means that, for example, the set of definitions can potentially be very big (including a "standard library"), or can be continually updated, or collaboratively edited.

In order to allow programmers to write efficient code in this framework,
Bracery's syntax distinguishes between expansions that can be performed on the client, from those that must be performed by the server.
The former (client expansions) are called _variables_ and the latter (server expansions) are called _symbols_.

# Syntax

The formal grammar for Bracery is in [src/rhs.peg.js](src/rhs.peg.js) (specified using [PEG.js](https://pegjs.org/))

Language features include

- named nonterminals:
   - Tracery-style
      - `#symbol_name#` to expand a variable, falling back to an external definition (i.e. user extension)
   - Bracery-style
      - `&$symbol_name` or `&${symbol_name}` to expand a variable
      - `~symbol_name` or `~{symbol_name}` to expand an externally-defined symbol (user extension)
- alternations (anonymous nonterminals):
   - `[option1|option 2|Option number three|Some other option...]`
   - can be nested: `[option1|option 2|3rd opt|4th|more [options|nested options]...]`
- variables:
   - Tracery-style
      - `[variable_name:value]` to assign
         - `[variable_name=>value]` to quote-assign (this is a Bracery-specific extension)
      - `#variable_name#` to retrieve and expand, defaulting to externally-defined symbol `~name`
         - all names are case-insensitive
   - Bracery-style
      - `$variable_name={value}` to assign
         - braces can be omitted if `value` has no whitespace or punctuation
      - `$variable_name` or `${variable_name}` to retrieve (without expanding)
      - `&eval{$variable_name}` or `&$variable_name` to retrieve and expand
   - the Tracery-style syntax `#name#` is equivalent to `&$name` if variable `$name` is defined, otherwise falls back to calling user extension `~name`
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
      - `&multiply{x}{y}`, `&divide{x}{y}`, `&pow{x}{y}` return digits only: `&multiply{ten cats}{two dogs}` is `20`
      - `&math{($x+$y*$z)/$a}` defines a context that allows infix arithmetic operators
      - `&ordinal{3}` is `3rd`, `&cardinal{3rd}` is `3`
      - `&dignum{3}` is `3`, `&wordnum{three}` is `three`
      - `&random{n}`, `&floor{x}`, `&ceil{x}`, `&round{x}` do what you probably expect
         - `&prob{p}{succeed}{fail}` expands to `succeed` with probability `p`, and `fail` otherwise
      - `&eq{x}{y}`, `&neq{x}{y}`, `&gt{x}{y}`, `&geq{x}{y}`, `&lt{x}{y}`, `&leq{x}{y}` also fairly predictable
      - similarly `&inc{$x}`, `&dec{$x}`, `$x++`, `++$x`, `$x--`, `--$y`
         - and `$x+=1`, `$x-=2`, `$x*=3`, `$x/=4`
   - regular expressions:
      - `&match/regex/flags{text}{expr}` returns a list of `expr` evaluations (`$$1`, `$$2`, etc are bound to matching groups)
      - `&replace/regex/flags{text}{replacement}` returns a string
      - `&split/regex/flags{text}` or just `&split{text}` returns a list
- special functions:
   - repetition:
      - `&rep{x}{3}` expands to `xxx`
      - `&rep{x}{3,5}` expands to `xxx`, `xxxx`, or `xxxxx`
   - conditionals:
      - `&if{testExpr}then{trueExpr}else{falseExpr}`
      - Evaluates to `trueExpr` if `testExpr` contains any non-whitespace characters, and `falseExpr` otherwise
      - The `falseExpr` clause is optional and defaults to the empty string
      - The `then` and `else` keywords are optional; you can write `&if{testExpr}{trueExpr}{falseExpr}` or  `&if{testExpr}{trueExpr}`
      - The conditional test (`testExpr`) can use arithmetic operators `&eq`, `&neq`, `&gt`, `&lt`, `&geq`, `&leq`
         - also comparison `&same{x}{y}` and boolean operators `&and{x}{y}`, `&or{x}{y}`, `&not{x}`
   - dynamic evaluation
      - `&eval{expr}` parses `expr` as Bracery and dynamically expands it
         - conversely, `&quote{expr}` returns `expr` as a text string, without doing any expansions
         - `&quote{...}`, `&unquote{...}`, `&strictquote{...}` work pretty much like quasiquote/unquote/quote in Scheme
         - `&\`{...}`, `&,{...}`, `&'{...}` are the corresponding shorthand equivalents
      - `&eval{&quote{expr}}` is the same as `expr`, although...
         - there is a configurable limit on the number of dynamic evaluations that an expression can use, to guard against infinite recursion or hammering the server
      - `&quotify{expr}` wraps a string or (nested) list with `&quote` and `&list` (shorthand is `&q`)
   - locally scoped variables:
      - Tracery-style `#[x:value1][y:value2]symbol_name#` (what Tracery calls "actions")
      - Bracery-style `&let$x={value1}$y={value2}{something involving x and y}`
   - first-class functions (or, at the very least, frequent-flyer functions that got an upgrade)
      - `&call{expr}{arg1}{arg2}{arg3...}` binds `$$1` to `arg1`, `$$2` to `arg2`, `$$3` to `arg3`... before expanding `expr`
         - in other words, `&let$$1={arg1}{&let$$2={arg2}{&let$$3={arg3}{...}}}	   `
         - `&$x` is short for `&call{$x}`
      - `&apply{expr}{args}` is the same but the arguments are in list form
      - `&function$arg1$arg2$arg3{...}` is exactly the same as `&quote{&let$arg1={$$1}{&let$arg2={$$2}{&let$arg3={$$3}{...}}}}`
      - you can also pass args to user extensions e.g. `&~extension{arg1}{arg2}{arg3}`
         - `&~extension` is short for `&xcall{~extension}`
         - the 'apply' form of this is `&xapply{~extension}{arglist}`
      - the implementation may optionally allow retrieval of the Bracery code behind an extension symbol, using the syntax `&xget{~extension}`, but this is not guaranteed
         - specifically, extensions don't have to be implemented in Bracery themselves
	 - for those that are, however, it's useful to be able to retrieve the code in order to do syntactic analysis of the underlying context-free grammar
	 - the `&parse` function uses this feature
- lists:
   - `&list{...}` or just `&{...}` creates an explicit nested list context, vs the default concatenation context
      - `&{}` is the empty list, equivalent to `&list{}`
      - beginning a concatenation context with `{}` (or any other list) makes it a list context
      - beginning a concatenation context with a string, or wrapping it in `&string{...}` makes it a string context
   - `&islist{x}` returns true if, and only if, `x` is a list
   - list-coercing functions:
      - `&prepend{item}{list}`, `&append{list}{item}` return lists
      - `&first{list}`, `&last{list}` return individual list items (can be strings or nested lists)
      - `&notfirst{list}`, `&notlast{list}` return lists
      - `&nth{index}{list}` returns item number `index` (0-based) from `list`
      - `&cat{list1}{list2}` returns a list
      - `&join{list}{item}` returns a string
      - `&map$varname:{list}{expr}` and `&filter$varname:{list}{expr}` return lists
      - `&reduce$varname:{list}$result={init}{expr}` can return list or string
      - `&shuffle{list}` returns a list
      - `&numsort$varname{list}{weightExpr}` and `&lexsort$varname{list}{tagExpr}` return lists, numerically- or lexically-sorted (respectively) by the corresponding mapped expression
   - when coerced into a list context by one of the above functions, the empty string becomes the empty list and any nonempty string becomes a single-element list
   - when coerced into a string context (i.e. most contexts), a list is invisibly joined/flattened as if by `&join{list}{}`
- functions, alternations, repetitions, variable assignments, and conditionals can be arbitrarily nested
- everything can occur asynchronously, so symbols can be resolved and expanded from a remote store
   - but if you have a synchronously resolvable store (i.e. a local Tracery object), everything can work synchronously too
- access to the parser (disabled by default, for performance guarantees; to enable, set `{ enableParse: true }` in the configuration object for the `expand` method)
   - `&syntax{...}` returns the parse tree for the given Bracery expression
   - `&parse{source}{expr}` returns a parse tree by which Bracery expression `source` might have generated `expr`, or the empty string if no parse exists
      - The parse is probabilistic, not deterministic: if multiple valid parses exist, then the parse tree is sampled from the posterior probability distribution of valid parse trees
      - The source expression `source` (and any other Bracery code that it indirectly invokes) may not contain any function calls or variable assignments, only symbol references and variable lookups/expansions. This makes it a strict [context-free grammar](https://en.wikipedia.org/wiki/Context-free_grammar)
      - The parser is not guaranteed to work correctly if the grammar contains _null cycles_ (i.e. a series of transformations that leads back to the original symbol, with no other sequence generated)   - `&grammar{source}` returns the (almost) Chomsky normal-form grammar used by `&parse`, obtained by syntactic analysis of the `source` expression
. An example of such a null cycle is `[a=>#b#|x] [b=>#a#]`
      - The parser uses a variant of the [Inside algorithm](https://en.wikipedia.org/wiki/Inside%E2%80%93outside_algorithm) to sample from the posterior distribution of valid parses
      - The full Inside algorithm takes time _O(L^3)_ and memory _O(L^2)_ where _L_ is the string length. This is rather expensive for long strings, so Bracery's implementation restricts the maximum subclause length to be _K_ (via the `maxSubsequenceLength` config parameter), leading to memory _O(KL)_ and time _O(LK^2)_
      - NB the `&syntax` function uses [Parsing Expression Grammars](https://en.wikipedia.org/wiki/Parsing_expression_grammar) (via [PEG.js](https://pegjs.org/)) which is much faster than the Inside algorithm, but is unsuited to stochastic grammars such as those specified by a Bracery program
- syntactic sugar/hacks/apologies
   - the Tracery-style expression `#name#` is parsed and implemented as `&if{$name}then{&eval{$name}}else{~name}`. Tracery overloads the same namespace for symbol and variable names, and uses the variable if it's defined; this quasi-macro reproduces that behavior (almost)
   - braces around single-argument functions or symbols can be omitted, e.g. `$currency=&cap&plural~name` means the same as `$currency={&cap{&plural{~name}}}`
   - variable and symbol names are case-insensitive
      - the case used when a variable is referenced can be a shorthand for capitalization: you can use `~Nonterminal_name` as a shorthand for `&cap{~nonterminal_name}`, and `$Variable_name` for `&cap{$variable_name}`
      - similarly, `~NONTERMINAL_NAME` is a shorthand for `&uc{~nonterminal_name}`, and  `$VARIABLE_NAME` for `&uc{$variable_name}`
   - some Tracery modifier syntax works, e.g. `#symbol_name.capitalize#` instead of `&cap{#symbol_name#}`
   - the syntax `[name=>value1|value2|value3|...]` is shorthand for `$name={&quote{[value1|value2|value3|...]}` and ensures that every occurrence of `#name#` (or `&eval{$name}`) will be expanded from an independently-sampled one of the values

Most/all of these features are exercised in the file [test/basic.js](test/basic.js).


