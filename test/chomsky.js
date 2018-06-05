var assert = require('assert')
var canonicaljson = require('canonicaljson')
var bracery = require('../index')

var initJson = { hello: "[yo|hi]",
		 world: ["world", "planet", "kids", "#hello#xxx#hello##hello#zzz"] }

var chomskyJson = {cfg:{"1":{opts:[{rhs:[{name:"hello",type:"nonterm"},{name:"7",type:"nonterm"}],weight:1}],type:"start"},"2":{opts:[{rhs:[{text:"world",type:"term"}],weight:2.5E-1},{rhs:[{text:"planet",type:"term"}],weight:2.5E-1},{rhs:[{text:"kids",type:"term"}],weight:2.5E-1},{rhs:[{name:"hello",type:"nonterm"},{name:"6",type:"nonterm"}],weight:2.5E-1}],type:"alt"},"3":{opts:[{rhs:[{text:"yo",type:"term"}],weight:5.0E-1},{rhs:[{text:"hi",type:"term"}],weight:5.0E-1}],type:"alt"},"4":{opts:[{rhs:[{name:"hello",type:"nonterm"},{text:"zzz",type:"term"}],weight:1}],type:"elim"},"5":{opts:[{rhs:[{name:"hello",type:"nonterm"},{name:"4",type:"nonterm"}],weight:1}],type:"elim"},"6":{opts:[{rhs:[{text:"xxx",type:"term"},{name:"5",type:"nonterm"}],weight:1}],type:"elim"},"7":{opts:[{rhs:[{text:" ",type:"term"},{name:"world",type:"nonterm"}],weight:1}],type:"elim"},hello:{opts:[{rhs:[{name:"3",type:"nonterm"}],weight:1}],type:"sym"},world:{opts:[{rhs:[{name:"2",type:"nonterm"}],weight:1}],type:"sym"}},cyclic:null,empties:[],sort:["1","4","5","6","7","world","hello","2","3"],start:"1"}

var cyclicJson = {a:["~b ~c","~b~d"],b:["~e~f"],c:["~f ~g"],d:"",e:["","~a"],f:["[|x]"],g:"x"}
var chomskyCyclicJson = {cfg:{"1":{opts:[{rhs:[{name:"a",type:"nonterm"}],weight:1}],type:"start"},"2":{opts:[{rhs:[{name:"b",type:"nonterm"},{name:"6",type:"nonterm"}],weight:5.0E-1},{rhs:[{name:"b",type:"nonterm"},{name:"d",type:"nonterm"}],weight:5.0E-1}],type:"alt"},"3":{opts:[{rhs:[],weight:5.0E-1},{rhs:[{text:"x",type:"term"}],weight:5.0E-1}],type:"alt"},"4":{opts:[{rhs:[{text:" ",type:"term"},{name:"g",type:"nonterm"}],weight:1}],type:"elim"},"5":{opts:[{rhs:[],weight:5.0E-1},{rhs:[{name:"a",type:"nonterm"}],weight:5.0E-1}],type:"alt"},"6":{opts:[{rhs:[{text:" ",type:"term"},{name:"c",type:"nonterm"}],weight:1}],type:"elim"},a:{opts:[{rhs:[{name:"2",type:"nonterm"}],weight:1}],type:"sym"},b:{opts:[{rhs:[{name:"e",type:"nonterm"},{name:"f",type:"nonterm"}],weight:1}],type:"sym"},c:{opts:[{rhs:[{name:"f",type:"nonterm"},{name:"4",type:"nonterm"}],weight:1}],type:"sym"},d:{opts:[{rhs:[],weight:1}],type:"sym"},e:{opts:[{rhs:[{name:"5",type:"nonterm"}],weight:1}],type:"sym"},f:{opts:[{rhs:[{name:"3",type:"nonterm"}],weight:1}],type:"sym"},g:{opts:[{rhs:[{text:"x",type:"term"}],weight:1}],type:"sym"}},cyclic:true,empties:["1","2","3","5","a","b","d","e","f"],sort:null,start:"1"}

var topoJson = {a:["~b ~c","~b ~d"],b:["~e ~f"],c:["~f ~g"],d:"",e:["","~a"],f:["[|x]"],g:"x"}
var chomskyTopoJson = {cfg:{"1":{opts:[{rhs:[{name:"a",type:"nonterm"}],weight:1}],type:"start"},"2":{opts:[{rhs:[{name:"b",type:"nonterm"},{name:"7",type:"nonterm"}],weight:5.0E-1},{rhs:[{name:"b",type:"nonterm"},{name:"8",type:"nonterm"}],weight:5.0E-1}],type:"alt"},"3":{opts:[{rhs:[],weight:5.0E-1},{rhs:[{text:"x",type:"term"}],weight:5.0E-1}],type:"alt"},"4":{opts:[{rhs:[{text:" ",type:"term"},{name:"g",type:"nonterm"}],weight:1}],type:"elim"},"5":{opts:[{rhs:[],weight:5.0E-1},{rhs:[{name:"a",type:"nonterm"}],weight:5.0E-1}],type:"alt"},"6":{opts:[{rhs:[{text:" ",type:"term"},{name:"f",type:"nonterm"}],weight:1}],type:"elim"},"7":{opts:[{rhs:[{text:" ",type:"term"},{name:"c",type:"nonterm"}],weight:1}],type:"elim"},"8":{opts:[{rhs:[{text:" ",type:"term"},{name:"d",type:"nonterm"}],weight:1}],type:"elim"},a:{opts:[{rhs:[{name:"2",type:"nonterm"}],weight:1}],type:"sym"},b:{opts:[{rhs:[{name:"e",type:"nonterm"},{name:"6",type:"nonterm"}],weight:1}],type:"sym"},c:{opts:[{rhs:[{name:"f",type:"nonterm"},{name:"4",type:"nonterm"}],weight:1}],type:"sym"},d:{opts:[{rhs:[],weight:1}],type:"sym"},e:{opts:[{rhs:[{name:"5",type:"nonterm"}],weight:1}],type:"sym"},f:{opts:[{rhs:[{name:"3",type:"nonterm"}],weight:1}],type:"sym"},g:{opts:[{rhs:[{text:"x",type:"term"}],weight:1}],type:"sym"}},cyclic:null,empties:["3","5","d","e","f"],sort:["1","7","8","c","g","f","b","e","d","4","3","6","5","a","2"],start:"1"}

var b = new bracery.Bracery (initJson)
describe('Chomsky normal form', function() {
  it('should convert a test grammar into Chomsky normal form', function (done) {
    var json = bracery.Chomsky.makeChomskyNormalCFG (b, '~hello ~world')
    assert.equal (canonicaljson.stringify(json), canonicaljson.stringify(chomskyJson))
    done()
  })

  it('should find a null cycle', function (done) {
    var b2 = new bracery.Bracery (cyclicJson)
    var json2 = bracery.Chomsky.makeChomskyNormalCFG (b2, '~a')
    assert.equal (canonicaljson.stringify(json2), canonicaljson.stringify(chomskyCyclicJson))
    done()
  })

  it('should toposort', function (done) {
    var b3 = new bracery.Bracery (topoJson)
    var json3 = bracery.Chomsky.makeChomskyNormalCFG (b3, '~a')
    assert.equal (canonicaljson.stringify(json3), canonicaljson.stringify(chomskyTopoJson))
    done()
  })

})
