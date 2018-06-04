var assert = require('assert')
var bracery = require('../index')

var initJson = { hello: "[yo|hi]",
		 world: ["world", "planet", "kids", "#hello#xxx#hello##hello#zzz"] }

var chomskyJson = {"cfg":{"1":[{"rhs":[{"type":"nonterm","name":"hello"},{"type":"nonterm","name":"6"}],"weight":1}],"2":[{"rhs":[{"type":"term","text":"yo"}],"weight":0.5},{"rhs":[{"type":"term","text":"hi"}],"weight":0.5}],"3":[{"rhs":[{"type":"nonterm","name":"hello"},{"type":"term","text":"zzz"}],"weight":1}],"4":[{"rhs":[{"type":"nonterm","name":"hello"},{"type":"nonterm","name":"3"}],"weight":1}],"5":[{"rhs":[{"type":"term","text":"xxx"},{"type":"nonterm","name":"4"}],"weight":1}],"6":[{"rhs":[{"type":"term","text":" "},{"type":"nonterm","name":"world"}],"weight":1}],"world":[{"rhs":[{"type":"term","text":"world"}],"weight":0.25},{"rhs":[{"type":"term","text":"planet"}],"weight":0.25},{"rhs":[{"type":"term","text":"kids"}],"weight":0.25},{"rhs":[{"type":"nonterm","name":"hello"},{"type":"nonterm","name":"5"}],"weight":0.25}],"hello":[{"rhs":[{"type":"nonterm","name":"2"}],"weight":1}]},"empties":[],"sort":["1","3","4","5","6","world","hello","2"],"start":"1"}

var cyclicJson = {a:["~b ~c","~b~d"],b:["~e~f"],c:["~f ~g"],d:"",e:["","~a"],f:["[|x]"],g:"x"}
var chomskyCyclicJson = {"cfg":{"1":[{"rhs":[{"type":"nonterm","name":"a"}],"weight":1}],"2":[{"rhs":[],"weight":0.5},{"rhs":[{"type":"term","text":"x"}],"weight":0.5}],"3":[{"rhs":[{"type":"term","text":" "},{"type":"nonterm","name":"g"}],"weight":1}],"4":[{"rhs":[{"type":"term","text":" "},{"type":"nonterm","name":"c"}],"weight":1}],"a":[{"rhs":[{"type":"nonterm","name":"b"},{"type":"nonterm","name":"4"}],"weight":0.5},{"rhs":[{"type":"nonterm","name":"b"},{"type":"nonterm","name":"d"}],"weight":0.5}],"c":[{"rhs":[{"type":"nonterm","name":"f"},{"type":"nonterm","name":"3"}],"weight":1}],"g":[{"rhs":[{"type":"term","text":"x"}],"weight":1}],"f":[{"rhs":[{"type":"nonterm","name":"2"}],"weight":1}],"b":[{"rhs":[{"type":"nonterm","name":"e"},{"type":"nonterm","name":"f"}],"weight":1}],"e":[{"rhs":[],"weight":0.5},{"rhs":[{"type":"nonterm","name":"a"}],"weight":0.5}],"d":[{"rhs":[],"weight":1}]},"empties":["1","2","a","b","d","e","f"],"cyclic":true,"start":"1"}

var topoJson = {a:["~b ~c","~b ~d"],b:["~e ~f"],c:["~f ~g"],d:"",e:["","~a"],f:["[|x]"],g:"x"}
var chomskyTopoJson = {"cfg":{"1":[{"rhs":[{"type":"nonterm","name":"a"}],"weight":1}],"2":[{"rhs":[],"weight":0.5},{"rhs":[{"type":"term","text":"x"}],"weight":0.5}],"3":[{"rhs":[{"type":"term","text":" "},{"type":"nonterm","name":"g"}],"weight":1}],"4":[{"rhs":[{"type":"term","text":" "},{"type":"nonterm","name":"f"}],"weight":1}],"5":[{"rhs":[{"type":"term","text":" "},{"type":"nonterm","name":"c"}],"weight":1}],"6":[{"rhs":[{"type":"term","text":" "},{"type":"nonterm","name":"d"}],"weight":1}],"a":[{"rhs":[{"type":"nonterm","name":"b"},{"type":"nonterm","name":"5"}],"weight":0.5},{"rhs":[{"type":"nonterm","name":"b"},{"type":"nonterm","name":"6"}],"weight":0.5}],"c":[{"rhs":[{"type":"nonterm","name":"f"},{"type":"nonterm","name":"3"}],"weight":1}],"g":[{"rhs":[{"type":"term","text":"x"}],"weight":1}],"f":[{"rhs":[{"type":"nonterm","name":"2"}],"weight":1}],"b":[{"rhs":[{"type":"nonterm","name":"e"},{"type":"nonterm","name":"4"}],"weight":1}],"e":[{"rhs":[],"weight":0.5},{"rhs":[{"type":"nonterm","name":"a"}],"weight":0.5}],"d":[{"rhs":[],"weight":1}]},"empties":["2","d","e","f"],"sort":["1","5","6","c","g","f","b","e","d","3","2","4","a"],"start":"1"}

var b = new bracery.Bracery (initJson)
describe('Chomsky normal form', function() {
  it('should convert a test grammar into Chomsky normal form', function (done) {
    var json = bracery.Chomsky.makeChomskyNormalCFG (b, '~hello ~world')
    assert.equal (JSON.stringify(json), JSON.stringify(chomskyJson))
    done()
  })

  it('should find a null cycle', function (done) {
    var b2 = new bracery.Bracery (cyclicJson)
    var json2 = bracery.Chomsky.makeChomskyNormalCFG (b2, '~a')
    assert.equal (JSON.stringify(json2), JSON.stringify(chomskyCyclicJson))
    done()
  })

  it('should toposort', function (done) {
    var b3 = new bracery.Bracery (topoJson)
    var json3 = bracery.Chomsky.makeChomskyNormalCFG (b3, '~a')
    assert.equal (JSON.stringify(json3), JSON.stringify(chomskyTopoJson))
    done()
  })

})
