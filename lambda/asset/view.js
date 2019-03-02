function extend (a, b) {
  Object.keys (b).forEach ((k) => { a[k] = b[k]; });
  return a;
}

function initBraceryView (config) {
  var name = config.name
  var storePrefix = config.store
  var viewPrefix = config.view
  var expandPrefix = config.expand
  
  var evalElement = document.getElementById('eval')
  var eraseElement = document.getElementById('erase')
  var resetElement = document.getElementById('reset')
  var rerollElement = document.getElementById('reroll')
  var expElement = document.getElementById('expansion')

  var urlElement = document.getElementById('urlprefix')
  var nameElement = document.getElementById('name')
  var passwordElement = document.getElementById('password')
  var saveElement = document.getElementById('save')
  var errorElement = document.getElementById('error')
  
  urlElement.innerText = window.location.origin + viewPrefix
  nameElement.value = name
  
  var config = { maxDepth: 100,
                 maxRecursion: 5,
                 maxServiceCalls: 10,
                 enableParse: false }

  function show (expansion) {
    expElement.innerText = expansion.text
  }

  var braceryCache = {}, serviceCalls = 0
  function getBracery (symbolName, callback) {
    if (braceryCache[symbolName])
      callback (braceryCache[symbolName])
    else if (++serviceCalls > config.maxServiceCalls)
      callback ('')
    else {
      function reqListener () {
        var responseBody = JSON.parse (this.responseText);
        var result = responseBody.bracery;
        braceryCache[symbolName] = result;
        callback (result);
      }
      var req = new XMLHttpRequest();
      req.addEventListener("load", reqListener);
      req.open("GET", window.location.origin + storePrefix + symbolName);
      req.send();
    }
  }

  function expandBracery (symbolName, callback) {
    if (++serviceCalls > config.maxServiceCalls)
      callback ('')
    else {
      function reqListener () {
        var responseBody = JSON.parse (this.responseText);
        callback (responseBody.tree || []);
      }
      var req = new XMLHttpRequest();
      req.addEventListener("load", reqListener);
      req.open("GET", window.location.origin + expandPrefix + symbolName);
      req.send();
    }
  }
  
  function reset() {
    function setEvalAndUpdate (newEvalText) {
      evalElement.innerText = newEvalText
      update()
    }
    // hack: pass text in URL via hash, to work around hosts (e.g. github HTML preview) that won't allow URI parameters
    if (window.location.hash)
      setEvalAndUpdate (window.decodeURIComponent (window.location.hash.substr(1)))
    else
      getBracery (name, setEvalAndUpdate);
  }
  function link() {
    // hack: pass out text in URL via hash, to work around hosts (e.g. github HTML preview) that won't allow URI parameters
    window.location.href = window.location.href.replace(/#.*/,'') + '#' + window.encodeURIComponent(evalElement.innerText)
    var ta = document.createElement('textarea')
    ta.value = window.location.href
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    window.alert ("URL copied to clipboard")
  }
  function update (evt) {
    try {
      var text = evalElement.innerText.match(/\S/) ? evalElement.innerText : ''
      var b = new bracery.Bracery(), braceryConfig

      function expandSymbol (config) {
        var symbolName = config.symbolName || config.node.name
        return new Promise (function (resolve, reject) {
          expandBracery (symbolName.toLowerCase(), resolve)
        })
      }
      function getSymbol (config) {
        var symbolName = config.symbolName || config.node.name
        return new Promise (function (resolve, reject) {
          getBracery (symbolName.toLowerCase(), resolve)
        })
      }
      function setSymbol() { return [] }

      braceryConfig = { expand: expandSymbol,
                        get: getSymbol,
                        set: setSymbol }

      evalElement.placeholder = 'Enter text, e.g. [something|other]'

      config.callback = show
      bracery.expand (text, config)
    } catch (e) {
      expElement.innerText = e
    }
  }
  evalElement.addEventListener ('keyup', update)
  expElement.addEventListener ('click', update)
  eraseElement.addEventListener ('click', function (evt) { evt.preventDefault(); evalElement.innerText = ''; update() })
  resetElement.addEventListener ('click', function (evt) { evt.preventDefault(); reset() })
  linkElement.addEventListener ('click', function (evt) { evt.preventDefault(); link() })
  rerollElement.addEventListener ('click', function (evt) { evt.preventDefault(); update() })
  reset()
}

