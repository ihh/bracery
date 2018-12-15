var fs = require('fs')
var readline = require('readline')
var md5 = require('md5')
var bluebird = require('bluebird')

var dir = 'dict'
var filenames = ['data.noun','data.verb','data.adj','data.adv']

var minSynonyms = 3

var excludedWordHashes = ['c35312fb3a7e05b7a44db2326bd29040']  // n..
var isExcluded = {}
excludedWordHashes.forEach (function (hash) { isExcluded[hash] = true })

var data = []
bluebird.Promise.all
(filenames.map (function (filename) {
  var path = dir + '/' + filename
  return new bluebird.Promise (function (resolve, reject) {
    console.warn (path)
    if (fs.existsSync (path)) {
      var lineReader = readline.createInterface({
        input: require('fs').createReadStream (path)
      })

      lineReader.on('line', function (line) {
        if (line[0] !== ' ') {
          var field = line.split(' ')
          var words = [], exclude = false
          for (var i = 0; i < field[3]; ++i) {
            var word = field[2*i+4]
            exclude = word.split('_').reduce (function (ex, subword) {
              return ex || isExcluded[md5(subword.toLowerCase())]
            }, exclude)
            words.push (word)
          }
          if (exclude)
            console.warn ('Excluding ' + words.join(','))
          else if (words.length >= minSynonyms)
            data.push (words)
        }
      })
     
      lineReader.on('close', resolve)
    } else
      reject()
  })
})).then (function() {

  var nSynonyms = {}
  data.forEach (function (words) {
    words.forEach (function (word) {
      var iw = indexify(word)
      nSynonyms[iw] = nSynonyms[iw] ? (nSynonyms[iw] + 1) : 1
    })
  })

  var result = []
  data.forEach (function (words) {
    var order = {}
    words.forEach (function (word, n) { order[word] = n })
    words = words.sort (function (a, b) {
      return (nSynonyms[indexify(a)] - nSynonyms[indexify(b)]) || (a.length - b.length) || (order[a] - order[b])
    })
    var indexWord = words.reduce (function (iw, word) {
      return iw || (word.match(/^[A-Za-z][A-Za-z_]+$/) ? word.toLowerCase() : null)
    }, null)
    if (indexWord)
      result.push ({ name: indexWord,
                     rules: words.reverse().map (function (text) { return [text.replace(/_/g,' ')] }) })
  })
  
  console.log (JSON.stringify (result))
})

function indexify (word) {
  return word.toLowerCase().replace(/\s/g,'_')
}
