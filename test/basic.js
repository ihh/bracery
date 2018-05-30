var assert = require('assert')
var bracery = require('../index')
var extend = bracery.ParseTree.extend

// initial grammar
var initJson = { abc: 'def',
                 hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 dynamo: function (config) { return [config.random() < .5 ? 'dynamik' : 'DYNAMIC'] },
                 test1: 'testing',
                 test2: '$TEST1',
                 test3: 'x$test3',
                 test4: '&quote{$TEST1}' }

var nTestSymbols = Object.keys(initJson).length  // number of symbols in initial grammar

var b  // the Bracery object

// tests
function doTests (testRunner) {
  // test parameters
  var maxTries = 100

  // the tests themselves
  expectExpand ('$hello $world', 'hello world', {maxTries:maxTries})
  expectExpand ('$hello $world', 'hello planet', {maxTries:maxTries})
  expectExpand ('$hello $world', 'hi world', {maxTries:maxTries})
  expectExpand ('$hello $world', 'hi planet', {maxTries:maxTries})
  expectExpand ('$hello $world', 'yo earth', {maxTries:maxTries,fail:true})

  // simple expansions
  expectExpand ('$test1', 'testing')
  expectExpand ('$test1', 'testings', {fail:true})
  expectExpand ('$test1', 'TESTING', {fail:true})
  expectExpand ('$test2', 'TESTING')

  // default is to expand $abc to 'def', as that is the alphabetically earliest symbol
  expectExpand ('', 'def')

  // look out! recursion
  expectExpand ('$test3', 'xxx')
  expectExpand ('$test3', 'xxx', { maxDepth: 5 })
  expectExpand ('$test3', 'xxxxx', { maxDepth: 5, maxRecursion: 10 })
  expectExpand ('$test3', 'xxxx', { maxRecursion: 4 })
  expectExpand ('$test3', 'xxxxxxxxxx', { maxRecursion: 10 })
  expectExpand ('$test3 $test3 $test3', 'xxxxxxxxxx xxxxxxxxxx xxxxxxxxxx', { maxRecursion: 10 })
  expectExpand ('$test3', 'xxxxxxxxxx', { maxRecursion: 10, maxLength: 5 })
  expectExpand ('$test3 $test3 $test3', 'xxxxxxxxxx', { maxRecursion: 10, maxLength: 5 })
  expectExpand ('$test3 $test3 $test3', 'xxxxxxxxxx xxxxxxxxxx', { maxRecursion: 10, maxLength: 15 })
  expectExpand ('$test3 $test3 $test3', 'xxxxxxxxxx', { maxRecursion: 10, maxNodes: 5 })
  
  // quoting
  expectExpand ('$test4', '$TEST1')
  expectExpand ('&eval{$test4}', 'TESTING')
  expectExpand ('&quote{$test1}', '$test1')
  expectExpand ('\\$test1', '$test1')
  expectExpand ('$', '$')
  expectExpand ('&quote{$}', '\\$')
  expectExpand ('&quote{$}test1', '\\$test1')
  expectExpand ('&quote{$te}st1', '$test1')
  expectExpand ('&quote{$test1}', '$test1')
  expectExpand ('&eval{&quote{$}}', '$')
  expectExpand ('&eval{&quote{$test1}}', 'testing')
  expectExpand ('&eval{&quote{$te}st1}', 'testing')
  expectExpand ('&eval{&quote{$}test1}', 'testing', {fail:true})
  expectExpand ('&eval{&quote{$}test1}', '$test1')
  expectExpand ('&eval{&eval{&quote{$}test1}}', 'testing')
  expectExpand ('\\$test1', '$test1')
  expectExpand ('&eval{\\$test1}', 'testing')
  expectExpand ('&quote{#heroPet#}', '#heroPet#')
  expectExpand ('&quote[a=>b]', '^a={&quote{b}}')
  expectExpand ('&quote[a=>b|c]', '^a={&quote[b|c]}')
  expectExpand ('^heropet={freddy}&eval&quote{#heroPet#}', 'freddy')
  
  // case manipulation
  expectExpand ('&quote{$TEST1}', '$TEST1')
  expectExpand ('&quote{$Test1}', '$Test1')
  expectExpand ('$TEST1', 'TESTING')
  expectExpand ('$Test1', 'Testing')
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
  expectExpand ('^x={aha}^x', 'aha')
  expectExpand ('[x:aha]^x', 'aha')
  expectExpand ('^z={zebedee}^zeb={zebadiah}^Zeb ^Z', 'Zebadiah ZEBEDEE')
  expectExpand ('^AbC={air}^aBC={hair}^abC={lair}^abc^Abc^ABC', 'lairLairLAIR')

  // Tracery variables
  expectExpand ('[myvar:myval]', '')
  expectExpand ('[myvar:myval]^myvar', 'myval')
  expectExpand ('[myvar:myval]#myvar#', 'myval')
  expectExpand ('[myvar=>myval]^myvar', 'myval')
  expectExpand ('[myvar=>myval]#myvar#', 'myval')
  expectExpand ('[myvar=>myval1|myval2]^myvar', '[myval1|myval2]')
  expectExpand ('[myvar=>myval1|myval2]#myvar#', 'myval1', {maxTries:maxTries})
  expectExpand ('[myvar=>myval1|myval2]#myvar#', 'myval2', {maxTries:maxTries})

  // Tracery modifiers
  expectExpand ('#test1#', 'testing')
  expectExpand ('#test1.capitalize#', 'Testing')
  expectExpand ('#test1.capitalizeAll#', 'TESTING')

  // Tracery-style overriding
  expectExpand ('^test1={OVERLOAD}#test1#', 'OVERLOAD')
  expectExpand ('[test1:OVERLOAD]#test1#', 'OVERLOAD')
  expectExpand ('^test1={OVERLOAD}$test1', 'testing')
  expectExpand ('^test1={$test4}#test1#', 'TESTING')

  // local scope
  expectExpand ('^a={A}^b={B}^a^b&let^a={x}^b={y}{^a^b}^a^b', 'ABxyAB')
  expectExpand ('^a={A}^b={B}^a^b&let ^a={x}  ^b={y}  {^a^b}^a^b', 'ABxyAB')
  expectExpand ('^a={a}^b={^{a}b^a}^ab=&quote{^a^b}#[a:3^b][b:5^a]ab#^a^b', '3aba53abaaaba')
  
  // variable persistence
  var vars = {}
  expectExpand ('^a={x}^a', 'x', {vars:vars})
  expectExpand ('^a', '')
  expectExpand ('^a', 'x', {vars:vars,a_equals_x:true})

  // lists
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
  expectExpand ('^list={&prepend{123}&cat{xyz}{abc}}&first^list', '123')
  expectExpand ('^list={&prepend&cat{xyz}{abc}{123}}&first^list', 'xyzabc')
  expectExpand ('^list={&prepend{123}&cat{xyz}{abc}}&last^list', 'abc')
  expectExpand ('^list={&prepend&cat{xyz}{abc}{123}}&last^list', '123')

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

  expectExpand ('^x=&list{&string{abc}&string{def}}&map^a^x{^a!}', 'abc!def!')
  expectExpand ('^x=&list{&string{abc}&string{def}}&join&map^a^x{^a!}{ }', 'abc! def!')

  expectExpand ('^x=&list{&string{2}&string{4}&string{6}&string{0}}&filter^n^x&gt{^n}{3}', '46')
  expectExpand ('^x=&list{&string{2}&string{4}&string{6}&string{0}}&reduce^n^x^r={0}&add^n^r', '12')
  expectExpand ('^x=&list{&string{2}&string{4}&string{6}&string{0}}&reduce^n:^x^r={zero dogs}&add^r^n', 'twelve dogs')
  
  // strip
  expectExpand ('&strip{hello}{hello world hello}', ' world ')
  expectExpand ('&strip{$abc}{defcon}', 'con')
  expectExpand ('${abc}', 'def')
  expectExpand ('${abc}con', 'defcon')
  expectExpand ('${abc}con', 'defcon')
  expectExpand ('&strip{$abc}{${abc}con}', 'con')
  expectExpand ('&strip{$abc}{${abc}con defcon}', 'con con')

  expectExpand ('^b={b}^x={Batch}^y=&strip&strip^b{abc}&strip{t}^x^y', 'Bh')

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
  expectExpand ('^a={$}^b={test}^c={1}&eval{^a&cap{^b}^c}', 'Testing')
  expectExpand ('^a={1}^b={2}^c={3}&let^a={$}^b={test}^c={1}&eval{^a&cap{^b}^c}^a&cap{^b}^c', 'Testing123')
  expectExpand ('^a={1}^b={2}^c={3}&let^a={$}^b={test}^c={1}{&eval{^a&cap{^b}^c}}^a&cap{^b}^c', 'Testing123')
  expectExpand ('^a={1}^b={2}^c={3}&let^a={$}^b={test}^c={1}{&eval{^a&cap{^b}^c}^a&cap{^b}^c}', 'Testing$Test1')

  // down with fixed nonterminals
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'yo earthling', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'oy earthling', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'yo human', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'oy human', {maxTries:maxTries})
  expectExpand ('[hello:&quote[yo|oy]][world:&quote[earthling|human]]#hello# #world#', 'hello world', {maxTries:maxTries,fail:true})

  // dynamic function binding
  expectExpand ('$dynamo', 'dynamik', {maxTries:maxTries})
  expectExpand ('$dynamo', 'DYNAMIC', {maxTries:maxTries})

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
    it('should expand ' + (lhs || 'the empty string') + ' to ' + (rhs || 'the empty string')
       + (config ? (' with ' + JSON.stringify(config)) : ''),
       testRunner (lhs, rhs, config, verify))
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

describe('double expansion tests', function() {
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
