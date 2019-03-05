var extend = window.braceryWeb.extend;

function getUrlParams() {
    var params = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        params[key] = value;
    });
    return params;
}

function initBraceryView (config) {
  function name() { return config.name }  // make this dynamic, as save() can change the name
  function initText() { return config.init }  // make this dynamic, as initText is reset when user starts typing
  var initVars = config.vars
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

  var braceryServer = new bracery.Bracery()

  var evalElement = document.getElementById('eval')
  var eraseElement = document.getElementById('erase')
  var resetElement = document.getElementById('reset')
  var rerollElement = document.getElementById('reroll')
  var bookmarkElement = document.getElementById('bookmark')
  var expElement = document.getElementById('expansion')

  var urlElement = document.getElementById('urlprefix')
  var nameElement = document.getElementById('name')
  var passwordElement = document.getElementById('password')
  var saveElement = document.getElementById('save')
  var errorElement = document.getElementById('error')

  var sourceRevealElement = document.getElementById('sourcereveal')
  var sourceHideElement = document.getElementById('sourcehide')
  var sourceControlsElement = document.getElementById('sourcecontrols')
  var sourcePanelElement = document.getElementById('sourcepanel')

  var recentElement = document.getElementById('recent')
  var titleElement = document.getElementById('title')

  var baseUrl = window.location.origin + viewPrefix
  urlElement.innerText = baseUrl
  nameElement.value = name()
  evalElement.placeholder = 'Enter text, e.g. [something|other]'

  if (recent && recent.length)
    recentElement.innerHTML = 'Recently updated: ' + recent
    .map (function (recentName) { return '<a href="' + baseUrl + recentName + '">' + recentName + '</a>' })
    .join (", ")
  
  var totalExpansions = 0, currentExpansionCount = 0   // use this to avoid async issues where earlier calls overwrite later results
  var varsAfterCurrentExpansion = {}, currentExpansionText
  function show (text, vars, showConfig) {
    var expansionCount = ++totalExpansions
    return function (expansion) {
      if (expansionCount > currentExpansionCount) {
	currentExpansionText = expansion.text
        expElement.innerHTML = marked (currentExpansionText)
        currentExpansionCount = expansionCount
	if (showConfig && showConfig.pushState)
	  pushState ({ text: text, vars: vars, expansion: showConfig.quiet ? undefined : { text: expansion.text, vars: expansion.vars } })
        extend (varsAfterCurrentExpansion = {}, expansion.vars)
      }
    }
  }
  function render (expansion) {
    return show() (expansion)
  }
  function pushState (pushStateConfig) {
    var name = pushStateConfig.name || config.name,
	text = pushStateConfig.text,
	vars = pushStateConfig.vars,
	expansion = pushStateConfig.expansion,
	showEval = pushStateConfig.showEval
    var newUrl = viewPrefix + name, params = []
    var evalText = evalElement.innerText
    if (text) params.push ('text=' + window.encodeURIComponent(text))
    if (vars) { var v = JSON.stringify(vars); if (v !== '{}') params.push ('vars=' + window.encodeURIComponent(v)) }
    if (showEval) params.push ('eval=' + window.encodeURIComponent(evalText))
    if (expansion) params.push ('exp=' + window.encodeURIComponent(JSON.stringify(expansion)))
    if (params.length) newUrl += '?' + params.join('&')
    window.history.pushState ({ name: name, text: text, vars: vars, evalText: evalText }, '', newUrl)
  }
  function bookmark (showExp) {
    var state = { text: config.init, vars: initVars, showEval: true }
    if (showExp)
      state.expansion = { text: currentExpansionText, vars: varsAfterCurrentExpansion } || ''
    pushState (state)
  }
  
  function makeLink (text, link) {
    var safeLink = window.braceryWeb.escapeHTML (link.text)
    return '<a href="#" onclick="handleBraceryLink(\'' + safeLink + '\')">' + text.text + '</a>'
  }
  function handleBraceryLink (newEvalText) {
    window.event.preventDefault();
    return update (newEvalText, varsAfterCurrentExpansion, { pushState: true });
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
    getBracery (name(), function (reloadedEvalText) {
      evalElement.innerText = reloadedEvalText
      delete config.init
      update (undefined, undefined, { pushState: true, quiet: true })  // push state without init text
    })
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
    else if (!text)
      errorElement.innerText = 'You cannot save an empty definition. Please enter some text.'
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
	  setName (name)
	  pushState ({ name: name, text: initText(), vars: initVars })
          delete braceryCache[name]
        }
      })
    }
  }
  function setName (name) {
    titleElement.innerText = name
    document.title = name
    config.name = name
  }

  var delayedUpdateTimer = null, updateDelay = 400
  function evalChanged (evt) {
    cancelDelayedUpdate()
    setTimeout (update, updateDelay)
    // The user typing input on the page overrides whatever was in the URL (or the current game state),
    // so clear the 'init' config parameter (corresponding to the '?text=' query URL parameter)
    // and then push a clean URL
    if (config.init) {
      delete config.init
      pushState ({ vars: initVars })
    }
  }
  function cancelDelayedUpdate() {
    if (delayedUpdateTimer) {
      clearTimeout (delayedUpdateTimer)
      delayedUpdateTimer = null
    }
  }
  function update (updateText, updateVars, showConfig) {
    cancelDelayedUpdate()
    return new Promise (function (resolve, reject) {
      try {
	errorElement.innerText = ''

	// The text to be expanded is updateText, the first argument to the update() function (if defined),
	// or whatever is currently specified by config.init (originally set by query URL, may change dynamically),
	// or (if neither of those are defined) the current contents of evalElement.
	const text = (typeof(updateText) === 'string'
		      ? updateText
		      : (typeof(initText()) === 'string'
			 ? initText()
			 : (evalElement.innerText.match(/\S/)
			    ? evalElement.innerText
			    : '')));

	if (typeof(updateVars) === 'undefined')
          updateVars = initVars
	
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

	// The URL that gets pushed includes updateText & updateVars
	var showExpansion = show (updateText, updateVars, showConfig)
	function showAndResolve (expansion) {
	  showExpansion (expansion)
	  resolve (expansion)
	}

	var callbacks = { expand: expandSymbol,
                          get: getSymbol,
                          set: setSymbol,
                          callback: showAndResolve,
                          makeLink: makeLink }

	var braceryServer = new bracery.Bracery()
	braceryServer.expand (text, extend (callbacks,
					    expandConfig,
					    { vars: extend ({}, updateVars) }))
      } catch (e) {
	expElement.innerText = e
	reject (e)
      }
    })
  }
  function revealSource (evt) {
    evt.preventDefault()
    sourceControlsElement.style.display = ''
    sourcePanelElement.style.display = ''
    sourceRevealElement.style.display = 'none'
  }
  function hideSource (evt) {
    evt.preventDefault()
    sourceControlsElement.style.display = 'none'
    sourcePanelElement.style.display = 'none'
    sourceRevealElement.style.display = ''
  }
  evalElement.addEventListener ('keyup', evalChanged)
  eraseElement.addEventListener ('click', function (evt) { evt.preventDefault(); evalElement.innerText = ''; update().then(bookmark) })
  resetElement.addEventListener ('click', function (evt) { evt.preventDefault(); reset() })
  rerollElement.addEventListener ('click', function (evt) { evt.preventDefault(); update() })
  bookmarkElement.addEventListener ('click', function (evt) { evt.preventDefault(); bookmark (true) })
  saveElement.addEventListener ('click', function (evt) { evt.preventDefault(); save() })
  nameElement.addEventListener ('keyup', function (evt) { evt.preventDefault(); sanitizeName() })
  sourceRevealElement.addEventListener ('click', revealSource)
  sourceHideElement.addEventListener ('click', hideSource)

  window.handleBraceryLink = handleBraceryLink  // make this globally available
  window.onpopstate = function (evt) {
    var state = evt.state || {}
    if (state.name)
      setName (state.name)
    if (typeof(state.evalText) !== 'undefined')
      evalElement.innerText = state.evalText
    if (typeof(state.expansion) !== 'undefined')
      render (state.expansion)
    else
      update (state.text, state.vars)
  }

  if (urlParams.exp)
    render (JSON.parse (window.decodeURIComponent (urlParams.exp)))
  else
    update()
}
