var fs = require('fs')
var readline = require('readline')
var md5 = require('md5')

var filename = 'mobythes.aur'

var words
// uncomment for opt-in list of words to include; comment out to import entire thesaurus
words = ['alabaster', 'breach', 'cat', 'delicious', 'evanescent', 'fracas', 'ghost_story', 'hobgoblin', 'iridescent', 'jocular', 'keen', 'language', 'menace', 'numberless', 'osculate', 'pagan', 'quack', 'rhubarb', 'sausage', 'trumpet', 'unacceptable', 'vacillation', 'wacky', 'xenophobia', 'yellow', 'zeal',  // mentioned by the helptext
         'crap', 'delightful', 'filthy', 'rabid']  // used by intro data

var excludedWordHashes = ['c35312fb3a7e05b7a44db2326bd29040']  // n word
var isExcluded = {}
excludedWordHashes.forEach (function (hash) { isExcluded[hash] = true })

if (fs.existsSync (filename)) {
  var lineReader = readline.createInterface({
    input: require('fs').createReadStream (filename)
  })

  var rules = {}
  lineReader.on('line', function (line) {
    var defs = line.split(',')
    var name = defs[0].toLowerCase().replace(/[\s\-,]/g,'_')
    rules[name] = defs
      .filter (function (text) { return text.length })
      .map (function (text) { return [text] })
  })

  lineReader.on('close', function() {

    words = words || Object.keys(rules).sort()
    words = words.filter (function (word) {
      return !isExcluded[md5(word)]
    })
    var result = words.map (function (name) {
      return { name: name,
               rules: rules[name] }
    })
    console.log (JSON.stringify (result))
  })
}
