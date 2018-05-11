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
})

function validate (lhs, norm) {
  var expected = norm || lhs
  it('should parse ' + lhs + (norm ? (' as ' + norm) : ''),
     function (done) {
       var result = b.normalize (lhs)
       assert.equal (result, expected)
       done()
     })
}
