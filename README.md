[![License](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Build Status](https://travis-ci.org/ihh/bracery.svg?branch=master)](https://travis-ci.org/ihh/bracery)
[![Coverage Status](https://coveralls.io/repos/github/ihh/bracery/badge.svg?branch=master)](https://coveralls.io/github/ihh/bracery?branch=master)

# Bracery

Bracery is a small language for procedural text generation.
Its purpose is to enable quick and fluid writing of text with random elements,
allowing for user extensions that may include calls to a server (e.g. for synonyms, rhymes, or other functions).

Bracery aims...

- to be easy to work with,
- to keep out of the writer's way,
- to avoid plundering the character space for syntax (especially punctuation marks, like quotes and commas, that are common in prose writing),
- to allow real programming (variables, functions, lists) without forcing the writer to use/learn/care about any of those things,
- to be fully functional in offline/synchronous mode, but also readily connectable to online generative text servers,
- to be as compatible as possible with previous work in this space, especially [@galaxykate](https://github.com/galaxykate)'s [Tracery](http://tracery.io/).

Bracery combines elements of other languages and libraries, including
variable manipulation syntax from [Tracery](http://tracery.io/),
alternations from [regular expressions](https://en.wikipedia.org/wiki/Regular_expression),
natural language processing from the [compromise](https://github.com/spencermountain/compromise) library,
and lists from [Scheme](https://en.wikipedia.org/wiki/Scheme_(programming_language)).

# Usage

The following Bracery code generates lines like
`how goes it, magician of Middle Earth`
and `well met, magus of the world`

~~~~
[hello|well met|how goes it|greetings], [wizard|witch|mage|magus|magician|sorcerer|enchanter] of [earthsea|Earth|Middle Earth|the planet|the world]
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%2C%20%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%20of%20%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D">Try this</a> </em>

Here's the same example, but using variables to keep track of the choices:

~~~~
$greetings=[hello|well met|how goes it|greetings]
$wizard=[wizard|witch|mage|magus|magician|sorcerer|enchanter]
$earthsea=[earthsea|Earth|Middle Earth|the planet|the world]
$greetings, $wizard of $earthsea
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%24greetings%3D%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%24wizard%3D%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%24earthsea%3D%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%24greetings%2C%20%24wizard%20of%20%24earthsea">Try this</a> </em>

You can also use variables to store Bracery code itself, for later expansion:

~~~~
$greetings=&quote{[hello|well met|how goes it|greetings]}

$wizard=&quote{[wizard|witch|mage|magus|magician|sorcerer|enchanter]}

$earthsea=&quote{[earthsea|Earth|Middle Earth|the planet|the world]}

&eval{$greetings}, &eval{$wizard} of &eval{$earthsea}
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%24greetings%3D%26quote%7B%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%7D%0A%0A%24wizard%3D%26quote%7B%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%7D%0A%0A%24earthsea%3D%26quote%7B%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%7D%0A%0A%26eval%7B%24greetings%7D%2C%20%26eval%7B%24wizard%7D%20of%20%26eval%7B%24earthsea%7D">Try this</a> </em>

The above example uses [dynamic evaluation](https://en.wikipedia.org/wiki/Eval).
Here's the same code with some [syntactic sugar](https://en.wikipedia.org/wiki/Syntactic_sugar)
for the way variables are assigned and expanded:

~~~~
[greetings=>hello|well met|how goes it|greetings]
[wizard=>wizard|witch|mage|magus|magician|sorcerer|enchanter]
[earthsea=>earthsea|Earth|Middle Earth|the planet|the world]
#greetings#, #wizard# of #earthsea#
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%5Bgreetings%3D%3Ehello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%5Bwizard%3D%3Ewizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%5Bearthsea%3D%3Eearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%23greetings%23%2C%20%23wizard%23%20of%20%23earthsea%23">Try this</a> </em>

Programmers may recognize this kind of thing too ([lambdas](https://en.wikipedia.org/wiki/Anonymous_function)):

~~~~
$greetings=[hello|well met|how goes it|greetings]
$wizard=[wizard|witch|mage|magus|magician|sorcerer|enchanter]
$earthsea=[earthsea|Earth|Middle Earth|the planet|the world]

$sentence=&function{$name}{$greetings, $name}

&$sentence{$wizard of $earthsea}
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%24greetings%3D%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%24wizard%3D%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%24earthsea%3D%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%0A%24sentence%3D%26function%7B%24name%7D%7B%24greetings%2C%20%24name%7D%0A%0A%26%24sentence%7B%24wizard%20of%20%24earthsea%7D">Try this</a> </em>

And maybe this as well ([lists](https://en.wikipedia.org/wiki/List_(abstract_data_type))):

~~~~
$greetings=[hello|well met|how goes it|greetings]
$wizard=[wizard|witch|mage|magus|magician|sorcerer|enchanter]
$earthsea=[earthsea|Earth|Middle Earth|the planet|the world]

$sentence={$greetings, $wizard of $earthsea}

&join{&shuffle{&split{$sentence}}}
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%24greetings%3D%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%24wizard%3D%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%24earthsea%3D%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%0A%24sentence%3D%7B%24greetings%2C%20%24wizard%20of%20%24earthsea%7D%0A%0A%26join%7B%26shuffle%7B%26split%7B%24sentence%7D%7D%7D">Try this</a> </em>

which gives jumbled-up output like

~~~~
witch the hello, of world
~~~~

Bracery's alternations and variable expansions form a [context-free grammar](https://en.wikipedia.org/wiki/Context-free_grammar),
and Bracery includes a limited parser.
In other words, if you have some text that you think might have been generated by a given (suitably simple) Bracery program,
then you can reconstruct _how_ that program could have generated that output.

For example:

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

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%5Bsentence%3D%3E%5B%23singular_noun%23%20%23singular_verb%23%7C%23plural_noun%23%20%23plural_verb%23%5D%20%23noun_phrase%23%5D%0A%5Bnoun_phrase%3D%3E%23noun%23%7C%23preposition%23%20%23noun%23%5D%0A%5Bnoun%3D%3E%23plural_noun%23%7C%23singular_noun%23%5D%0A%5Bsingular_noun%3D%3Efruit%7Ca%20banana%5D%0A%5Bsingular_verb%3D%3Eflies%7Clikes%7Cnears%5D%0A%5Bplural_noun%3D%3Efruit%20flies%7Cbananas%5D%0A%5Bplural_verb%3D%3Efly%7Clike%7Cnear%5D%0A%5Bpreposition%3D%3Elike%7Cnear%5D%0A%26json%26parse%23sentence%23%7Bfruit%20flies%20like%20a%20banana%7D">Try this</a> </em>

This should give one of two different parses of ["fruit flies like a banana"](https://en.wikipedia.org/wiki/Time_flies_like_an_arrow;_fruit_flies_like_a_banana).
One parse has "fruit flies" as the noun, and "like" as the verb:

~~~~
[["root",["#sentence#",["alt",["#plural_noun#",["alt","fruit flies"]]," ",["#plural_verb#",["alt","like"]]," ",["#prep_or_noun#",["alt",["#noun#",["alt",["#singular_noun#",["alt","a banana"]]]]]]]]]]
~~~~

The other parse has "fruit" as the noun, "flies" as the verb, and "like" as a preposition:

~~~~
[["root",["#sentence#",["alt",["#singular_noun#",["alt","fruit"]]," ",["#singular_verb#",["alt","flies"]]," ",["#prep_or_noun#",["alt",["#prep#",["alt","like"]]," ",["#noun#",["alt",["#singular_noun#",["alt","a banana"]]]]]]]]]]
~~~~

However, you don't need to use any of these programmer-oriented features, if you just want to write generative text.
Just [start typing](http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%24greetings%3D%5Bhello%7Cwell%20met%7Chow%20goes%20it%7Cgreetings%5D%0A%24wizard%3D%5Bwizard%7Cwitch%7Cmage%7Cmagus%7Cmagician%7Csorcerer%7Cenchanter%5D%0A%24earthsea%3D%5Bearthsea%7CEarth%7CMiddle%20Earth%7Cthe%20planet%7Cthe%20world%5D%0A%24greetings%2C%20%24wizard%20of%20%24earthsea) and go!


## Web usage

The "wizard of earthsea" example is available as a [web demo](http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html) ([source](web/demo.html)).

Here's another example, taken from Kate Compton's [online tutorial](http://www.crystalcodepalace.com/traceryTut.html) to Tracery:

~~~~
[name=>Arjun|Yuuma|Darcy|Mia|Chiaki|Izzi|Azra|Lina]
[animal=>unicorn|raven|sparrow|scorpion|coyote|eagle|owl|lizard|zebra|duck|kitten]
[mood=>vexed|indignant|impassioned|wistful|astute|courteous]
[story=>#hero# traveled with her pet #heroPet#.  #hero# was never #mood#, for the #heroPet# was always too #mood#.]
[origin=>#[hero:#name#][heroPet:#animal#]story#]
#origin#
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%5Bname%3D%3EArjun%7CYuuma%7CDarcy%7CMia%7CChiaki%7CIzzi%7CAzra%7CLina%5D%0A%5Banimal%3D%3Eunicorn%7Craven%7Csparrow%7Cscorpion%7Ccoyote%7Ceagle%7Cowl%7Clizard%7Czebra%7Cduck%7Ckitten%5D%0A%5Bmood%3D%3Evexed%7Cindignant%7Cimpassioned%7Cwistful%7Castute%7Ccourteous%5D%0A%5Bstory%3D%3E%23hero%23%20traveled%20with%20her%20pet%20%23heroPet%23.%20%20%23hero%23%20was%20never%20%23mood%23%2C%20for%20the%20%23heroPet%23%20was%20always%20too%20%23mood%23.%5D%0A%5Borigin%3D%3E%23%5Bhero%3A%23name%23%5D%5BheroPet%3A%23animal%23%5Dstory%23%5D%0A%23origin%23">Try this</a> </em>

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

Here is a [web demo](http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/tracery.html) ([source](web/tracery.html))
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


# Tutorial

The first thing to know about Bracery is that anything that isn't code is implicitly output.
So, for example, the Bracery program to generate the text "hello world" is just `hello world`, which is a [quine](https://en.wikipedia.org/wiki/Quine_(computing)).
In fact, all strings are valid Bracery programs, and most Bracery programs are quines,
in that the default thing for Bracery to do if it can't otherwise parse or recognize the input stream
is simply to echo it back to the output.
In this, Bracery is like other interactive fiction languages (ChoiceScript, Tracery, Twine formats, etc.) and markup languages (Markdown, etc.).

The main construct for generating variation in Bracery is the _alternation_, a list of options separated by vertical bars:

~~~~
I feel [happy|sad|angry|bored]
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#I%20feel%20%5Bhappy%7Csad%7Cangry%7Cbored%5D">Try this</a> </em>

When this "Bracery program" is "run" (or the text is expanded, the transformative grammar applied, or however you want to think of it),
the output will be something like

~~~~
I feel happy
~~~~

or maybe

~~~~
I feel bored
~~~~

or one of the others.
Each option in an alternation is deemed equally likely.

You can use variables to remember the outcome of a random choice, for repetition, or delayed effect:

~~~~
$mood=[happy|sad|angry|bored]
I feel $mood. And when I'm $mood, then $mood is all I feel.
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%24mood%3D%5Bhappy%7Csad%7Cangry%7Cbored%5D%0AI%20feel%20%24mood.%20And%20when%20I'm%20%24mood%2C%20then%20%24mood%20is%20all%20I%20feel.">Try this</a> </em>

Example output:

~~~~
I feel bored. And when I'm bored, then bored is all I feel.
~~~~

Note that there is no space around the equals sign in `$mood=[happy|sad|angry|bored]`.
In general Bracery is quite sensitive to spaces, a side-effect of minimizing the use of punctuation marks for syntax.
Spaces are mostly left untouched, on the assumption that the writer meant them to be part of the output.
Similarly, most punctuation is ignored, with some exceptions (square braces `[]`, curly braces `{}`, pipe `|`).
The equals sign may be interpreted as syntax, but _only_ if it immediately follows a variable (here `$mood`), with no intervening whitespace.
Some other combinations of punctuation marks (e.g. `$`, `&`, `=>`, `:=`) are syntactically meaningful but only in very specific contexts.

What if you want a potentially _different_ mood, but sampled from that same range of four moods?
Do you have to copy and paste the `[happy|sad|angry|bored]` list? Of course not!
Bracery's `&quote` and `&eval` constructs come to your rescue.

To be specific, we can define a variable `$new_mood` that contains exactly the string `[happy|sad|angry|bored]`.
Then, whenever we want a new mood, we can _evaluate_ (i.e. expand, a.k.a. transform) this string.

This might look like this:

~~~~
$new_mood=&quote{[happy|sad|angry|bored]}
$mood=&eval{$new_mood}
I feel $mood. And when I'm $mood, then $mood is all I feel.
Maybe tomorrow, I'll be &eval{$new_mood}?
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%24new_mood%3D%26quote%7B%5Bhappy%7Csad%7Cangry%7Cbored%5D%7D%0A%24mood%3D%26eval%7B%24new_mood%7D%0AI%20feel%20%24mood.%20And%20when%20I'm%20%24mood%2C%20then%20%24mood%20is%20all%20I%20feel.%0AMaybe%20tomorrow%2C%20I'll%20be%20%26eval%7B%24new_mood%7D%3F">Try this</a> </em>

Example output:

~~~~
I feel bored. And when I'm bored, then bored is all I feel.
Maybe tomorrow, I'll be angry?
~~~~

The assignation pattern `$variable=&quote{[alternation|...]}` is common enough to get its own shorthand, `[variable=>alternation|...]`.
Similarly, the expansion pattern `&eval{$variable}` gets the shorthand `#variable#` --- a syntax Tracery users may recognize.
Another piece of Tracery syntax is `[variable:value]` to set a variable's value.

Putting these together, we can write the same program in Tracery-esque style (it's not quite Tracery, but it's close):

~~~~
[new_mood=>happy|sad|angry|bored]
[mood:#new_mood#]
I feel #mood#. And when I'm #mood#, then #mood# is all I feel.
Maybe tomorrow, I'll be #new_mood#?
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%5Bnew_mood%3D%3Ehappy%7Csad%7Cangry%7Cbored%5D%0A%5Bmood%3A%23new_mood%23%5D%0AI%20feel%20%23mood%23.%20And%20when%20I'm%20%23mood%23%2C%20then%20%23mood%23%20is%20all%20I%20feel.%0AMaybe%20tomorrow%2C%20I'll%20be%20%23new_mood%23%3F">Try this</a> </em>

(Any whitespace following assignments is ignored, so assignments can each go on their own lines, which is tidier.)

Alternations can be nested, so (for example) we can create `very` and `slightly` sub-categories of `bored`:

~~~~
[new_mood=>happy|sad|angry|[very|slightly] bored]
[mood:#new_mood#]
I feel #mood#. And when I'm #mood#, then #mood# is all I feel.
Maybe tomorrow, I'll be #new_mood#?
~~~~

<!--DEMO--> <em> <a style="float:right;" href="http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#%5Bnew_mood%3D%3Ehappy%7Csad%7Cangry%7C%5Bvery%7Cslightly%5D%20bored%5D%0A%5Bmood%3A%23new_mood%23%5D%0AI%20feel%20%23mood%23.%20And%20when%20I'm%20%23mood%23%2C%20then%20%23mood%23%20is%20all%20I%20feel.%0AMaybe%20tomorrow%2C%20I'll%20be%20%23new_mood%23%3F">Try this</a> </em>

More details of the language are available in the following sections.

# Technical details

## Namespaces

Bracery defines three separate namespaces, distinguished by the prefix character.
You can ignore these and just use the Tracery syntax `#name#` if you want, but for a deeper understanding of what's going on:

- `$name` refers to a variable
- `&name` refers to a core library function or macro
- `~name` refers to a user extension (local or remote)
- `#name#` means "expand variable `$name`, or fall back to calling user extension `~name` if variable `$name` is not defined"

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

If you just want the variable value, you can use the caret character prefix, `$name`, which will evaluate to the empty string if the variable has not been defined.
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
   - Tracery-style `#symbol_name#`
   - Bracery-style `~symbol_name` or `~{symbol_name}`
   - subtle difference: the Tracery style allows the symbol definition to be overridden by a local variable
- alternations (anonymous nonterminals):
   - `[option1|option 2|Option number three|Some other option...]`
   - can be nested: `[option1|option 2|3rd opt|4th|more [options|nested options]...]`
- variables:
   - Tracery-style
      - `[variable_name:value]` to assign
      - `#variable_name#` to retrieve and expand (names are case-insensitive)
   - Bracery-style
      - `$variable_name={value}` to assign
      - `$variable_name` or `${variable_name}` to retrieve (without expanding)
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
   - regular expressions:
      - `&match/regex/flags{text}{expr}' returns a list of `expr` evaluations (`$$1`, `$$2`, etc are bound to matching groups)
      - `&replace/regex/flags{text}{replacement}' returns a string
      - `&split/regex/flags{text}' or just `&split{text}' returns a list
- special functions:
   - repetition:
      - `&rep{x}{3}` expands to `xxx`
      - `&rep{x}{3,5}` expands to `xxx`, `xxxx`, or `xxxxx`
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
      - Bracery-style `&let$x={value1}$y={value2}{something involving x and y}`
   - first-class functions (or, at the very least, frequent-flyer functions that got an upgrade)
      - `&call{expr}{arg1}{arg2}{arg3...}` binds `$$1` to `arg1`, `$$2` to `arg2`, `$$3` to `arg3`... before expanding `expr`
         - in other words, `&let$$1={arg1}{&let$$2={arg2}{&let$$3={arg3}{...}}}	   `
         - `&$x` is short for `&call{$x}`
      - `&apply{expr}{args}` is the same but the arguments are in list form
      - `&function$arg1$arg2$arg3{...}` is exactly the same as `&quote{&let$arg1={$$1}{&let$arg2={$$2}{&let$arg3={$$3}{...}}}}`
      - you can also pass args to user extensions e.g. `&~extension{arg1}{arg2}{arg3}`
         - `&~extension` is short for `&xcall{~extension}'
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
- access to the parser
   - `&syntax{...}` returns the parse tree for the given Bracery expression
   - `&parse{source}{expr}` returns a parse tree by which Bracery expression `source` might have generated `expr`, or the empty string if no parse exists
      - The parse is probabilistic, not deterministic: if multiple valid parses exist, then the parse tree is sampled from the posterior probability distribution of valid parse trees
      - The source expression `source` (and any other Bracery code that it indirectly invokes) may not contain any function calls or variable assignments, only symbol references and variable lookups/expansions. This makes it a strict [context-free grammar](https://en.wikipedia.org/wiki/Context-free_grammar)
      - The parser is not guaranteed to work correctly if the grammar contains _null cycles_ (i.e. a series of transformations that leads back to the original symbol, with no other sequence generated). An example of such a null cycle is `[a=>#b#|x] [b=>#a#]`
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
- a set of _future-tags_ which by default are the same as the template's future-tags, but can be overridden by the `$tags` variable, if that variable is assigned a value in the expansion tree
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
The template itself, featuring $variables, ~nonterminals, [alternations|etc.]
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
 








