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
       assert.equal (b.expand (lhs, config).text, rhs)
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
  expectExpand ('$test1', 'TESTING')
  expectExpand ('$test2', 'TESTING')
  expectExpand ('$test3', 'xxx')
  expectExpand ('$test3', 'xxxxx', { maxRecursionDepth: 5 })
  expectExpand ('$test4', '$test1')
  expectExpand ('&eval{$test4}', 'TESTING')
  expectExpand ('&quote{$test1}', '$test1')
  expectExpand ('^x={aha}^x', 'aha')
})

