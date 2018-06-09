# Tutorial

In Bracery, anything that isn't code is implicitly output.
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
Similarly, the most common punctuation characters (spaces, brackets, commas, semicolons) are generally ignored.
Some less frequently-used punctuation marks are interpreted as syntax (square braces `[]`, curly braces `{}`, pipe `|`)
and may be preceded with a backslash (`\`) if they're meant to be output.
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
