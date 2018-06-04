var assert = require('assert')
var bracery = require('../index')

var initJson = { hello: "[yo|hi]",
		 world: ["world", "planet", "kids", "#hello#xxx#hello##hello#zzz"] }

var chomskyJson = {cfg:{"1":[{rhs:[{type:"nonterm",name:"hello"},{type:"nonterm",name:"6"}],weight:1}],"2":[{rhs:[{type:"term",text:"yo"}],weight:0.5},{rhs:[{type:"term",text:"hi"}],weight:0.5}],"3":[{rhs:[{type:"nonterm",name:"hello"},{type:"term",text:"zzz"}],weight:1}],"4":[{rhs:[{type:"nonterm",name:"hello"},{type:"nonterm",name:"3"}],weight:1}],"5":[{rhs:[{type:"term",text:"xxx"},{type:"nonterm",name:"4"}],weight:1}],"6":[{rhs:[{type:"term",text:" "},{type:"nonterm",name:"world"}],weight:1}],world:[{rhs:[{type:"term",text:"world"}],weight:0.25},{rhs:[{type:"term",text:"planet"}],weight:0.25},{rhs:[{type:"term",text:"kids"}],weight:0.25},{rhs:[{type:"nonterm",name:"hello"},{type:"nonterm",name:"5"}],weight:0.25}],hello:[{rhs:[{type:"nonterm",name:"2"}],weight:1}]},start:"1"}

var b = new bracery.Bracery (initJson)
describe('Chomsky normal form', function() {
  it('should convert a test grammar into Chomsky normal form', function (done) {
    var json = bracery.Chomsky.makeChomskyNormalCFG (b, '~hello ~world')
    assert.equal (JSON.stringify(json), JSON.stringify(chomskyJson))
    done()
  })
})
