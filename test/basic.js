var assert = require('assert')
var bracery = require('../index')
var extend = bracery.ParseTree.extend
  
var initJson = { abc: 'def',
                 hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 test1: 'testing',
                 test2: '$TEST1',
                 test3: 'x$test3',
                 test4: '&quote{$TEST1}' }

var nTestSymbols = Object.keys(initJson).length

var b
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
                     var text = expansion.text
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

function doTests (testRunner) {
  var maxTries = 100
  function expectExpand (lhs, rhs, config) {
    var fail = config && config.fail
    function verify (text, done) {
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

  // push & pop
  expectExpand ('^a={x}^a&push{^a}^a={y}^a&pop{^a}^a', 'xyx')
  expectExpand ('^a={x}^a&push{^a}^a={y}^a&push{^a}^a={z}^a&pop{^a}^a&pop{^a}^a', 'xyzyx')
  expectExpand ('^a={x}^b={X}^a^b&push{^a^b}^a={y}^b={Y}^a^b&pop{^a^b}^a^b', 'xXyYxX')
  expectExpand ('^a={x}&pop{^a}^a', '')

  expectExpand ('^a={x}^a&push{^a}^a={y}^a&let^a={z}{^a!&pop{^a}^a}^a&pop{^a}^a', 'xyz!yx')
  expectExpand ('^a...&let^a={x}{^a&push{^a}^a={y}^a&push{^a}^a={z}^a&pop{^a}^a}!^a&pop{^a}?^a', '...xyzy!?')

  expectExpand ('^a={x}^a&push{^a}^a={y}^a&unshift{^a}^a={z}^a&pop{^a}^a&pop{^a}^a', 'xyzxy')
  expectExpand ('^a={x}^a&push{^a}^a={y}^a&unshift{^a}^a={z}^a&shift{^a}^a&shift{^a}^a', 'xyzyx')

  // strip
  expectExpand ('&strip{hello}{hello world hello}', ' world ')
  expectExpand ('&strip{$abc}{defcon}', 'con')
  expectExpand ('${abc}', 'def')
  expectExpand ('${abc}con', 'defcon')
  expectExpand ('${abc}con', 'defcon')
  expectExpand ('&strip{$abc}{${abc}con}', 'con')
  expectExpand ('&strip{$abc}{${abc}con defcon}', 'con con')
  
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
}

