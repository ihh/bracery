var assert = require('assert')
var execSync = require('child_process').execSync
var fs = require('fs')
var tmp = require('tmp')

var bracery = require('../index')

var initJson = { abc: 'def',
                 hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 test1: 'testing',
                 test2: '~TEST1',
                 test3: 'x~test3',
                 test4: '&quote{~TEST1}' }

var initText = [">abc","def","",
                ">hello","[hello|hi]","",
                ">test1","testing","",
                ">test2","~TEST1","",
                ">test3","x~test3","",
                ">test4","&quote~TEST1","",
                ">world","world","planet","",
                ""].join('\n')

var binPath = 'bin/bracery'
var initOpt = " -s '" + JSON.stringify(initJson) + "'"
describe('command-line tests (' + binPath + ')', function() {
  // simple expansions
  expectExpand ('~test1', 'testing')
  expectExpand ('~test2', 'TESTING')

  // config
  expectExpand ('~test3', 'xxx')
  expectExpand ('~test3', 'xxxx', { maxRecursion: 4 })

  // quoting
  expectExpand ('&eval{~test4}', 'TESTING')
  expectExpand ('&quote{~Test1}', '~Test1')

  // compromise
  expectExpand ('&future{love}', 'will love')
  // command-line options
  var tree1 = {text:'hello',vars:{},tree:['hello'],nodes:1,value:'hello'}
  var tree2 = {text:'testing',vars:{},tree:[{type:'sym',name:'test1',rhs:['testing']}],nodes:2,value:'testing'}
  expectExpand ('hello', '['+JSON.stringify(tree1,null,2)+']', { opts: '--tree' })
  expectExpand ('~test1', JSON.stringify([tree2]), { opts: '--compact-tree' })
  expectExpand ('#test4#', '~TEST1', { opts: '--async' })

  // empty list test
  var emptyListTree = {text:'',vars:{},tree:[{type:'func',funcname:'list',args:[],expansion:{text:'',value:[],vars:{}}}],nodes:1,value:[]}
  expectExpand ('{}', JSON.stringify([emptyListTree]), { opts: '--compact-tree' })

  // dump to file
  var tmpFilename = tmp.tmpNameSync()
  it('should dump rules to a file',
     function (done) {
       runCommand (initOpt + ' -O ' + tmpFilename)
       var tmpFileContents = fs.readFileSync (tmpFilename).toString()
       assert.equal (tmpFileContents, initText)
       done()
     })
})

function runCommand (args) {
  var cmdline = process.argv[0] + ' ' + __dirname + '/../' + binPath + ' ' + args
  var text = execSync(cmdline,{stdio:['pipe','pipe',process.env.TRAVIS ? 'pipe' : 'ignore']}).toString()
  text = text.substr (0, text.length - 1)  // chop off newline
  return text
}

function expectExpand (lhs, rhs, config) {
  var fail = config && config.fail
  var opts = config && config.opts
  if (fail) delete config.fail
  if (opts) delete config.opts
  if (config && Object.keys(config).length === 0)
    config = null
  it('should ' + (fail ? 'not ' : '') + 'expand ' + (lhs || 'the empty string') + ' to ' + rhs.replace(/\s+/g,function(){return' '})
     + (config ? (' with ' + JSON.stringify(config)) : ''),
     function (done) {
       var text = runCommand ("-c '" + JSON.stringify(config || {}) + "'"
                              + initOpt
                              + (opts ? (' ' + opts) : '')
                              + " -e '" + lhs + "'")
       if (fail)
         assert.notEqual (text, rhs)
       else
         assert.equal (text, rhs)
       done()
     })
}

