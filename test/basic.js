var bracery = require('../index')
var assert = require('assert')

var initJson = { hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 test1: 'TESTING',
                 test2: '$test1',
                 test3: 'x$test3',
                 test4: '&quote{$test1}' }

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
  expectExpand ('$test1', 'TESTING')
  expectExpand ('$test2', 'TESTING')

  // look out! recursion
  expectExpand ('$test3', 'xxx')
  expectExpand ('$test3', 'xxxxx', { maxRecursionDepth: 5 })

  // quoting
  expectExpand ('$test4', '$test1')
  expectExpand ('&eval{$test4}', 'TESTING')
  expectExpand ('&quote{$test1}', '$test1')
  expectExpand ('\\$test1', '$test1')

  // variables
  expectExpand ('^x={aha}^x', 'aha')
  expectExpand ('#test1#', 'TESTING')

  // Tracery-style overriding
  expectExpand ('^test1={OVERLOAD}#test1#', 'OVERLOAD')
  expectExpand ('^test1={OVERLOAD}$test1', 'TESTING')
  expectExpand ('^test1={$test4}#test1#', 'TESTING')

})

