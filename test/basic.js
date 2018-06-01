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

  expectExpandQuote ('&quote{~hello{abc}{def}}', '~hello{abc}{def}')
  expectExpand ('&quote&quote{~hello{abc}{def}}', '&quote{~hello{abc}{def}}')

  expectExpandQuote ('&quote{&~{ lambda }{$y}}', '&~lambda$y')
  
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

  expectExpand ('&gt{three cats}{2}', 'three cats')
  expectExpand ('&gt{three cats}{4}', '')
  expectExpand ('&lt{three cats}{2}', '')
  expectExpand ('&lt{three cats}{4}', 'three cats')
  expectExpand ('&eq{three cats}{3}', 'three cats')
  expectExpand ('&eq{three cats}{4}', '')
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

  // variables
  expectExpand ('$x={aha}$x', 'aha')
  expectExpand ('$x=aha $x', 'aha')
  expectExpand ('$x:=aha', 'aha')
  expectExpand ('$x:=o h$x', 'oho')
  expectExpand ('[x:aha]$x', 'aha')
  expectExpand ('[x:aha]\n\n$x', '\n\naha')
  expectExpand ('[x:aha]\n\n$x\n\n$x', '\n\naha\n\naha')
  expectExpand ('[x=>aha]\n\n$x', 'aha')
  expectExpand ('[x=>aha|aha]\n\n$x', '[aha|aha]')
  expectExpand ('[x=>aha|aha]\n\n#x#', 'aha')
  expectExpand ('$x=aha\n\n$x', 'aha')
  expectExpand ('$x=aha\n\n$x\n\n$x', 'aha\n\naha')
  expectExpand ('$z={zebedee}$zeb={zebadiah}$Zeb $Z', 'Zebadiah ZEBEDEE')
  expectExpand ('$AbC={air}$aBC={hair}$abC={lair}$abc$Abc$ABC', 'lairLairLAIR')

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
  expectExpand ('{}', '')
  expectExpand ('&cat{{}}{xyz}', 'xyz')
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

  expectExpand ('&islist{{}}', '[]')
  expectExpand ('&islist{}', '')
  expectExpand ('&same{{}}{}', '')
  expectExpand ('&same{{}}{{}}', '1')

  expectExpand ('&join{{}x{}y}{,}', 'x,y')
  expectExpand ('&join{x{}y{}}{,}', 'xy')

  expectExpand ('$x=&list{&quote{abc}&quote{def}}&map$a$x{$a!}', 'abc!def!')
  expectExpand ('$x=&list{&quote{abc}&quote{def}}&join&map$a$x{$a!}{ }', 'abc! def!')

  expectExpand ('$x=&list{&quote{2}&quote{4}&quote{6}&quote{0}}&filter$n$x&gt{$n}{3}', '46')
  expectExpand ('$x=&list{&quote{2}&quote{4}&quote{6}&quote{0}}&reduce$n$x$r={0}&add$n$r', '12')
  expectExpand ('$x=&list{&quote{2}&quote{4}&quote{6}&quote{0}}&reduce$n:$x$r={zero dogs}&add$r$n', 'twelve dogs')

  expectExpand ('$x={1}$a1={verily}$a2={in troth}&eval&quote{$a&unquote$x indeed}', 'verily indeed')
  expectExpand ('&quote&unquote&quote&infinitive$y', '&infinitive$y')

  expectExpand ('$x={{}abc&quote{def}}&quotify$x', '&list{&value{abc}&value{def}}')

  expectExpand ('&push$x{a}&push$x{b}&uc&push$x{c}&push$x{...}&join$x{,} &shift$x $dots:=&pop$x $quirk:=uh, &shift$x $dots &unshift$x&cat{x}{t} &uc&join$x$dots',
                'a,b,c,... a ... uh,b ... X...T...C')  // a lot going on in this one. Spaces must be exactly correct (of course)
  expectExpand ('$x=5 &inc$x x=$x $x=10 &dec$x x=$x', 'x=6 x=9')  // note exact spaces

  // strip
  expectExpand ('&strip{hello}{hello world hello}', ' world ')
  expectExpand ('&strip{~abc}{defcon}', 'con')
  expectExpand ('~{abc}', 'def')
  expectExpand ('~{abc}con', 'defcon')
  expectExpand ('~{abc}con', 'defcon')
  expectExpand ('&strip{~abc}{~{abc}con}', 'con')
  expectExpand ('&strip{~abc}{~{abc}con defcon}', 'con con')

  expectExpand ('$b={b}$x={Batch}$y=&strip&strip$b{abc}&strip{t}$x$y', 'Bh')

  // same, and, not
  expectExpand ('&same{abc}{def}', '')
  expectExpand ('&same{abc}{abc}', 'abc')

  expectExpand ('&and{ }{world}', '')
  expectExpand ('&and{hello}{  }', '')
  expectExpand ('&and{hello}{world}', 'helloworld')

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

  // down with fixed nonterminals
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'yo earthling', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'oy earthling', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'yo human', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'oy human', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'hello world', {maxTries:maxTries,fail:true})

  // dynamic function binding
  expectExpand ('~dynamo', 'dynamik', {maxTries:maxTries})
  expectExpand ('~dynamo', 'DYNAMIC', {maxTries:maxTries})

  expectExpand ('~lambda{hi, }{!!!}', 'hi, world!!!')
  expectExpand ('$y=&cat{hi, }{!!!}&~lambda$y', 'hi, world!!!')

  expectExpand ('~lambda', 'undefinedworldundefined')
  expectExpand ('&~lambda{}', 'undefinedworldundefined')
  expectExpand ('~lambda{}', 'worldundefined')
  expectExpand ('~lambda{$undef}', 'worldundefined')

  expectExpand ('&~json{{1}{2}{3}}', 'x="1" y="2" z="3"')
  expectExpand ('&~json{1{2}{3}}', 'x="123" y=undefined z=undefined')
  expectExpand ('&~json{{1{2}{{3}}}}', 'x="1" y=["2"] z=[["3"]]')
  expectExpand ('&~json{{1}{{2}}{{{3}}}}', 'x="1" y=["2"] z=[["3"]]')
  expectExpand ('&~json&list{1{2}{3}}', 'x="1" y=["2"] z=["3"]')

  // shorthand for &value and &list (precise generators)
  expectExpand ('&quotify{{&{a}&{b}{&{c}&{d}}e&{f}}}', '&list{&value{a}&value{b}&list{&value{c}&value{d}}&value{e}&value{f}}')

  // call, apply, function
  expectExpand ('$func=&function$first$second{0=&quotify$$0 1=$first 2=$second} &call{$func}{A}{B}', ' 0=&list{&value{A}&value{B}} 1=A 2=B')
  expectExpand ('$func=&function$first$second{0=&quotify$$0 1=$first 2=$second} $y=&list{&value{one}&value{two}} &apply{$func}$y', '  0=&list{&value{one}&value{two}} 1=one 2=two')

  expectExpand ('&function$first$second{1=$first 2=$second}', '&let$first={$$1}{&let$second={$$2}{1=$first 2=$second}}')
  expectExpand ('$x=99 &function$first$second{1=$first 2=$second x=$x}', '&let$first={$$1}{&let$second={$$2}{1=$first 2=$second x=$x}}')
  expectExpand ('$x=99 &function$first$second{1=$first 2=$second x=&unquote$x}', '&let$first={$$1}{&let$second={$$2}{1=$first 2=$second x=99}}')

  // regexes
  expectExpand ('&match/a/{cat}{$$0$$0}', 'aa')
  expectExpand ('&quotify&match/[aeiou]/g{generic}{&uc$$0}', '&list{&value{E}&value{E}&value{I}}')
  expectExpand ('&replace/a/g{catamaran}{u|o}', 'cutomoron', {maxTries:maxTries})
  expectExpand ('&join&split/[aeiou]+/{felicitous}{..}', 'f..l..c..t..s')
  expectExpand ('&join&split{a   bc   d}{,}', 'a,bc,d')
  expectExpand ('&join&map&split{a bc def}{"$_"}{, }', '"a", "bc", "def"')
  
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
       testRunner (lhs, rhs, config, verify))
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
      for (var n = 0; !(expand && expand.text === rhs) && n < maxTries; ++n)
        expand = b.expand (lhs, config)
      var text = bracery.ParseTree.makeRhsExpansionText (extend ({ rhs: expand.tree },
                                                                 config))
      verify (text, done)
    }
  })
})
