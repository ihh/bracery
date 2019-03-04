var extend = window.braceryWeb.extend;

function getUrlParams() {
    var params = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        params[key] = value;
    });
    return params;
}

function initBraceryView (config) {
  var name = config.name
  var vars = config.vars
  var recent = config.recent
  var storePrefix = config.store
  var viewPrefix = config.view
  var expandPrefix = config.expand

  var urlParams = getUrlParams()
  var expandConfig = { maxDepth: 100,
                       maxRecursion: 5,
                       enableParse: false }
  Object.keys (expandConfig).forEach (function (param) {
    if (urlParams[param])
      expandConfig[param] = urlParams[param]
  })
  
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

  var sourceRevealElement = document.getElementById('sourcereveal')
  var sourceControlsElement = document.getElementById('sourcecontrols')
  var sourcePanelElement = document.getElementById('sourcepanel')

  var recentElement = document.getElementById('recent')

  var baseUrl = window.location.origin + viewPrefix
  urlElement.innerText = baseUrl
  nameElement.value = name
  evalElement.placeholder = 'Enter text, e.g. [something|other]'

  if (recent && recent.length)
    recentElement.innerHTML = 'Recently updated: ' + recent
    .map (function (recentName) { return '<a href="' + baseUrl + recentName + '">' + recentName + '</a>' })
    .join (", ")
  
  var totalExpansions = 0, currentExpansion = 0   // use this to avoid async issues where earlier calls overwrite later results
  function show() {
    var expansionCount = ++totalExpansions
    return function (expansion) {
      if (expansionCount > currentExpansion) {
        expElement.innerHTML = marked (expansion.text)
        currentExpansion = expansionCount
      }
    }
  }

  function makeLink (text, link) {
    var safeLink = window.braceryWeb.sanitize (link.text)
    return '<a href="#" onclick="handleBraceryLink(\'' + safeLink + '\')">' + text.text + '</a>'
  }
  function handleBraceryLink (newEvalText) {
    window.event.preventDefault();
    return update (newEvalText);
  }

  var braceryCache = {}, serviceCalls = 0
  function getBracery (symbolName, callback) {
    if (braceryCache[symbolName])
      callback (braceryCache[symbolName])
    else {
      function reqListener () {
        var responseBody = JSON.parse (this.responseText);
        var result = responseBody.bracery;
        braceryCache[symbolName] = result;
        callback (result);
      }
      var req = new XMLHttpRequest();
      req.onreadystatechange = function() {
        if (this.readyState === XMLHttpRequest.DONE) {
          if (this.status === 200) {
            var responseBody = JSON.parse (this.responseText);
            var result = responseBody.bracery;
            braceryCache[symbolName] = result;
            callback (result);
          } else
            callback ('')
        }
      }
      req.open("GET", window.location.origin + storePrefix + symbolName);
      req.send();
    }
  }

  function expandBracery (symbolName, callback) {
    function reqListener () {
      var responseBody = JSON.parse (this.responseText);
      callback (responseBody.tree || []);
    }
    var req = new XMLHttpRequest();
    req.addEventListener("load", reqListener);
    req.open("GET", window.location.origin + expandPrefix + symbolName);
    req.send();
  }

  function storeBracery (symbolName, symbolDef, password, callback) {
    var req = new XMLHttpRequest();
    req.open("PUT", window.location.origin + storePrefix + symbolName);
    req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    req.onreadystatechange = function() {
      if (this.readyState === XMLHttpRequest.DONE) {
        if (this.status === 200)
          callback()
        else
          callback (this.status)
      }
    }
    var body = { bracery: symbolDef }
    if (password)
      body.password = password
    req.send (JSON.stringify (body));
  }
  function reset() {
    // hack: pass text in URL via hash, to work around hosts (e.g. github HTML preview) that won't allow URI parameters
    if (window.location.hash)
      setEvalAndUpdate (window.decodeURIComponent (window.location.hash.substr(1)))
    else
      getBracery (name, setEvalAndUpdate);
  }
  function setEvalAndUpdate (newEvalText) {
    evalElement.innerText = newEvalText
    update()
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
    // window.alert ("URL copied to clipboard")
  }
  function sanitizeName() {
    nameElement.value = nameElement.value.replace(/ /g,'_').replace(/[^A-Za-z_0-9]/g,'')
  }
  function save() {
    var name = nameElement.value.toLowerCase()
    var text = evalElement.innerText
    var password = passwordElement.value
    if (!name)
      errorElement.innerText = 'Please enter a name.'
    else {
      errorElement.innerText = ''
      storeBracery (name, text, password, function (err, result) {
        if (err) {
          if (err === 401)
            errorElement.innerText = 'Sorry, the name "' + name + '" is already in use and is password-protected.' + " If you don't know the password, try saving as another name."
          else
            errorElement.innerText = 'Sorry, an error occurred (' + err + ').'
        } else {
          errorElement.innerText = 'Saved.'
          delete braceryCache[name]
        }
      })
    }
  }
  var delayedUpdateTimer = null, updateDelay = 400
  function delayedUpdate (evt) {
    cancelDelayedUpdate()
    setTimeout (update, updateDelay)
  }
  function cancelDelayedUpdate() {
    if (delayedUpdateTimer) {
      clearTimeout (delayedUpdateTimer)
      delayedUpdateTimer = null
    }
  }
  function update (text) {
    cancelDelayedUpdate()
    try {
      errorElement.innerText = ''

      if (typeof(text) === 'undefined')
        text = evalElement.innerText.match(/\S/) ? evalElement.innerText : ''

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

      var callbacks = { expand: expandSymbol,
                        get: getSymbol,
                        set: setSymbol,
                        callback: show(),
                        makeLink: makeLink }

      var b = new bracery.Bracery()
      b.expand (text, extend (callbacks,
                              expandConfig,
                              { vars: vars }))
    } catch (e) {
      expElement.innerText = e
    }
  }
  function revealSource (evt) {
    evt.preventDefault()
    sourceControlsElement.style.display = ''
    sourcePanelElement.style.display = ''
    sourceRevealElement.style.display = 'none'
  }
  evalElement.addEventListener ('keyup', delayedUpdate)
  eraseElement.addEventListener ('click', function (evt) { evt.preventDefault(); evalElement.innerText = ''; update() })
  resetElement.addEventListener ('click', function (evt) { evt.preventDefault(); reset() })
  rerollElement.addEventListener ('click', function (evt) { evt.preventDefault(); update() })
  saveElement.addEventListener ('click', function (evt) { evt.preventDefault(); save() })
  nameElement.addEventListener ('keyup', function (evt) { evt.preventDefault(); sanitizeName() })
  sourceRevealElement.addEventListener ('click', revealSource)
  window.handleBraceryLink = handleBraceryLink  // make this globally available
  update()
}

