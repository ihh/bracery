var assert = require('assert')
var bracery = require('../index')
var extend = bracery.ParseTree.extend

// initial grammar
var initJson = { abc: 'def',
                 hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 dynamo: function (config) { return [config.random() < .5 ? 'dynamik' : 'DYNAMIC'] },
                 lambda: function (config, x, y) { return x + 'world' + y },
                 json: function (config, x, y, z) { return 'x=' + JSON.stringify(x) + ' y=' + JSON.stringify(y) + ' z=' + JSON.stringify(z) },
                 coinflip: '&prob{.5}{heads}{tails}',
                 test1: 'testing',
                 test2: '~TEST1',
                 test3: 'x~test3',
                 test4: '&quote{~TEST1}' }

var nTestSymbols = Object.keys(initJson).length  // number of symbols in initial grammar

var b  // the Bracery object

// tests
function doTests (testRunner) {
  // test parameters
  var maxTries = 100

  // Theo's alternation test
  expectExpand ('$Theo:={[dad|mom]} $theo $theo come to [Africa|our house|nowhere] [just kidding |seriously] ha ha ha ha ha ',
                'dad dad dad come to nowhere just kidding  ha ha ha ha ha ',
                { maxTries: maxTries })
  
  // the tests themselves
  expectExpand ('~hello ~world', 'hello world', {maxTries:maxTries})
  expectExpand ('~hello ~world', 'hello planet', {maxTries:maxTries})
  expectExpand ('~hello ~world', 'hi world', {maxTries:maxTries})
  expectExpand ('~hello ~world', 'hi planet', {maxTries:maxTries})
  expectExpand ('~hello ~world', 'yo earth', {maxTries:maxTries,fail:true})

  // simple expansions
  expectExpand ('~test1', 'testing')
  expectExpand ('~test1', 'testings', {fail:true})
  expectExpand ('~test1', 'TESTING', {fail:true})
  expectExpand ('~test2', 'TESTING')

  // default is to expand ~abc (to 'def'), as that is the alphabetically earliest symbol
  expectExpand ('', 'def')

  // look out! recursion
  expectExpand ('~test3', 'xxx')
  expectExpand ('~test3', 'xxx', { maxDepth: 5 })
  expectExpand ('~test3', 'xxxxx', { maxDepth: 5, maxRecursion: 10 })
  expectExpand ('~test3', 'xxxx', { maxRecursion: 4 })
  expectExpand ('~test3', 'xxxxxxxxxx', { maxRecursion: 10 })
  expectExpand ('~test3 ~test3 ~test3', 'xxxxxxxxxx xxxxxxxxxx xxxxxxxxxx', { maxRecursion: 10 })
  expectExpand ('~test3', 'xxxxxxxxxx', { maxRecursion: 10, maxLength: 5 })
  expectExpand ('~test3 ~test3 ~test3', 'xxxxxxxxxx', { maxRecursion: 10, maxLength: 5 })
  expectExpand ('~test3 ~test3 ~test3', 'xxxxxxxxxx xxxxxxxxxx', { maxRecursion: 10, maxLength: 15 })
  expectExpand ('~test3 ~test3 ~test3', 'xxxxxxxxxx', { maxRecursion: 10, maxNodes: 5 })
  
  // quoting
  expectExpand ('~test4', '~TEST1')
  expectExpand ('&eval{~test4}', 'TESTING')
  expectExpandQuote ('&quote{~test1}', '~test1')
  expectExpand ('\\~test1', '~test1')
  expectExpand ('~', '~')
  expectExpandQuote ('&quote{~}', '\\~')
  expectExpandQuote ('&quote{~}test1', '\\~test1')
  expectExpandQuote ('&quote{~te}st1', '~test1')
  expectExpandQuote ('&quote{~test1}', '~test1')
  expectExpandQuote ('&eval{&quote{~}}', '~')
  expectExpandQuote ('&eval{&quote{~test1}}', 'testing')
  expectExpandQuote ('&eval{&quote{~te}st1}', 'testing')
  expectExpandQuote ('&eval{&quote{~}test1}', 'testing', {fail:true})
  expectExpandQuote ('&eval{&quote{~}test1}', '~test1')
  expectExpandQuote ('&eval{&eval{&quote{~}test1}}', 'testing')
  expectExpand ('\\~test1', '~test1')
  expectExpand ('&eval{\\~test1}', 'testing')
  expectExpandQuote ('&quote{#heroPet#}', '#heroPet#')
  expectExpandQuote ('&quote[a=>b]', '$a={&quote{b}}')
  expectExpandQuote ('&quote[a=>b|c]', '$a={&quote[b|c]}')
  expectExpandQuote ('$heropet={freddy}&eval&quote{#heroPet#}', 'freddy')
  expectExpandQuote ('&quote{&match/a/{cat}{$$0}}', '&match/a/{cat}$$0')

  expectExpand ('$x=3 &quote{x(&unquote$x)=&quote{&unquote$x}}', 'x(3)=&quote&unquote{$x}')
  expectExpand ('$x=3 &eval&quote{x(&unquote$x)=&quote{&unquote$x}}', 'x(3)=3')

  expectExpand ('&quote{a|b}', '[a|b]')
  expectExpand ('&quote&unquote{a|b}', 'a', {maxTries:maxTries})
  expectExpand ('&quote&unquote{a|b}', 'b', {maxTries:maxTries})
  expectExpand ('&quote&quote&unquote{a|b}', '&quote&unquote{[a|b]}')

  expectExpandQuote ('&quote{&~hello{abc}{def}}', '&~hello{abc}{def}')
  expectExpand ('&quote&quote{&~hello{abc}{def}}', '&quote{&~hello{abc}{def}}')

  expectExpandQuote ('&quote{&xapply~{ lambda }{$y}}', '&xapply~lambda$y')
  expectExpandQuote ('&quote{&xcall~a{b}{cd}{e}}', '&~a{b}{cd}{e}')
  
  // case manipulation
  expectExpand ('&quote{~TEST1}', '~TEST1')
  expectExpand ('&quote{~Test1}', '~Test1')
  expectExpand ('~TEST1', 'TESTING')
  expectExpand ('~Test1', 'Testing')
  expectExpand ('&uc{abc}', 'ABC')
  expectExpand ('&lc{AbC}', 'abc')
  expectExpand ('&cap{&lc{AbC}}', 'Abc')

  // compromise
  expectExpand ('&plural{child}', 'children')
  expectExpand ('&singular{children}', 'child')
  expectExpand ('&adjective{love}', 'loveable', {sorry_blame_compromise:true})
  expectExpand ('&future{love}', 'will love')
  expectExpand ('&past{love}', 'loved')

  // arithmetic & numbers
  expectExpand ('&add{2}{2}', '4')
  expectExpand ('&add{two}{two}', 'four')
  expectExpand ('&add{two cats}{4}', 'six cats')
  expectExpand ('&add{two cats three dogs}{2}', 'four cats five dogs')
  expectExpand ('&subtract{3}{3}', '0')
  expectExpand ('&subtract{three}{three}', '0')
  expectExpand ('&subtract{three}{four}', 'negative one')
  expectExpand ('&subtract{3}{4}', '-1')
  expectExpand ('&add{two}{&subtract{three}{four}}', 'one')
  expectExpand ('&multiply{two}{three}', '6')
  expectExpand ('&divide{three}{two}', '1.5')
  expectExpand ('&pow{three}{two}', '9')
  expectExpand ('&pow{2}{3}', '8')

  expectExpand ('&gt{three cats}{2}', 'three cats')
  expectExpand ('&gt{three cats}{4}', '')
  expectExpand ('&lt{three cats}{2}', '')
  expectExpand ('&lt{three cats}{4}', 'three cats')
  expectExpand ('&eq{three cats}{3}', 'three cats')
  expectExpand ('&eq{three cats}{4}', '')
  expectExpand ('&eq{zero}{}', 'zero')
  expectExpand ('&eq{}{zero}', 'zero')
  expectExpand ('&eq{}{}', 'eq')
  expectExpand ('&neq{one}{}', 'one')
  expectExpand ('&neq{}{one}', 'one')
  expectExpand ('&neq{three cats}{3}', '')
  expectExpand ('&neq{three cats}{4}', 'three cats')
  expectExpand ('&leq{three cats}{3}', 'three cats')
  expectExpand ('&leq{three cats}{4}', 'three cats')
  expectExpand ('&leq{three cats}{2}', '')
  expectExpand ('&geq{three cats}{3}', 'three cats')
  expectExpand ('&geq{three cats}{4}', '')
  expectExpand ('&geq{three cats}{2}', 'three cats')

  expectExpand ('&round{3.141}', '3')
  expectExpand ('&round{three point one four one}', '3')
  expectExpand ('&round{3.6}', '4')
  expectExpand ('&floor{3.6}', '3')
  expectExpand ('&ceil{3.6}', '4')

  expectExpand ('&ceil{&random{6}}', '6', {maxTries:maxTries})
  expectExpand ('&ceil{&random{6}}', '1', {maxTries:maxTries})

  expectExpand ('&wordnum{3}', 'three')
  expectExpand ('&wordnum{32}', 'thirty two')
  expectExpand ('&wordnum{three}', 'three')

  expectExpand ('&dignum{3}', '3')
  expectExpand ('&dignum{thirty two}', '32')
  expectExpand ('&dignum{three}', '3')

  expectExpand ('&ordinal{3}', '3rd')
  expectExpand ('&ordinal{three}', 'third')
  expectExpand ('&cardinal{3rd}', '3')
  expectExpand ('&cardinal{third}', 'three')

  expectExpand ('&abs{-3}', '3')
  expectExpand ('&max{four}{6}', '6')
  expectExpand ('&max{four}{2}', 'four')
  expectExpand ('&min{-10}{twenty}', '-10')

  expectExpand ('&percent{.5}', '50%')
  expectExpand ('&percent{1.01}', '101%')

  // test workaround for nlp's floating-point parser, that doesn't recognize '.5' as '0.5'
  expectExpand ('&add{.25}{.3}', '0.55')

  // variables
  expectExpand ('$x={aha}$x', 'aha')
  expectExpand ('$x=aha $x', 'aha')
  expectExpand ('$x:=aha', 'aha')
  expectExpand ('$x:=o h$x', 'oho')
  expectExpand ('[x:aha]$x', 'aha')
  expectExpand ('[x:aha]\n\n$x', 'aha')
  expectExpand ('[x:aha]\n\n$x\n\n$x', 'aha\n\naha')
  expectExpand ('[x=>aha]\n\n$x', 'aha')
  expectExpand ('[x=>aha|aha]\n\n$x', '[aha|aha]')
  expectExpand ('[x=>aha|aha]\n\n#x#', 'aha')
  expectExpand ('$x=aha\n\n$x', 'aha')
  expectExpand ('$x=aha\n\n$x\n\n$x', 'aha\n\naha')
  expectExpand ('$z={zebedee}$zeb={zebadiah}$Zeb $Z', 'Zebadiah ZEBEDEE')
  expectExpand ('$AbC={air}$aBC={hair}$abC={lair}$abc$Abc$ABC', 'lairLairLAIR')

  expectExpand ('$x=3 $y=8 &map&vars{\[$_:&eval{\$$_}\]}', '[x:3][y:8]')  // how to quote the environment...

  expectExpand ('&set$x{oho}$x', 'oho')

  // Game-specific extensions: &accept, &reject, &meter, &status, &tag
  expectExpand ('&accept$x $accept', '$x')
  expectExpand ('&reject{123}$reject', '123')

  expectExpand ('&meter{a}{$b} &meter{c}{$d/100} &json$meters', '[[["a","&math{$b}"],["c","&math{$d/100}"]]]')
  expectExpand ('&meter{a}{$b}{$c} &json$meters', '[[["a","&math{$b}","$c"]]]')

  expectExpand ('&status{$blah}$status', '$blah')

  expectExpand ('$tags=abc &tag{def}&tag{ghi} $tags', 'abc def ghi')

  expectExpandQuote ('&quote&accept{$x}', '&accept{$x}')
  expectExpandQuote ('&quote&reject{$y $z}', '&reject{$y $z}')
  expectExpandQuote ('&quote&status{$blah}', '&status{$blah}')
  expectExpandQuote ('&quote&tag{newtag}', '&tag{newtag}')
  expectExpandQuote ('&quote&meter{icon}{$a + $b}', '&meter{icon}{$a + $b}')
  expectExpandQuote ('&quote&meter{icon}{$a + $b}{status}', '&meter{icon}{$a + $b}{status}')
  
  // syntax edge cases involving dummy alternations
  expectExpand ('$abc=[ABC]', '=[ABC]')
  expectExpand ('$abc={[DEF]}', '')
  expectExpand ('$abc={[DEF]}$abc', '[DEF]')
  expectExpand ('$x={a\\|b}$x', 'a|b')
  expectExpand ('$dummy=[c\\|d]', '=[c|d]')
  expectExpand ('$x={a\\|b}$r=&eval{[$x]}$r', 'a', {maxTries:maxTries})
  expectExpand ('$x={a\\|b}$r=&eval{[$x]}$r', 'b', {maxTries:maxTries})

  // Tracery variables
  expectExpand ('[myvar:myval]', '')
  expectExpand ('[myvar:myval]$myvar', 'myval')
  expectExpand ('[myvar:myval]#myvar#', 'myval')
  expectExpand ('[myvar=>myval]$myvar', 'myval')
  expectExpand ('[myvar=>myval]#myvar#', 'myval')
  expectExpand ('[myvar=>myval1|myval2]$myvar', '[myval1|myval2]')
  expectExpand ('[myvar=>myval1|myval2]#myvar#', 'myval1', {maxTries:maxTries})
  expectExpand ('[myvar=>myval1|myval2]#myvar#', 'myval2', {maxTries:maxTries})

  // Tracery modifiers
  expectExpand ('#test1#', 'testing')
  expectExpand ('#test1.capitalize#', 'Testing')
  expectExpand ('#test1.capitalizeAll#', 'TESTING')

  // Tracery-style overriding
  expectExpand ('$test1={OVERLOAD}#test1#', 'OVERLOAD')
  expectExpand ('[test1:OVERLOAD]#test1#', 'OVERLOAD')
  expectExpand ('$test1={OVERLOAD}~test1', 'testing')
  expectExpand ('$test1={~test4}#test1#', 'TESTING')

  // local scope
  expectExpand ('$a={A}$b={B}$a$b&let$a={x}$b={y}{$a$b}$a$b', 'ABxyAB')
  expectExpand ('$a={A}$b={B}$a$b&let $a={x}  $b={y}  {$a$b}$a$b', 'ABxyAB')
  expectExpand ('$a={a}$b={${a}b$a}$ab=&quote{$a$b}#[a:3$b][b:5$a]ab#$a$b', '3aba53abaaaba')
  
  // variable persistence
  var vars = {}
  expectExpand ('$a={x}$a', 'x', {vars:vars})
  expectExpand ('$a', '')
  expectExpand ('$a', 'x', {vars:vars,a_equals_x:true})

  // lists
  expectExpand ('{}', '{}')
  expectExpand ('&{}', '')
  expectExpand ('&cat{&{}}{xyz}', 'xyz')
  expectExpand ('&cat{xyz}{abc}', 'xyzabc')
  expectExpand ('&cat{123}&cat{xyz}{abc}', '123xyzabc')
  expectExpand ('&first{&cat{123}&cat{xyz}{abc}}', '123')
  expectExpand ('&notfirst{&cat{123}&cat{xyz}{abc}}', 'xyzabc')
  expectExpand ('&last{&cat{123}&cat{xyz}{abc}}', 'abc')
  expectExpand ('&notlast{&cat{123}&cat{xyz}{abc}}', '123xyz')

  expectExpand ('&prepend{123}&cat{xyz}{abc}', '123xyzabc')
  expectExpand ('&prepend&cat{xyz}{abc}{123}', 'xyzabc123')
  expectExpand ('$list={&prepend{123}&cat{xyz}{abc}}&first$list', '123')
  expectExpand ('$list={&prepend&cat{xyz}{abc}{123}}&first$list', 'xyzabc')
  expectExpand ('$list={&prepend{123}&cat{xyz}{abc}}&last$list', 'abc')
  expectExpand ('$list={&prepend&cat{xyz}{abc}{123}}&last$list', '123')

  expectExpand ('&append{123}&cat{xyz}{abc}', '123xyzabc')
  expectExpand ('&first&append{123}&cat{xyz}{abc}', '123')
  expectExpand ('&last&append{123}&cat{xyz}{abc}', 'xyzabc')

  expectExpand ('&join{&prepend{123}&cat{xyz}{abc}}{, }', '123, xyz, abc')

  expectExpand ('&islist{&{}}', '[]')
  expectExpand ('&islist{}', '')
  expectExpand ('&same{&{}}{}', '')
  expectExpand ('&same{&{}}{&{}}', '1')

  expectExpand ('&join{&{}x&{}y}{,}', 'x,y')
  expectExpand ('&join{x&{}y&{}}{,}', 'xy')

  expectExpand ('$x=&list{&quote{abc}&quote{def}}&map$a$x{$a!}', 'abc!def!')
  expectExpand ('$x=&list{&quote{abc}&quote{def}}&join&map$a$x{$a!}{ }', 'abc! def!')

  expectExpand ('$x=&list{&quote{2}&quote{4}&quote{6}&quote{0}}&filter$n$x&gt{$n}{3}', '46')
  expectExpand ('$x=&list{&quote{2}&quote{4}&quote{6}&quote{0}}&reduce$n$x$r={0}&add$n$r', '12')
  expectExpand ('$x=&list{&quote{2}&quote{4}&quote{6}&quote{0}}&reduce$n:$x$r={zero dogs}&add$r$n', 'twelve dogs')

  expectExpand ('$x={1}$a1={verily}$a2={in troth}&eval&quote{$a&unquote$x indeed}', 'verily indeed')
  expectExpand ('&quote&unquote&quote&infinitive$y', '&infinitive$y')

  expectExpand ('$x={&{}abc&quote{def}}&q$x', '&{abc&,def}')

  expectExpand ('&push$x{a}&push$x{b}&uc&push$x{c}&push$x{...}&join$x{,} &shift$x $dots:={&pop$x} $quirk:=uh, &shift$x $dots &unshift$x&cat{x}{t} &uc&join$x$dots',
                'a,b,c,... a ... uh,b ... X...T...C')  // a lot going on in this one. Spaces must be exactly correct (of course)
  expectExpand ('$x=5 &inc$x x=$x $x=10 &dec$x x=$x', 'x=6 x=9')  // note exact spaces
  expectExpand ('$a=10 $b=20 $c=30 $d=40 ++$a --$b $c++ $d-- a=$a b=$b c=$c d=$d', '10 20 31 39 a=11 b=19 c=31 d=39')  // note exact spaces

  expectExpand ('$a=ten $a $a+=3 $a $a-=5 $a $a*=2 $a $a/=4 $a $a.=2 $a', 'ten thirteen eight 16 4 42')

  expectExpand ('$x=&split{fresh word salad} &join{&shuffle{$x}}{ }', 'salad word fresh', {maxTries:maxTries})

  expectExpand ('$x=&{1&,3&,2&,11}&json$x $y=&numsort{$x}{$_} &json$y', '[["1","3","2","11"]] [["1","2","3","11"]]')
  expectExpand ('$x=&{1&,3&,2&,11}&json$x $y=&lexsort{$x}{$_} &json$y', '[["1","3","2","11"]] [["1","11","2","3"]]')
  expectExpand ('&numsort$x', '')

  expectExpand ('$x=hello &push$x $x=well $x $x=&pop $x', 'well hello')  // default arguments to &push and &pop
  expectExpand ('&join&split/,/{hello,world}', 'hello world')  // default argument to &join
  expectExpand ('&lexsort&split{a c d b}', 'abcd')  // default argument to &lexsort

  expectExpand ('&revstr{abcde}', 'edcba')
  expectExpand ('&reverse{abcde}', 'abcde')
  expectExpand ('&reverse&split//{abcde}', 'edcba')  // empty regex in &split
  expectExpand ('&reverse&split/b/{abcde}', 'cdea')

  // these used to be tests of &strip, now obsoleted by &replace (and thus &strip has been stripped and replaced by &replace)
  expectExpand ('&replace/hello/g{hello world hello}{}', ' world ')
  expectExpand ('&replace/(hell)(o)/g{hello world hello}{$$2 well $$1}', 'o well hell world o well hell')
  expectExpand ('&replace/&unquote{~abc}/{defcon}{}', 'con')
  expectExpand ('~{abc}', 'def')
  expectExpand ('~{abc}con', 'defcon')
  expectExpand ('~{abc}con', 'defcon')
  expectExpand ('&replace/&unquote{~abc}/{~{abc}con}{}', 'con')
  expectExpand ('&replace/&unquote{~abc}/{~{abc}con defcon}{}', 'con defcon')
  expectExpand ('&replace/&unquote{~abc}/g{~{abc}con defcon}{}', 'con con')

  expectExpand ('$b={b}$x={Batch}$y=&replace/&unquote&replace/&unquote{$b}/{abc}{}/&replace/t/$x{}{}$y', 'Bh')

  // strlen, length, comment
  expectExpand ('$x=hello &strlen$x', '5')
  expectExpand ('$x=hello &length$x', '1')
  expectExpand ('$x=&split{hello world} &length$x', '2')
  expectExpand ('$x=&split{hello world} &strlen$x', '10')

  expectExpand ('&comment{hello world}', '')
  expectExpandQuote ('&quote&comment{hello world}', '&comment{hello world}')

  // same, and, or, not
  expectExpand ('&same{abc}{def}', '')
  expectExpand ('&same{abc}{abc}', 'abc')

  expectExpand ('&and{ }{world}', '')
  expectExpand ('&and{hello}{  }', '')
  expectExpand ('&and{hello}{world}', 'helloworld')

  expectExpand ('&or{a}{b}', 'a')
  expectExpand ('&or{ }{b}', 'b')

  expectExpand ('&not{}', '1')
  expectExpand ('&not{ }', '1')
  expectExpand ('&not{1}', '')

  // repetition
  expectExpand ('&rep{Test}{3}', 'TestTestTest')
  expectExpand ('&rep{Test}{3,5}', 'TestTestTest', {maxTries:maxTries})
  expectExpand ('&rep{Test}{3,5}', 'TestTestTestTest', {maxTries:maxTries})
  expectExpand ('&rep{Test}{3,5}', 'TestTest', {maxTries:maxTries,fail:true})
  expectExpand ('&rep{Test}{3,5}', 'TestTestTestTestTestTest', {maxTries:maxTries,fail:true})
  expectExpand ('&rep{Test}{6}', 'TestTest', {maxReps:2})
  
  // eval
  expectExpand ('$a={~}$b={test}$c={1}&eval{$a&cap{$b}$c}', 'Testing')
  expectExpand ('$a={1}$b={2}$c={3}&let$a={~}$b={test}$c={1}&eval{$a&cap{$b}$c}$a&cap{$b}$c', 'Testing123')
  expectExpand ('$a={1}$b={2}$c={3}&let$a={~}$b={test}$c={1}{&eval{$a&cap{$b}$c}}$a&cap{$b}$c', 'Testing123')
  expectExpand ('$a={1}$b={2}$c={3}&let$a={~}$b={test}$c={1}{&eval{$a&cap{$b}$c}$a&cap{$b}$c}', 'Testing~Test1')

  // syntax, parse, grammar, tree
  expectExpand ('&json&syntax&quote{$x=[a|b]}', '[[["$","x","=",["{",[["[",[[["a"],"|"],[["b"]]],"]"]],"}"]]]]')
  expectExpand ('&q&parsejson{\["a","b",\["c","d"\],\{"x":3,"w":\["abc","def"\]\}\]}', '&{a&,b&{c&,d}&{&{w&{abc&,def}}&{x&,3}}}')

  expectExpand ('[a=>cat|#a# #a#]&json&parse{#a#}{cat cat cat}', '[["root",["#a#",["alt",["#a#",["alt",["#a#",["alt","cat"]]," ",["#a#",["alt","cat"]]]]," ",["#a#",["alt","cat"]]]]]]', {maxTries:maxTries})
  expectExpand ('[a=>cat|#a# #a#]&json&parse{#a#}{cat cat cat}', '[["root",["#a#",["alt",["#a#",["alt","cat"]]," ",["#a#",["alt",["#a#",["alt","cat"]]," ",["#a#",["alt","cat"]]]]]]]]', {maxTries:maxTries})
  expectExpand ('[a=>cat|#a# #a#]&json&parse{#a#}{cat cat dog}', '[""]')
  expectExpand ('[a=>cat|#a# #a#]&json&parse{#a#}{cat cat cat}', '[""]', {maxParseLength:5})

  expectExpand ('[a=>$animal|#a# #a#][animal:cat]&json&parse{#a#}{cat cat cat}', '[["root",["#a#",["alt",["#a#",["alt",["$animal","cat"]]]," ",["#a#",["alt",["#a#",["alt",["$animal","cat"]]]," ",["#a#",["alt",["$animal","cat"]]]]]]]]]', {maxTries:maxTries})
  expectExpand ('[a=>~abc|#a# #a#]&json&parse{#a#}{def def def}', '[["root",["#a#",["alt",["#a#",["alt",["#a#",["alt",["~abc","def"]]]," ",["#a#",["alt",["~abc","def"]]]]]," ",["#a#",["alt",["~abc","def"]]]]]]]', {maxTries:maxTries})

  expectExpand ('[a=>cat|dog]&json&parse{#a# $a}&quote{cat [cat|dog]}', '[["root",["#a#",["alt","cat"]]," ",["$a","[cat|dog]"]]]')

  expectExpand ('[sentence=>#plural_noun# #plural_verb# #prep_or_noun#|#singular_noun# #singular_verb# #prep_or_noun#][prep_or_noun=>#noun#|like #noun#][noun=>#plural_noun#|#singular_noun#][plural_noun=>fruit flies][singular_noun=>fruit|a banana][plural_verb=>fly|like][singular_verb=>flies|likes]&json&parse#sentence#{fruit flies like a banana}', '[["root",["#sentence#",["alt",["#plural_noun#","fruit flies"]," ",["#plural_verb#",["alt","like"]]," ",["#prep_or_noun#",["alt",["#noun#",["alt",["#singular_noun#",["alt","a banana"]]]]]]]]]]', {maxTries:maxTries})
  expectExpand ('[sentence=>#plural_noun# #plural_verb# #prep_or_noun#|#singular_noun# #singular_verb# #prep_or_noun#][prep_or_noun=>#noun#|like #noun#][noun=>#plural_noun#|#singular_noun#][plural_noun=>fruit flies][singular_noun=>fruit|a banana][plural_verb=>fly|like][singular_verb=>flies|likes]&json&parse#sentence#{fruit flies like a banana}', '[["root",["#sentence#",["alt",["#singular_noun#",["alt","fruit"]]," ",["#singular_verb#",["alt","flies"]]," ",["#prep_or_noun#",["alt","like ",["#noun#",["alt",["#singular_noun#",["alt","a banana"]]]]]]]]]]', {maxTries:maxTries})

  expectExpand ('[a=>#a#x|x]&json&parse#a#{xxxx}', '[["root",["#a#",["alt",["#a#",["alt",["#a#",["alt",["#a#",["alt","x"]],"x"]],"x"]],"x"]]]]')

  expectExpand ('[a=>xo#a#|x]&json&parse#a#{xoxoxox}', '[""]', {maxSubsequenceLength:1})
  expectExpand ('[a=>xo#a#|x]&json&parse#a#{xoxoxox}', '[["root",["#a#",["alt","xo",["#a#",["alt","xo",["#a#",["alt","xo",["#a#",["alt","x"]]]]]]]]]]', {maxSubsequenceLength:3})
  
  expectExpand ('[a=>#a#ox|x]&json&parse#a#{xoxoxox}', '[""]', {maxSubsequenceLength:1})
  expectExpand ('[a=>#a#ox|x]&json&parse#a#{xoxoxox}', '[["root",["#a#",["alt",["#a#",["alt",["#a#",["alt",["#a#",["alt","x"]],"ox"]],"ox"]],"ox"]]]]', {maxSubsequenceLength:3})

  expectExpand ('[a=>#b#|#c#][b=>cat|dog#a#][c=>horse|cow][d=>whatever|why]&grammar#a#', '[_start=>#_1#][_1=>#_2#][_2=>#_3#|#_4#][_3=>#_5#][_4=>#_6#][_5=>cat|dog#_1#][_6=>horse|cow]')
  expectExpand ('[a=>#b#|#c#][b=>cat|dog#a#][c=>horse|cow][d=>whatever|why]&grammar#d#', '[_start=>#_1#][_1=>#_2#][_2=>whatever|why]')
  expectExpand ('[a=>#b#|#c#][b=>cat|dog#a#][c=>horse|cow][d=>whatever|why]&grammar{#a# #a#}', '[_start=>#_1##_2#][_1=>#_3#][_2=> #_1#][_3=>#_4#|#_5#][_4=>#_6#][_5=>#_7#][_6=>cat|dog#_1#][_7=>horse|cow]')

  // test equivalency of &parse and &tree for a parse involving the elements our syntactic analyzer recognizes
  // these elements include:
  //  variable lookup ($c)
  //  variable expansion without bindings (&eval{$z})
  //  symbol get &xget{~c}
  //  symbol expansion &eval{&xget{~b}} which should be the same as remote call ~b
  //  Tracery-style #x# which is equivalent to &if{$x}{&eval{$x}}{~x}. Both variable and symbol expansion are tested with #x# and #a#, respectively.
  var defcatText = 'defcat'
  var defcatRules = {a:"d#x#",b:"e&eval$z",c:"c$c"}
  var defcatBracery = '[z:f&xget{~c}] [x=>~{b}t] $c=a'
  var defcatParse = JSON.stringify ([["root",["#a#","d",["#x#",["~b","e",["&$z","fc",["$c","a"]]],"t"]]]])

  expectExpand (defcatBracery + '#a#', defcatText, {rules:defcatRules})
  expectExpand (defcatBracery + '&json&tree{#a#}', defcatParse, {rules:defcatRules})
  expectExpand (defcatBracery + '&json&parse#a#{#a#}', defcatParse, {rules:defcatRules})

  // a more parse-tree varied example of the same test, exposes a different test case
  var defcatRules2 = {a:"d#x#t",b:"&eval{$z}c",c:"e$c"}
  var defcatBracery2 = '[z:&xget{~c}] [x=>~{b}a] $c=f'
  var defcatParse2 = JSON.stringify ([["root",["#a#","d",["#x#",["~b",["&$z","e",["$c","f"]],"c"],"a"],"t"]]])

  expectExpand (defcatBracery2 + '#a#', defcatText, {rules:defcatRules2})
  expectExpand (defcatBracery2 + '&json&tree{#a#}', defcatParse2, {rules:defcatRules2})
  expectExpand (defcatBracery2 + '&json&parse#a#{#a#}', defcatParse2, {rules:defcatRules2})

  // narrowed down to this case
  expectExpand ('[z:z] &json&parse#za##za#', '[["root",["#za#",["&$z","z"],"a"]]]', {rules:{za:"&eval{$z}a"}})
  expectExpand ('&quote{&eval{$z}a}', '&eval$za', {fail:true})  // bug
  expectExpand ('&quote{&eval{$z}a}', '&eval{$z}a')  // bug fixed

  // in &parse expressions, &call$x and &apply$x{} should be handled the same as &eval
  expectExpand ('[a=>cat|dog][b=>walk|whistle]&json&parse{&$a &apply{$b}{}}{cat walk}', '[["root",["&$a",["alt","cat"]]," ",["&$b",["alt","walk"]]]]')
  
  // down with fixed nonterminals
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'yo earthling', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'oy earthling', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'yo human', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'oy human', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'hello world', {maxTries:maxTries,fail:true})

  // dynamic function binding
  expectExpand ('~dynamo', 'dynamik', {maxTries:maxTries})
  expectExpand ('~dynamo', 'DYNAMIC', {maxTries:maxTries})

  expectExpand ('&~lambda{hi, }{!!!}', 'hi, world!!!')
  expectExpand ('$y=&cat{hi, }{!!!}&xapply~lambda$y', 'hi, world!!!')

  expectExpand ('$a=3 &~x{A}{B}', 'In x: a=3 1=A 2=B 0=AB', {rules:{x:["In x: a=$a 1=$$1 2=$$2 0=$$0"]}})
  expectExpand ('$x=&quote{In x: a=$a 1=$$1 2=$$2 0=$$0} $a=3 &$x{A}{B}', 'In x: a=3 1=A 2=B 0=AB')

  expectExpand ('~lambda', 'undefinedworldundefined')
  expectExpand ('&xapply~lambda{}', 'undefinedworldundefined')
  expectExpand ('&~lambda{}', 'worldundefined')
  expectExpand ('&~lambda{$undef}', 'worldundefined')

  // shorthands for &value and &list (precise generators)
  expectExpand ('&xapply~json{&{1}&{2}&{3}}', 'x="1" y="2" z="3"')
  expectExpand ('&xapply~json{1&{2}&{3}}', 'x="123" y=undefined z=undefined')
  expectExpand ('&xapply~json{&{1&{2}&{&{3}}}}', 'x="1" y=["2"] z=[["3"]]')
  expectExpand ('&xapply~json{&{1}&{&{2}}&{&{&{3}}}}', 'x="1" y=["2"] z=[["3"]]')
  expectExpand ('&xapply~json&list{1&{2}&{3}}', 'x="1" y=["2"] z=["3"]')

  expectExpand ('&json{&{&,a&,b&{&,c&,d}e&,f&,}}', '[["","a","b",["","c","d"],"e","f",""]]')
  expectExpand ('&json{&{a&,b&{&,c&,d}e&,f&,}}', '[["a","b",["","c","d"],"e","f",""]]')
  expectExpand ('&json{&{a&,b&{&,c&,d}e&,f}}', '[["a","b",["","c","d"],"e","f"]]')

  expectExpand ('&quotify{&{&,a&,b&{&,c&,d}&,e&,f&,}}', '&{&,a&,b&{&,c&,d}e&,f&,}')
  expectExpand ('&q{&{&,a&,b&{&,c&,d}&,e&,f&,}}', '&{&,a&,b&{&,c&,d}e&,f&,}')

  expectExpand ('$a=3 &value{{{[$a]}}}', '{{[3]}}')

  expectExpand ('$x=&{&{&q{ab}&q{cd}&q{ef}}&{&q{gh}&q{ij}&q{kl}}&{&q{mn}&q{op}&q{qr}}} $x', 'abcdefghijklmnopqr')
  expectExpand ('$x=&{&{&q{ab}&q{cd}&q{ef}}&{&q{gh}&q{ij}&q{kl}}&{&q{mn}&q{op}&q{qr}}} &nth{0}$x', 'abcdef')
  expectExpand ('$x=&{&{&q{ab}&q{cd}&q{ef}}&{&q{gh}&q{ij}&q{kl}}&{&q{mn}&q{op}&q{qr}}} &nth{1}&nth{0}$x', 'cd')
  
  // xget
  expectExpandQuote ('&quote&xget{~abc}', '&xget~abc')
  expectExpand ('&xget~abc', 'def')
  expectExpand ('&xget~world', '[world|planet]')
  
  // call, apply, function
  expectExpand ('$func=&function$first$second{0=&quotify$$0 1=$first 2=$second} &call{$func}{A}{B}', '0=&{A&,B} 1=A 2=B')
  expectExpand ('$func=&function{$first$second}{0=&quotify$$0 1=$first 2=$second} &call{$func}{A}{B}', '0=&{A&,B} 1=A 2=B')
  expectExpand ('$func=&function{$first,$second}{0=&quotify$$0 1=$first 2=$second} &call{$func}{A}{B}', '0=&{A&,B} 1=A 2=B')
  expectExpand ('$func=&function{}{here we go} &$func &$func', 'here we go here we go')
  expectExpand ('$func=&function{here we go} &$func &$func', '=&function{here we go}  ')
  expectExpand ('$func=&function$first$second{0=&quotify$$0 1=$first 2=$second} $y=&{one&,two} &apply{$func}$y', '0=&{one&,two} 1=one 2=two')

  expectExpand ('&function$first$second{1=$first 2=$second}', '&let$first={$$1}{&let$second={$$2}{1=$first 2=$second}}')
  expectExpand ('$x=99 &function$first$second{1=$first 2=$second x=$x}', '&let$first={$$1}{&let$second={$$2}{1=$first 2=$second x=$x}}')
  expectExpand ('$x=99 &function$first$second{1=$first 2=$second x=&unquote$x}', '&let$first={$$1}{&let$second={$$2}{1=$first 2=$second x=99}}')

  expectExpand ('[a=>cat|cat]&apply$a{}', 'cat')
  expectExpand ('&apply&quote{x=$$1 y=$$2}&split{3 4}', 'x=3 y=4')
  expectExpand ('&apply&quote{x=$$1 y=$$2}{3 4}', 'x=3 4 y=')

  expectExpand ('&quote{&call$f{A}{B}}', '&call$f{A}{B}')
  
  // regexes
  expectExpand ('&match/a/{cat}{$$0$$0}', 'aa')
  expectExpand ('&quotify&match/[aeiou]/g{generic}{&uc$$0}', '&{E&,E&,I}')
  expectExpand ('&replace/a/g{catamaran}{u|o}', 'cutomoron', {maxTries:maxTries})
  expectExpand ('&join&split/[aeiou]+/{felicitous}{..}', 'f..l..c..t..s')
  expectExpand ('&join&split{a   bc   d}{,}', 'a,bc,d')
  expectExpand ('&join&map&split{a bc def}{"$_"}{, }', '"a", "bc", "def"')

  expectExpand ('&grep/a/&split{cat dog man lizard}', 'catmanlizard')

  // math
  expectExpand ('$a=4 $d=3 $b=5 $c=2 &math{($a * $d) - $b + $c}', '9')
  expectExpand ('$a=4 $d=3 $b=5 $c=2 &math{&value{zero} + ($a * $d) - $b + $c}', 'nine')
  expectExpand ('$a=4 $d=3 $b=5 $c=2 &math{0.2*$a+$b}', '5.8')
  expectExpand ('&quote&math{  (   $a  *   $d    )-$b+$c  }', '&math{($a * $d) - $b + $c}')

  expectExpand ('&math{.5}', '0.5')
  expectExpand ('&math{0.5}', '0.5')

  // link
  expectExpand ('$x=3 &link{test$x}{$x}{$x}', '&link{test3}{3}{$x}')
  expectExpand ('&quote&link{test}{$x}{$x}', '&link{test}$x$x')
  expectExpand ('$x=3 &link{test}{$x}{$x}', 'test:3==>$x', {makeLink:function(type,text,link){return type.text+':'+text.text+'==>'+link.text}})
  
  // charclass, alt
  expectExpand ('&charclass{abc}', '[a|b|c]')
  expectExpand ('&charclass{a-e}', '[a|b|c|d|e]')
  expectExpand ('&charclass{a-ej}', '[a|b|c|d|e|j]')

  expectExpand ('&charclass{a\\\\-j\\|\\\\}', '[a|-|j|\\||\\\\]')
  expectExpand ('&eval&charclass{a\\\\-j\\|\\\\}', 'a', {maxTries:maxTries})
  expectExpand ('&eval&charclass{a\\\\-j\\|\\\\}', '-', {maxTries:maxTries})
  expectExpand ('&eval&charclass{a\\\\-j\\|\\\\}', 'j', {maxTries:maxTries})
  expectExpand ('&eval&charclass{a\\\\-j\\|\\\\}', '|', {maxTries:maxTries})
  expectExpand ('&eval&charclass{a\\\\-j\\|\\\\}', '\\', {maxTries:maxTries})

  expectExpand ('&alt&list{&split{all your base}&split{are belong to us}}', '[[all|your|base]|[are|belong|to|us]]')

  expectExpand ('$b=&charclass{ -x}[a=>#a##b##a#|cat]&json&parse#a#{cat cat}', '[["root",["#a#",["alt",["#a#",["alt","cat"]],["#b#",["alt"," "]],["#a#",["alt","cat"]]]]]]')
  expectExpand ('[a=>#a#&unquote&charclass{ -x}#a#|cat]&json&parse#a#{cat cat}', '[["root",["#a#",["alt",["#a#",["alt","cat"]],["alt"," "],["#a#",["alt","cat"]]]]]]')

  // if
  expectExpand ('$x=1 &if$x{hello} there', 'hello there')
  expectExpand ('$x=1 &if&not$x{hello} there', ' there')
  expectExpand ('$x=1 &if&not$x{hello}{hi} there', 'hi there')

  // prob
  expectExpand ('&prob{.5}{a}{b}', 'a', {maxTries:maxTries})
  expectExpand ('&prob{.5}{a}{b}', 'b', {maxTries:maxTries})

  expectExpand ('~coinflip', 'heads', {maxTries:maxTries})  // test bug that occurred when &random was permanently cached when called from a user-defined symbol, so future results were always the same
  expectExpand ('~coinflip', 'tails', {maxTries:maxTries})

  // wrapper for individual 'for a given input (lhs), expect the following output (rhs)'-style tests
  // (lhs/rhs = left/right hand side)
  function expectExpand (lhs, rhs, config) {
    var fail = config && config.fail
    function verify (text, done) {
      text = bracery.ParseTree.makeString (text)
      if (fail)
        assert.notEqual (text, rhs)
      else
        assert.equal (text, rhs)
      done()
    }
    it('should expand ' + (lhs || 'the empty string').replace(/\n/g,'\\n') + ' to ' + (rhs || 'the empty string').replace(/\n/g,'\\n')
       + (config ? (' with ' + JSON.stringify(config)) : ''),
       testRunner (lhs, rhs, extend ({ enableParse: true }, config), verify))
  }

  // wrapper for quote/quasiquote equivalence tests
  function expectExpandQuote (lhs, rhs, config) {
    expectExpand (lhs, rhs, config)
    expectExpand (lhs.replace(/&quote/g,'&strictquote'), rhs, config)
  }
}

// initialization test
describe('initialization', function() {
  it('should initialize', function (done) {
    b = new bracery.Bracery (initJson)
    done()
  })
  it('should have ' + nTestSymbols + ' rules', function (done) {
    assert.equal (Object.keys(b.rules).length, nTestSymbols)
    done()
  })
})

// wrappers for different groups of tests
describe('synchronous tests', function() {
  doTests (function (lhs, rhs, config, verify) {
    var maxTries = (config && config.maxTries) || 1
    return function (done) {
      var text
      for (var n = 0; text !== rhs && n < maxTries; ++n)
        text = b.expand (lhs, config).text
      verify (text, done)
    }
  })
})

describe('asynchronous tests', function() {
  doTests (function (lhs, rhs, config, verify) {
    var maxTries = (config && config.maxTries) || 1
    return function (done) {
      function tryExpand (n) {
        n = n || 0
        b.expand (lhs,
                  extend
                  ({},
                   config,
                   { callback: function (expansion) {
                     var text = bracery.ParseTree.makeString (expansion.text)
                     if (text !== rhs && n < maxTries)
                       tryExpand (n + 1)
                     else
                       verify (text, done)
                   } }))
      }
      tryExpand()
    }
  })
})

describe('idempotent double expansion tests', function() {
  doTests (function (lhs, rhs, config, verify) {
    var maxTries = (config && config.maxTries) || 1
    return function (done) {
      var expand
      var b2 = config && config.rules ? new bracery.Bracery(config.rules) : b
      var config2 = extend ({}, config, {rules:null})
      for (var n = 0; !(expand && expand.text === rhs) && n < maxTries; ++n)
        expand = b2.expand (lhs, config2)
      var text = bracery.ParseTree.makeRhsExpansionText (extend ({ rhs: expand.tree },
                                                                 b2.makeConfig (config2)))
      verify (text, done)
    }
  })
})
