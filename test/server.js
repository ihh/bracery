var assert = require('assert')

var child_process = require('child_process')
var execSync = child_process.execSync
var spawn = child_process.spawn

var bracery = require('../index')

var initJson = { abc: 'def',
                 hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 test1: 'testing',
                 test2: '$TEST1',
                 test3: 'x$test3',
                 test4: '&quote{$TEST1}' }

var binPath = 'bin/bracery'
var port = 8001
describe('client/server tests (' + binPath + ')', function() {
  // client/server test
  testServer ('$abc', 'def')
//  testServer ('&cap{$test3}', 'Xxx')
})

function makeCmdLine (config, initJson, opts, lhs) {
  var cmdline = [process.argv[0],
                 __dirname + '/../' + binPath]
      .concat (config ? ['-c',JSON.stringify(config || {})] : [])
      .concat (initJson ? ['-s', JSON.stringify(initJson)] : [])
      .concat (opts ? opts : [])
      .concat (lhs ? ["'" + lhs + "'"] : [])
  return cmdline
}

function execCmd (cmd) {
  var text = execSync(cmd.join(' '),{stdio:['pipe','pipe',process.env.TRAVIS ? 'pipe' : 'ignore']}).toString()
  text = text.substr (0, text.length - 1)  // chop off newline
  return text
}

function spawnCmd (cmd) {
  return spawn (cmd[0], cmd.slice(1))
}

function testServer (lhs, rhs) {
  it('should expand ' + lhs + ' to ' + rhs
     + ' by connecting to a local server',
     function (done) {
       var serverCmd = makeCmdLine (null, initJson, ['-S', port], null)
       var proc = spawnCmd (serverCmd)
       var clientCmd = makeCmdLine (null, null, ['-C', port], lhs)
       var text = execCmd (clientCmd)
       proc.kill('SIGINT')
       assert.equal (text, rhs)
       done()
     })
}
