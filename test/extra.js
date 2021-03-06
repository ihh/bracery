var assert = require('assert')
var bracery = require('../index')
var extend = bracery.ParseTree.extend
var canonicaljson = require('canonicaljson')

// initial grammar
var initJson = { abc: 'def',
                 hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 dynamo: function (config) { return [config.random() < .5 ? 'dynamik' : 'DYNAMIC'] },
                 lambda: function (config, x, y) { return x + 'world' + y },
                 json: function (config, x, y, z) { return 'x=' + JSON.stringify(x) + ' y=' + JSON.stringify(y) + ' z=' + JSON.stringify(z) },
                 test1: 'testing',
                 test2: '~TEST1',
                 test3: 'x~test3',
                 test4: '&quote{~TEST1}' }

var nTestSymbols = Object.keys(initJson).length  // number of symbols in initial grammar

var b = new bracery.Bracery (initJson)

function assertJsonEqual (json1, json2) {
  assert.equal (canonicaljson.stringify(json1), canonicaljson.stringify(json2))
}

function jsonEqual (json1, json2) {
  return canonicaljson.stringify(json1) === canonicaljson.stringify(json2)
}

var maxTries = 100
function attempt (test) {
  for (var n = 0; n < maxTries; ++n)
    if (test())
      return true
  throw new Error ('failed after ' + maxTries + ' attempts')
  return false
}

// tests
describe('parse tree methods', function() {
  it('should find symbol nodes', function (done) {
    var rhs = bracery.ParseTree.parseRhs ('~x &uc{~y} &if{~a}{~b}{~c} &call~z{~foo}')
    var nodes = bracery.ParseTree.getSymbolNodes (rhs)
    // actual
    // [{"bind":null,"method":"expand","name":"x","pos":[0,2],"type":"sym"},{"bind":null,"method":"expand","name":"y","pos":[7,2],"type":"sym"},{"bind":null,"method":"expand","name":"a","pos":[15,2],"type":"sym"},{"bind":null,"method":"expand","name":"b","pos":[19,2],"type":"sym"},{"bind":null,"method":"expand","name":"c","pos":[23,2],"type":"sym"},{"bind":null,"method":"expand","name":"z","pos":[32,2],"type":"sym"},{"bind":null,"method":"expand","name":"foo","pos":[35,4],"type":"sym"}]

    // expected
    // [{"bind":null,"method":"expand","name":"x","pos":[0,2],"sympos":[1,1],"type":"sym"},{"bind":null,"method":"expand","name":"y","pos":[7,2],"sympos":[8,1],"type":"sym"},{"bind":null,"method":"expand","name":"a","pos":[15,2],"sympos":[16,1],"type":"sym"},{"bind":null,"method":"expand","name":"b","pos":[19,2],"sympos":[20,1],"type":"sym"},{"bind":null,"method":"expand","name":"c","pos":[23,2],"sympos":[24,1],"type":"sym"},{"bind":null,"method":"expand","name":"z","pos":[32,2],"sympos":[33,1],"type":"sym"},{"bind":null,"method":"expand","name":"foo","pos":[35,4],"sympos":[36,3],"type":"sym"}]
    assertJsonEqual (nodes, [['x',[0,2]],['y',[7,2]],['a',[15,2]],['b',[19,2]],['c',[23,2]],['z',[32,2]],['foo',[35,4]]].map (function (name_pos) { return { type: 'sym', name: name_pos[0], pos: name_pos[1], sympos: [name_pos[1][0]+1,name_pos[1][1]-1], bind: null, method: 'expand' } }))
    done()
  })

  it('should identify an empty parse tree', function (done) {
    var rhs = bracery.ParseTree.parseRhs ('')
    assert.equal (!!bracery.ParseTree.parseTreeEmpty (rhs), true)
    done()
  })

  it('should identify an empty parse tree containing only whitespace', function (done) {
    var rhs = bracery.ParseTree.parseRhs ('  ')
    assert.equal (!!bracery.ParseTree.parseTreeEmpty (rhs), true)
    done()
  })

  it('should identify a non-empty parse tree containing variables', function (done) {
    var rhs = bracery.ParseTree.parseRhs ('$x $y $z')
    assert.equal (!!bracery.ParseTree.parseTreeEmpty (rhs), false)
    done()
  })

  it('should identify a non-empty parse tree containing a symbol', function (done) {
    var rhs = bracery.ParseTree.parseRhs ('~x')
    assert.equal (!!bracery.ParseTree.parseTreeEmpty (rhs), false)
    done()
  })
})

describe('utilities', function() {
  it('should return random elements [1,2] from list [1,2,3]', function (done) {
    attempt (function() {
      var rand = bracery.ParseTree.nRandomElements ([1,2,3], 2)
      return jsonEqual (rand, [1,2])
    })
    done()
  })

  it('should return random elements [2,3] from list [1,2,3]', function (done) {
    attempt (function() {
      var rand = bracery.ParseTree.nRandomElements ([1,2,3], 2)
      return jsonEqual (rand, [2,3])
    })
    done()
  })

  it('should return random elements [1,3] from list [1,2,3]', function (done) {
    attempt (function() {
      var rand = bracery.ParseTree.nRandomElements ([1,2,3], 2)
      return jsonEqual (rand, [1,3])
    })
    done()
  })
})

describe('formats', function() {
  it('should parse plaintext symbol definitions', function (done) {
    var d = bracery.ParseTree.parseTextDefs ('>a\nhello\n$b\n\n>b\nworld\nplanet\n')
    assertJsonEqual (d, {a:['hello','$b'],b:['world','planet']})
    done()
  })

  it('should recognize PREFIX, SUFFIX, RESET, and comments', function (done) {
    var d = bracery.ParseTree.parseTextDefs ('# comment\n## PREFIX xyz\n>a\nhello\n$b\n\n## SUFFIX 123\n>b\nworld\nplanet ~*EARTH ~*Earth ~*earth ##FOO #*BAR\n\n## RESET PREFIX\n>test\nyes ~~a\nno\n\n## RESET\n\n>foo\nbar\nbaz\n')
    assertJsonEqual (d, {foo:['bar','baz'],test123:['yes ~a123','no'],xyza:['hello','$b'],xyzb123:['world','planet ~XYZEARTH123 ~Xyzearth123 ~xyzearth123 xyzFOO123 xyzBAR123']})
    done()
  })

  it('should return final variables', function (done) {
    var expansion = b.expand ('$x=3 $y=5')
    var vars = bracery.ParseTree.finalVarVal ({ node: { type: 'root', rhs: expansion.tree },
                                                initVarVal: { z: "9" } })
    assertJsonEqual (vars, {x:"3",y:"5",z:"9"})
    done()
  })
})
