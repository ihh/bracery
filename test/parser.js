var assert = require('assert')
var bracery = require('../index')

var initJson = { abc: 'def',
                 hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 test1: 'testing',
                 test2: '$TEST1',
                 test3: 'x$test3',
                 test4: '&quote{$TEST1}' }

var b = new bracery.Bracery (initJson)
describe('validation', function() {
  validate ('$x')
  validate ('&quote{$x}')
  validate ('&quote{$x }')
  validate ('&quote$x', '&quote{$x}')
  validate ('&quote&cap$x', '&quote$X')

  validate ('&rep{$x}{3}')
  validate ('&rep{$x}{03}', '&rep{$x}{3}')
  validate ('&rep{$x}{3,5}')

  validate ('&strip^x^y')
  validate ('&strip{^x}^y', '&strip^x^y')
  validate ('&strip^x{^y}', '&strip^x^y')
  validate ('&strip{^x}{^y}', '&strip^x^y')

  validate ('&strip^x{abc}')
  validate ('&strip{^x}{abc}', '&strip^x{abc}')

  validate ('&strip{abc}^y')
  validate ('&strip{abc}{^y}', '&strip{abc}^y')

  validate ('&strip{$abc}{${abc}def}')
  validate ('^y=&strip&strip^b{abc}&strip{t}^x', '^y={&strip&strip^b{abc}&strip{t}^x}')
  
  validate ('&push^a')
  validate ('&push{^a^b^c}')
  validate ('&push{  ^a  ^b   ^c  }', '&push{^a^b^c}')
})

function validate (lhs, norm, config) {
  var expected = norm || lhs
  it('should parse ' + lhs + (norm ? (' as ' + norm) : ''),
     function (done) {
       var result = b.normalize (lhs)
       assert.equal (result, expected)
       done()
     })
}
