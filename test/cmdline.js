var assert = require('assert')
var execSync = require('child_process').execSync

var bracery = require('../index')

var initJson = { hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 test1: 'testing',
                 test2: '$TEST1',
                 test3: 'x$test3',
                 test4: '&quote{$TEST1}' }

var binPath = 'bin/bracery'
describe('command-line tests', function() {
  // simple expansions
  expectExpand ('$test1', 'testing')
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
  expectExpand ('&quote{$TEST1}', '$TEST1')

  // compromise
  expectExpand ('&future{love}', 'will love')
})

function expectExpand (lhs, rhs, config) {
  var fail = config && config.fail
  if (fail) delete config.fail
  if (config && Object.keys(config).length === 0)
    config = null
  it('should ' + (fail ? 'not ' : '') + 'expand ' + lhs + ' to ' + rhs
     + (config ? (' with ' + JSON.stringify(config)) : ''),
     function (done) {
       var cmdline = binPath + " -c '" + JSON.stringify(config || {}) + "' -s '" + JSON.stringify(initJson) + "' '" + lhs + "'"
       var text = execSync(cmdline,{stdio:['pipe','pipe','ignore']}).toString()
       text = text.substr (0, text.length - 1)  // chop off newline
       if (fail)
         assert.notEqual (text, rhs)
       else
         assert.equal (text, rhs)
       done()
     })
}

