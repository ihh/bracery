var assert = require('assert')
var execSync = require('child_process').execSync

var bracery = require('../index')

var initJson = { abc: 'def',
                 hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 test1: 'testing',
                 test2: '$TEST1',
                 test3: 'x$test3',
                 test4: '&quote{$TEST1}' }

var binPath = 'bin/bracery'
describe('command-line tests (' + binPath + ')', function() {
  // simple expansions
  expectExpand ('$test1', 'testing')
  expectExpand ('$test2', 'TESTING')

  // config
  expectExpand ('$test3', 'xxx')
  expectExpand ('$test3', 'xxxx', { maxDepthForExpr: 4 })

  // quoting
  expectExpand ('&eval{$test4}', 'TESTING')
  expectExpand ('&quote{$Test1}', '$Test1')

  // compromise
  expectExpand ('&future{love}', 'will love')

  // command-line options
  expectExpand ('hello', '['+JSON.stringify({text:'hello',vars:{},tree:['hello']},null,2)+']', { opts: '--tree' })
  expectExpand ('$test1', '[{"text":"testing","vars":{},"tree":[{"type":"sym","name":"test1","rhs":["testing"]}]}]', { opts: '--compact-tree' })
  expectExpand ('$test4', '$TEST1', { opts: '--async' })
})

function expectExpand (lhs, rhs, config) {
  var fail = config && config.fail
  if (fail) delete config.fail
  if (config && Object.keys(config).length === 0)
    config = null
  it('should ' + (fail ? 'not ' : '') + 'expand ' + (lhs || 'the empty string') + ' to ' + rhs.replace(/\s+/g,function(){return' '})
     + (config ? (' with ' + JSON.stringify(config)) : ''),
     function (done) {
       var cmdline = binPath + " -c '" + JSON.stringify(config || {}) + "' -s '" + JSON.stringify(initJson) + "'"
           + (config && config.opts ? (' ' + config.opts) : '')
           + " '" + lhs + "'"
       var text = execSync(cmdline,{stdio:['pipe','pipe','ignore']}).toString()
       text = text.substr (0, text.length - 1)  // chop off newline
       if (fail)
         assert.notEqual (text, rhs)
       else
         assert.equal (text, rhs)
       done()
     })
}

