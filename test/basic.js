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
       for (var n = 0; text !== rhs && n < maxTries; ++n)
         text = b.expand (lhs, config).text
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

  // simple expansions
  expectExpand ('$test1', 'testing')
  expectExpand ('$test2', 'TESTING')

  // look out! recursion
  expectExpand ('$test3', 'xxx')
  expectExpand ('$test3', 'xxxxx', { maxRecursionDepth: 5 })

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
})

