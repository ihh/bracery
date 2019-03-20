var extend = window.braceryWeb.extend;
var escapeHTML = window.braceryWeb.escapeHTML;
var expandMarkdown = window.braceryWeb.expandMarkdown;
var digestHTML = window.braceryWeb.digestHTML;
var clickHandlerName = window.braceryWeb.clickHandlerName;
var makeInternalLink = window.braceryWeb.makeInternalLink;
var braceryLimits = window.braceryWeb.braceryLimits;
var suggestionsName = window.braceryWeb.suggestionsSymbolName;

var viewConfig = { bookmark: { link: false,
			       reset: false,
			       save: true,
			       firstEdit: false },
		   alwaysShowEvalInBookmarks: true };

var maxTweetLen = 280;

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
  function initVars() { return config.vars }  // make this dynamic, as initVars is reset when user clicks reload
  var recent = config.recent
  var bots = config.bots
  var referring = config.referring
  var bookmarkPrefix = config.bookmark
  var storePrefix = config.store
  var viewPrefix = config.view
  var expandPrefix = config.expand
  var loginPrefix = config.login
  var twitterPrefix = config.twitter
  var user = config.user
  var revision = config.revision

  var urlParams = getUrlParams()
  var expandConfig = extend ({}, braceryLimits)
  Object.keys (expandConfig).forEach (function (param) {
    if (urlParams[param])
      expandConfig[param] = urlParams[param]
  })

  var braceryServer = new bracery.Bracery (null, { rita: window.RiTa })

  var evalElement = document.getElementById('eval')
  var eraseElement = document.getElementById('erase')
  var resetElement = document.getElementById('reset')
  var rerollElement = document.getElementById('reroll')
  var refsElement = document.getElementById('refs')
  var referringElement = document.getElementById('referring')
  var expElement = document.getElementById('expansion')
  var tweetElement = document.getElementById('tweet')

  var urlElement = document.getElementById('urlprefix')
  var nameElement = document.getElementById('name')
  var lockElement = document.getElementById('lock')
  var saveElement = document.getElementById('save')
  var revElement = document.getElementById('revision')

  var errorElement = document.getElementById('error')

  var sourceRevealElement = document.getElementById('sourcereveal')
  var sourceHideElement = document.getElementById('sourcehide')
  var sourceControlsElement = document.getElementById('sourcecontrols')
  var sourcePanelElement = document.getElementById('sourcepanel')
  var lockPanelElement = document.getElementById('lockpanel')

  var debugRevealElement = document.getElementById('debugreveal')
  var debugHideElement = document.getElementById('debughide')
  var beforeElement = document.getElementById('varsbefore')
  var afterElement = document.getElementById('varsafter')
  var initElement = document.getElementById('init')

  var suggestPanelElement = document.getElementById('suggestpanel')
  var suggestElement = document.getElementById('suggest')
  var suggestionsElement = document.getElementById('suggestions')
  var dismissElement = document.getElementById('dismiss')

  var recentElement = document.getElementById('recent')
  var titleElement = document.getElementById('title')

  var loginElement = document.getElementById('login')
  var logoutElement = document.getElementById('logout')
  var loginLinkElement = document.getElementById('loginlink')
  var logoutLinkElement = document.getElementById('logoutlink')

  var autoElement = document.getElementById('auto')
  var botsElement = document.getElementById('bots')

  var baseUrl = window.location.origin
  var baseViewUrl = baseUrl + viewPrefix
  urlElement.innerText = baseViewUrl
  nameElement.value = name()
  evalElement.placeholder = 'Enter text, e.g. [something|other]'

  var domParser = new DOMParser()  // for digests
  var getTextContent = function (html) {
    return domParser.parseFromString(html,'text/html').documentElement.textContent
  }
  
  // Little wrapper for external links that adds current application state as query parameters in the URL,
  // so it can be recorded in the session before callout/callback.
  var addStateToLink = 'addStateToLink';
  window['addStateToLink'] = function() {
    window.event.preventDefault()
    var href = window.event.target.href.split('?'), params = {}
    href.slice(1).join('').split('&').forEach (function (p) {
      var pv = p.split('=')
      params[pv[0]] = window.decodeURIComponent (pv[1])
    })
    params.name = name()
    window.location.href = href[0] + stateQueryArgs (currentState(true), params)
  }
  
  // Internal link. Looks like an external link, but just rewrites text in evalElement
  window[clickHandlerName] = function (newEvalText) {
    window.event.preventDefault();
    return update (newEvalText, varsAfterCurrentExpansion, { pushState: viewConfig.bookmark.link })
      .then (function() { saveAppStateToServer(false); })
  }

  // List of bots
  if (user) {
    botsElement.innerHTML = '<hr>'
      + (Object.keys(bots).length
         ? ('Current auto-tweets:<ul>'
            + Object.keys (bots).map (function (botName) {
              return '<li>'
                + 'As @<a href="https://twitter.com/' + botName + '">' + botName + '</a>'
                + ' (' + makeExternalLink ('revoke all', twitterPrefix, { unsubscribe: true }, addStateToLink) + ')'
                + '<ul>'
                + bots[botName].map (function (sym) {
                  return '<li>' + makeExternalLink (sym, viewPrefix + sym)
                    + ' (' + makeExternalLink ('revoke', twitterPrefix, { source: sym, unsubscribe: true }, addStateToLink) + ')'
                }).join('')
                + '</ul></li>'
            }).join('') + '</ul>')
         : '')
    setupAutoLink()
  }
  function setupAutoLink() {
    autoElement.innerHTML = makeExternalLink ('Add this page', twitterPrefix, { source: name() }, addStateToLink)
      + ' to auto-tweets'
  }

  // Referring pages
  if (referring)
    referringElement.innerHTML = makeRefList ('Used by', referring, 'No other pages refer to this page')
  
  // Recently-updated pages
  if (recent)
    recentElement.innerHTML = makeRefList ('Recently updated', recent)

  // Application state
  var evalTextEdited = false  // indicates evalElement.innerText is "as loaded" from initText() = config.init; set by change event on evalElement, cleared by reload
  var totalExpansions = 0, currentExpansionCount = 0   // used to avoid async issues where HTTP response callbacks from earlier clicks overwrite (what should be) later results
  var varsBeforeCurrentExpansion, varsAfterCurrentExpansion, currentSourceText, currentExpansionText  // the current state of the internal Bracery expansion at the core of the app
  var rerollMeansRestart = false
  function show (text, vars, showConfig) {
    var expansionCount = ++totalExpansions
    return function (expansion) {
      if (expansionCount > currentExpansionCount) {
	currentSourceText = text
	currentExpansionText = expansion.text
	extend (varsBeforeCurrentExpansion = {}, vars || initVars())
        extend (varsAfterCurrentExpansion = {}, expansion.vars)
        currentExpansionCount = expansionCount
	rerollMeansRestart = !!text

        var html = expandMarkdown (currentExpansionText, marked)  // Markdown expansion
        expElement.innerHTML = html

	rerollElement.innerHTML = rerollMeansRestart ? 'Restart' : 'Re-roll'
	beforeElement.innerHTML = makeVarHtml (varsBeforeCurrentExpansion)
	afterElement.innerHTML = makeVarHtml (varsAfterCurrentExpansion)
	initElement.innerText = currentText (currentSourceText)

	if (showConfig && showConfig.pushState)
	  pushState ({ text: currentSourceText,
		       vars: varsBeforeCurrentExpansion,
		       expansion: (showConfig.quiet
				   ? undefined
				   : { text: currentExpansionText,
				       vars: varsAfterCurrentExpansion }) })
        updateRefs (currentSourceText)
      }
    }
  }
  function render (expansion) {
    return show() (expansion)
  }
  function updateRefs (text) {
    text = text || config.init || evalElement.innerText
    var isRef = {}
    bracery.ParseTree.getSymbolNodes (bracery.ParseTree.parseRhs (text), true)
      .forEach (function (node) { isRef[node.name] = true })
    var refs = Object.keys (isRef)
    refsElement.innerHTML = makeRefList ('References', refs)
  }
  function makeRefList (prefix, symbols, absentText) {
    return (symbols.length
	    ? (prefix + ': ' + symbols.map (function (name) {
              return '~<a href="' + baseViewUrl + name + '?edit=true" target="_blank">' + name + '</a>'
	    }).join(', '))
	    : (absentText || ''))
  }

  function makeVarHtml (vars) {
    return Object.keys(vars).sort().map (function (name) {
      return '<span class="var">$' + name + '</span>=<span class="val">' + vars[name] + '</span>'
    }).join(', ')
  }
  
  function makeExternalLink (text, link, params, onclick) {
    var url = link
    if (params && Object.keys(params).length)
      url += '?' + Object.keys(params).map (function (p) {
        return p + '=' + window.encodeURIComponent (params[p])
      }).join('&')
    return '<a href="' + url + '"' + (onclick ? (' onclick="' + onclick + '()"') : '') + '>' + text + '</a>'
  }

  function doLogin() {
    window.location.href = loginPrefix + stateQueryArgs (currentState(true), { name: config.name, login: 'true' })
  }
  function doLogout() {
    window.location.href = loginPrefix + stateQueryArgs (currentState(true), { name: config.name, logout: 'true' })
  }
  function stateQueryArgs (pushStateConfig, miscArgs) {
    var name = pushStateConfig.name || config.name,
	text = pushStateConfig.text,
	vars = pushStateConfig.vars,
	expansion = pushStateConfig.expansion,
	showEval = pushStateConfig.showEval
    var evalText = evalElement.innerText
    var params = []
    if (text)
      params.push (['text', window.encodeURIComponent(text)])
    if (vars) {
      var v = JSON.stringify(vars);
      if (v !== '{}')
        params.push (['vars', window.encodeURIComponent(v)])
    }
    if (showEval && (config.init || evalTextEdited || viewConfig.alwaysShowEvalInBookmarks))
      params.push (['eval', window.encodeURIComponent(evalText)])
    if (expansion)
      params.push (['exp', window.encodeURIComponent(JSON.stringify(expansion))])
    if (miscArgs)
      params = params.concat (Object.keys (miscArgs).map (function (arg) { return [arg, miscArgs[arg]] }))
    return (params.length ? ('?' + params.map(function(pv){return pv[0]+'='+pv[1]}).join('&')) : '')
  }
  function stateBody (pushStateConfig, miscArgs) {
    return extend ({ name: pushStateConfig.name || config.name,
                     text: pushStateConfig.text,
                     vars: pushStateConfig.vars,
                     expansion: pushStateConfig.expansion },
                   miscArgs,
                   pushStateConfig.showEval
                   ? { eval: evalElement.innerText }
                   : {})
  }
  function pushState (pushStateConfig) {
    var name = pushStateConfig.name || config.name,
	text = pushStateConfig.text,
	vars = pushStateConfig.vars
    var evalText = evalElement.innerText
    window.history.pushState ({ name: name, text: text, vars: vars, evalText: evalText }, '', viewPrefix + name + stateQueryArgs (pushStateConfig))
  }
  function currentState (showExp) {
    var state = { text: currentSourceText,
		  vars: varsBeforeCurrentExpansion,
		  showEval: true }
    if (showExp)
      state.expansion = { text: currentExpansionText || '',
			  vars: varsAfterCurrentExpansion || {} }
    return state
  }
  function bookmark (showExp) {
    pushState (currentState (showExp))
  }
  
  var braceryCache = {}
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

  function expandBracery (symbolName, vars, callback) {
    function reqListener () {
      var responseBody = JSON.parse (this.responseText);
      callback ([responseBody.text || '']);
    }
    var req = new XMLHttpRequest();
    req.addEventListener("load", reqListener);
    req.open("GET", window.location.origin + expandPrefix + symbolName + "?vars=" + encodeURIComponent (JSON.stringify (vars)));
    req.send();
  }

  function storeBracery (config) {
    var symbolName = config.name
    var symbolDef = config.def
    var callback = config.callback
    var locked = config.locked
    var req = new XMLHttpRequest();
    req.open("PUT", window.location.origin + storePrefix + symbolName);
    req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    req.onreadystatechange = function() {
      if (this.readyState === XMLHttpRequest.DONE) {
        if (this.status === 200) {
          callback (null, JSON.parse (this.responseText))
        } else
          callback (this.status)
      }
    }
    var body = { bracery: symbolDef,
                 locked: !!locked }
    req.send (JSON.stringify (body));
  }

  function saveAppStateToServer (createBookmark) {
    return new Promise ((resolve) => {
      var callback = function (err, result) {
        if (err) {
          errorElement.innerText = 'Sorry, an error occurred (' + err + ').'
          throw new Error (err)
        } else if (createBookmark && result) {
          errorElement.innerHTML = 'Bookmarked: <a href="' + result.url + '">' + result.id + '</a>.'
          resolve (result)
        }
      }
      if (createBookmark)
	errorElement.innerText = 'Bookmarking...'
      var req = new XMLHttpRequest();
      req.open("POST", window.location.origin + bookmarkPrefix);
      req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
      var reqBody = stateBody (currentState(true),
			       { name: config.name,
				 link: !!createBookmark })
      req.onreadystatechange = function() {
        if (this.readyState === XMLHttpRequest.DONE) {
          if (this.status === 200)
            callback (null, this.responseText && JSON.parse (this.responseText))
          else
            callback (this.status)
        }
      }
      req.send (JSON.stringify (reqBody));
    })
  }

  var awaitingBookmark = false  // guard against double-clicks
  function twitterWebIntent (evt) {
    evt.preventDefault()
    if (!awaitingBookmark) {
      awaitingBookmark = true
      var html = expandMarkdown (currentExpansionText, marked)  // Markdown expansion
      return saveAppStateToServer(true)
        .then (function (bookmark) {
          var tweet = digestHTML (html, getTextContent, maxTweetLen - (bookmark.url.length + 1))
          var webIntentUrl = 'https://twitter.com/intent/tweet'
              + '?text=' + encodeURIComponent(tweet)
              + '&url=' + encodeURI(bookmark.url)
          window.open(webIntentUrl, '_blank')
          awaitingBookmark = false
        }).catch (function() {
          awaitingBookmark = false
        })
    }
  }

  function reset() {
    getBracery (name(), function (reloadedEvalText) {
      evalElement.innerText = reloadedEvalText
      delete config.init
      delete config.vars
      evalTextEdited = false
      update (undefined, undefined, { pushState: viewConfig.bookmark.reset,
				      quiet: true })  // push state without init text
    })
  }
  function sanitizeName() {
    nameElement.value = nameElement.value.replace(/ /g,'_').replace(/[^A-Za-z_0-9]/g,'')
  }
  function save() {
    var name = nameElement.value.toLowerCase()
    var text = evalElement.innerText
    var locked = !!lockElement.checked
    if (!name)
      errorElement.innerText = 'Please enter a name.'
    else if (!text)
      errorElement.innerText = 'You cannot save an empty definition. Please enter some text.'
    else {
      errorElement.innerText = 'Saving...'
      storeBracery
      ({ name: name,
         def: text,
         locked: locked,
         callback: function (err, result) {
           if (err) {
             if (err === 403)
               errorElement.innerText = 'Sorry, the name "' + name + '" is reserved. Try saving as another name.'
             else
               errorElement.innerText = 'Sorry, an error occurred (' + err + ').'
           } else {
             errorElement.innerText = 'Saved.'
	     setName (name)
	     showRevision (result.revision)
	     if (viewConfig.bookmark.save)
	       pushState ({ name: name,
                            text: initText(),
                            vars: initVars() })
             delete braceryCache[name]
           }
         }
       })
    }
  }
  function showRevision (rev) {
    if (rev) {
      var html = 'Revision ' + rev
      if (rev > 1)
	html += '<br>(<a href="' + viewPrefix + name() + '?edit=true&rev=' + (rev-1) + '">previous</a>)'
      revElement.innerHTML = html
    }
  }
  
  function warnUnsaved() {
    errorElement.innerText = 'Changes will not be final until saved.'
  }

  function setName (name) {
    titleElement.innerText = name
    document.title = name
    config.name = name
    setupAutoLink()
  }

  var delayedUpdateTimer = null, updateDelay = 400
  function evalChanged (evt) {
    cancelDelayedUpdate()
    delayedUpdateTimer = setTimeout (function() {
      update().then (function() { saveAppStateToServer(false) })
    }, updateDelay)
    evalTextEdited = true
    warnUnsaved()
    // The user typing input on the page overrides whatever was in the URL (or the current game state),
    // so clear the 'init' and 'vars' config parameters, and then push a clean URL
    if (config.init || config.vars) {
      delete config.init
      delete config.vars
      if (viewConfig.bookmark.firstEdit)
	pushState({})
    }
  }
  function cancelDelayedUpdate() {
    if (delayedUpdateTimer) {
      clearTimeout (delayedUpdateTimer)
      delayedUpdateTimer = null
    }
  }
  function currentText (updateText) {
    return (typeof(updateText) === 'string'
	    ? updateText
	    : (typeof(initText()) === 'string'
	       ? initText()
	       : (evalElement.innerText.match(/\S/)
		  ? evalElement.innerText
		  : '')));
  }
  function update (updateText, updateVars, showConfig) {
    cancelDelayedUpdate()
    return new Promise (function (resolve, reject) {
      try {
	var text = currentText (updateText)
	var vars = extend ({},
			   (typeof(updateVars) === 'undefined'
			    ? initVars()
			    : updateVars))
	
	// The URL that gets pushed includes updateText & updateVars
	var showExpansion = show (updateText, updateVars, showConfig)
	function showAndResolve (expansion) {
	  showExpansion (expansion)
	  resolve (expansion)
	}

	var callbacks = extend ({ callback: showAndResolve,
				  makeLink: makeInternalLink.bind (null, btoa) },
				braceryExpandCallbacks)

	braceryServer.expand (text, extend (callbacks,
					    expandConfig,
					    { vars: vars }))
        
      } catch (e) {
	expElement.innerText = e
	reject (e)
      }
    })
  }

  function getSymbol (config) {
    var symbolName = config.symbolName || config.node.name
    return new Promise (function (resolve, reject) {
      getBracery (symbolName.toLowerCase(), function (bracery) {
	resolve ([bracery])
      })
    })
  }
  function setSymbol() { return [] }
  var braceryExpandCallbacks = { expand: null,  // signals to Bracery that we want it to fetch the symbol definition & then expand it locally
				 get: getSymbol,
				 set: setSymbol }

  function showSuggestions (evt) {
    evt.preventDefault();
    getBracery (suggestionsName, function (suggestionsText) {
      braceryServer.expand (suggestionsText, extend ({
	callback: function (expansion) {
	  suggestionsElement.innerHTML = expandMarkdown (expansion.text, marked)
	  revealElements ([dismissElement])
	}
      }, braceryExpandCallbacks, expandConfig))
    })
  }

  function setDisplay (elements, display) {
    elements.forEach (function (element) {
      element.style.display = display
    })
  }
  function hideElements (elements) { return setDisplay (elements, 'none') }
  function revealElements (elements) { return setDisplay (elements, '') }
  var sourceElements = [sourceControlsElement, sourcePanelElement, suggestPanelElement]
  var debugElements = [beforeElement, afterElement, initElement, debugHideElement]
  function revealSource (evt) {
    if (evt)
      evt.preventDefault()
    revealElements (sourceElements)
    hideElements ([sourceRevealElement])
  }
  function hideSource (evt) {
    if (evt)
      evt.preventDefault()
    hideElements (sourceElements)
    revealElements ([sourceRevealElement])
  }
  function revealDebug (evt) {
    if (evt)
      evt.preventDefault()
    revealElements (debugElements)
    hideElements ([debugRevealElement])
  }
  function hideDebug (evt) {
    if (evt)
      evt.preventDefault()
    hideElements (debugElements)
    revealElements ([debugRevealElement])
  }
  evalElement.addEventListener ('input', evalChanged)
  eraseElement.addEventListener ('click', function (evt) { evt.preventDefault(); evalElement.innerText = ''; update().then (viewConfig.bookmark.erase ? bookmark : undefined) })
  resetElement.addEventListener ('click', function (evt) { evt.preventDefault(); reset() })
  rerollElement.addEventListener ('click', function (evt) { evt.preventDefault(); if (!rerollMeansRestart || window.confirm('Really restart from the last bookmark? You will lose your progress.')) update() })
  tweetElement.addEventListener ('click', twitterWebIntent)
  saveElement.addEventListener ('click', function (evt) { evt.preventDefault(); save() })
  nameElement.addEventListener ('input', function (evt) { evt.preventDefault(); sanitizeName() })
  sourceRevealElement.addEventListener ('click', revealSource)
  sourceHideElement.addEventListener ('click', hideSource)
  debugRevealElement.addEventListener ('click', revealDebug)
  debugHideElement.addEventListener ('click', hideDebug)
  
  loginLinkElement.addEventListener ('click', function (evt) { evt.preventDefault(); doLogin() })
  logoutLinkElement.addEventListener ('click', function (evt) { evt.preventDefault(); doLogout() })
  lockElement.addEventListener ('input', warnUnsaved)

  suggestElement.addEventListener ('click', showSuggestions)
  dismissElement.addEventListener ('click', function (evt) { evt.preventDefault(); suggestionsElement.innerHTML = ''; hideElements ([dismissElement]) })
  
  if (user) {
    logoutElement.style.display = ''
    lockPanelElement.style.display = ''
  } else
    loginElement.style.display = ''
  
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

  if (urlParams.redirect)
    pushState({})  // get rid of the '?redirect=true'

  if (urlParams.edit)
    revealSource()

  showRevision (revision)

  var expansion = urlParams.exp || config.exp
  if (urlParams.exp)
    render (JSON.parse (window.decodeURIComponent (urlParams.exp)))
  else if (config.exp)
    render (config.exp)
  else
    update()
}
