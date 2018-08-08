var assert = require('assert')
var execSync = require('child_process').execSync
var fs = require('fs')
var tmp = require('tmp')

var bracery = require('../index')

function removeColorCodes (text) {
  return text.replace(/\x1B\[[0-9][0-9]m/g, "")
}

function joinLines (rows) {
  return rows.map (function (row) {
    return row + '\n'
  }).join('')
}

var binPath = 'bin/bracery'
describe('Markov chain tests (' + binPath + ')', function() {
  
  var synAckTemplate = ['@client>Syn # # syn', 'SYN', '',
                        '@server>Ack/Syn # syn # syn_ack', 'ACK / SYN', '',
                        '@client>Ack # syn_ack # ack', 'ACK', '']
  var synAckOutput = ['[Syn] client: SYN', '[Ack/Syn] server: ACK / SYN', '[Ack] client: ACK']
  expectMarkov (synAckTemplate, synAckOutput)
})

function runCommand (args) {
  var cmdline = process.argv[0] + ' ' + __dirname + '/../' + binPath + ' ' + args
  var text = execSync(cmdline,{stdio:['pipe','pipe',process.env.TRAVIS ? 'pipe' : 'ignore']}).toString()
  text = text.substr (0, text.length - 1)  // chop off newline
  return text
}

function expectMarkov (templateDefRows, outputRows) {
  it('should generate "' + outputRows.join('\\n') + '" from "' + templateDefRows.join('\\n') + '"',
     function (done) {
       var tmpFilename = tmp.tmpNameSync()
       fs.writeFileSync (tmpFilename, joinLines(templateDefRows))
       var text = runCommand ("-m " + tmpFilename)
       assert.equal (removeColorCodes(text), joinLines(outputRows))
       done()
     })
}
