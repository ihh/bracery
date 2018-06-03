var assert = require('assert')
var bracery = require('../index')

var initJson = { abc: 'def',
                 hello: '[hello|hi]',
                 world: ['world', 'planet'],
                 test1: 'testing',
                 test2: '~TEST1',
                 test3: 'x~test3',
                 test4: '&quote{~TEST1}' }

var b = new bracery.Bracery (initJson)
describe('validation', function() {
  validate ('~x')
  validate ('&quote{~x}')
  validate ('&quote{~x }')
  validate ('&quote~x', '&quote{~x}')
  validate ('&quote&cap~x', '&quote~X')

  validate ('&rep{~x}{3}')
  validate ('&rep{~x}{03}', '&rep{~x}{3}')
  validate ('&rep{~x}{3,5}')

  validate ('&eq$x$y')
  validate ('&eq{$x}$y', '&eq$x$y')
  validate ('&eq$x{$y}', '&eq$x$y')
  validate ('&eq{$x}{$y}', '&eq$x$y')

  validate ('&eq$x{abc}')
  validate ('&eq{$x}{abc}', '&eq$x{abc}')

  validate ('&eq{abc}$y')
  validate ('&eq{abc}{$y}', '&eq{abc}$y')

  validate ('&eq{~abc}{~{abc}def}')
  validate ('$y=&eq&eq$b{abc}&eq{t}$x', '$y={&eq&eq$b{abc}&eq{t}$x}')

  validate ('&set$y{xyz}', '$y={xyz}')
  validate ('&set{$y}{xyz}', '$y={xyz}')
  validate ('&set{y}{xyz}', '$y={xyz}')

  validate ('&reduce$n:$x$r={zero dogs}&add$r$n')
  validate ('&reduce$n{$x}$r{zero dogs}{&add{$r}{$n}}', '&reduce$n:$x$r={zero dogs}&add$r$n')
  validate ('&map$n:$x{$n,}')
  validate ('&map$n{$x}{$n,}', '&map$n:$x{$n,}')

  validate ('[a=>b|c]', '$a={&quote[b|c]}')
  validate ('[a\\=>b|c]', '[a\\=>b|c]')
  validate ('[c|a\\=>b]', '[c|a=>b]')

  validate ('[a:b|c]', '[a\\:b|c]')
  validate ('[a:b\\|c]', '$a={b\\|c}')

  validate ('$x=hello', '$x={hello}')
  validate ('$x=hello kid', '$x={hello}kid')
  validate ('&quote{$a=1 $a==3}', '&quote{$a={1}$a==3}')
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
