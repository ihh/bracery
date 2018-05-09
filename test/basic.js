var bracery = require('../index')
var assert = require('assert')

var initJson = { hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 test1: 'testing',
                 test2: '$TEST1',
                 test3: 'x$test3',
                 test4: '&quote{$TEST1}' }

var nTestSymbols = Object.keys(initJson).length

var b
function expectExpand (lhs, rhs, config) {
  it('should expand ' + lhs + ' to ' + rhs
     + (config ? (' with ' + JSON.stringify(config)) : ''),
     function (done) {
       var text
       var maxTries = (config && config.maxTries) || 1
       var fail = config && config.fail
       for (var n = 0; text !== rhs && n < maxTries; ++n)
         text = b.expand (lhs, config).text
       if (fail)
         assert.notEqual (text, rhs)
       else
         assert.equal (text, rhs)
       done()
     })
}

describe('basic test', function() {
  it('should initialize', function (done) {
    b = new bracery.Bracery (initJson)
    done()
  })
  it('should have ' + nTestSymbols + ' rules', function (done) {
    assert.equal (Object.keys(b.rules).length, nTestSymbols)
    done()
  })
  var maxTries = 100
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

  // look out! recursion
  expectExpand ('$test3', 'xxx')
  expectExpand ('$test3', 'xxx', { maxDepth: 5 })
  expectExpand ('$test3', 'xxxxx', { maxDepth: 5, maxDepthForExpr: 10 })
  expectExpand ('$test3', 'xxxxx', { maxDepthForExpr: 5 })

  // quoting
  expectExpand ('$test4', '$TEST1')
  expectExpand ('&eval{$test4}', 'TESTING')
  expectExpand ('&quote{$test1}', '$test1')
  expectExpand ('\\$test1', '$test1')

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
  expectExpand ('^a={a}^b={^{a}b^a}^ab=&quote{^a^b}#[a:3^b][b:5^a]ab#^a^b', '3aba53abaaaba')

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
})

