import React, { Component } from 'react';
import { Bracery, ParseTree } from 'bracery';
import braceryWeb, { extend } from './bracery-web';
import RiTa from 'rita';
import marked from 'marked';
import DebouncePromise from 'awesome-debounce-promise';

import MapView from './MapView';
import './App.css';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      user: props.USER,
      bots: props.BOTS,

      name: props.SYMBOL_NAME,
      evalText: props.SYMBOL_DEFINITION,  // text entered into evaluation window
      evalTextEdited: false,
      parsedEvalText: this.parseBracery (props.SYMBOL_DEFINITION),
      revision: props.REVISION,
      locked: !!props.LOCKED_BY_USER,
      saveAsName: props.SYMBOL_NAME,

      initText: props.INIT_TEXT || props.SYMBOL_DEFINITION,  // value to reset text to
      initVars: props.INIT_VARS || {},  // value to reset vars to

      varsBeforeCurrentExpansion: props.INIT_VARS,
      currentSourceText: props.INIT_TEXT || props.SYMBOL_DEFINITION,

      currentExpansionText: (props.EXPANSION && props.EXPANSION.text) || '',
      varsAfterCurrentExpansion: (props.EXPANSION && props.EXPANSION.vars) || {},

      linkRevealed: {},

      warning: props.INITIAL_WARNING,

      mapSelection: {},
      editorContent: '',
      editorSelection: this.emptyEditorSelection(),
      editorFocus: false,
      editorDisabled: true,
      
      loggedIn: !!props.USER,
      editing: !!props.EDITING || true,  // DEBUG
      debugging: !!props.DEBUGGING,
      suggestions: props.SUGGESTIONS,
      rerollMeansRestart: false,

      referring: props.REFERRING_SYMBOLS,
      recent: props.RECENT_SYMBOLS,

      base: props.BASE_URL,
      store: props.STORE_PATH_PREFIX,
      view: props.VIEW_PATH_PREFIX,
      login: props.LOGIN_PATH_PREFIX,
      twitter: props.TWITTER_PATH_PREFIX,
      bookmark: props.BOOKMARK_PATH_PREFIX,

    };

    const urlParams = this.decodeURIParams();
    if (urlParams.edit)
      this.state.editing = true;
    if (urlParams.debug)
      this.state.debugging = true;
    if (urlParams.redirect || urlParams.reset)
      window.history.pushState ({}, '', this.encodeURIParams (window.location.origin + window.location.pathname,
							      extend (urlParams, { redirect: null, reset: null })));

    this.domParser = new DOMParser();
    this.bracery = new Bracery (null, { rita: RiTa });
    this.ParseTree = ParseTree;  // a convenience, for debugging
    this.braceryCache = {};
    this.debounceEvalChangedUpdate = DebouncePromise (this.evalChangedUpdate, this.evalChangedUpdateDelay);
    window[braceryWeb.clickHandlerName] = this.handleBraceryLink;
  }

  // Constants
  get warning() { return { unsaved: 'Changes will not be final until saved.',
			   noName: 'Please enter a name.',
			   noDef: 'You cannot save an empty definition. Please enter some text.',
			   saving: 'Saving...',
			   saved: 'Saved.' }; }
  get maxUrlLength() { return 2000; }  // a lower bound...
  get evalChangedUpdateDelay() { return 400; }
  get maxTweetLen() { return 280; }

  // Helpers
  emptyEditorSelection() {
    return { startOffset: 0, endOffset: 0 };
  }
  
  // Global methods
  handleBraceryLink = (newEvalText, linkType, linkName) => {
    var app = this;
    window.event.preventDefault();
    if (linkType === 'reveal') {
      let newLinkRevealed = extend ({}, this.state.linkRevealed);
      newLinkRevealed[linkName] = true;
      this.setState ({ linkRevealed: newLinkRevealed });
    } else {
      // linkType === 'link'
      this.promiseBraceryExpansion (newEvalText, this.state.varsAfterCurrentExpansion, { rerollMeansRestart: true })
	.then (function() { app.saveAppStateToServer(false); });
    }
  }

  // State persistence
  sessionState (includeExpansion) {
    var state = { name: this.state.name,
		  text: this.state.currentSourceText,
		  vars: JSON.stringify (this.state.varsBeforeCurrentExpansion),
		  eval: this.state.evalText };
    if (includeExpansion)
      state.expansion = JSON.stringify ({ text: this.state.currentExpansionText || '',
					  vars: this.state.varsAfterCurrentExpansion || {} });
    return state;
  }

  saveAppStateToServer (createBookmark) {
    const data = extend ({ link: !!createBookmark },
			 this.sessionState(true));
    return fetch (this.addHostPrefix (this.state.bookmark),
		  { method: 'POST',
		    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
		    body: JSON.stringify (data) })
      .then ((response) => response.json());
  }

  saveStateAndRedirect (url, params) {
    url = this.addHostPrefix(url);
    params = params || {};
    const bigParams = extend (this.sessionState(true), params);
    const bigUrl = this.encodeURIParams (url, bigParams);
    if (bigUrl.length < this.maxUrlLength)
      this.redirect (bigUrl);
    else {
      const smallUrl = this.encodeURIParams (url, params);
      this.saveAppStateToServer()
	.then (this.redirect.bind (this, smallUrl));
    }
  }

  // URL management
  decodeURIParams (url) {
    url = url || window.location.href;
    let params = {};
    url.replace (/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
      params[key] = window.decodeURIComponent (value);
    });
    return params;
  }

  encodeURIParams (url, params) {
    params = params || {};
    let paramNames = Object.keys(params).filter ((p) => params[p]);
    return url + (paramNames.length
		  ? ('?' + paramNames.map ((p) => (p + '=' + window.encodeURIComponent (params[p]))).join('&'))
		  : '');
  }

  addHostPrefix (path, params) {
    return (window.location.host === this.state.base ? '' : this.state.base) + this.encodeURIParams (path, params);
  }

  redirect (url) {
    window.location.href = url;
  }

  openTab (url) {
    window.open (url, '_blank');
  }

  // Button handlers
  reroll() {
    this.promiseBraceryExpansion (this.state.initText, this.state.initVars, { rerollMeansRestart: false });
  }

  erase() {
    this.setState ({ initText: '',
		     initVars: {},
		     evalText: '',
                     parsedEvalText: [],
		     currentSourceText: '',
		     evalTextEdited: true,
		     rerollMeansRestart: false,
		     warning: this.warning.unsaved
		   });
    this.promiseBraceryExpansion();
  }

  reload() {
    const name = this.state.name;
    this.getBracery (name)
      .then ((text) => {
	this.setState ({ saveAsName: name,
			 initText: text,
			 initVars: {},
			 evalText: text,
                         parsedEvalText: this.parseBracery(text),
			 currentSourceText: text,
			 evalTextEdited: false,
			 rerollMeansRestart: false,
			 warning: '' });
	return this.promiseBraceryExpansion();
      });
  }

  suggest() {
    const app = this;
    this.getBracery (braceryWeb.suggestionsSymbolName)
      .then ((suggestions) => {
	return app.bracery.expand (suggestions, extend ({ vars: {} }, app.braceryExpandCallbacks));
      }).then ((expansion) => {
	app.setState ({ suggestions: braceryWeb.expandMarkdown (expansion.text, marked) });
      });
  }
  
  tweet() {
    const app = this;
    const html = this.expandMarkdown();
    this.saveAppStateToServer(true)
      .then (function (bookmark) {
	return braceryWeb.digestText (app.getTextContent(html), app.maxTweetLen - (bookmark.url.length + 1))
	  .then (function (tweet) {
            const webIntentUrl = app.encodeURIParams ('https://twitter.com/intent/tweet',
						      { text: tweet,
							url: bookmark.url });
            app.openTab (webIntentUrl);
	  });
      });
  }

  login() {
    this.saveStateAndRedirect (this.state.login, { login: 'true' });
  }

  logout() {
    this.saveStateAndRedirect (this.state.login, { logout: 'true' });
  }
  
  revoke (sym) {
    this.saveStateAndRedirect (this.state.twitter, { source: sym, unsubscribe: 'true' });
  }

  revokeAll() {
    this.saveStateAndRedirect (this.state.twitter, { unsubscribe: 'true' });
  }

  autotweet() {
    this.saveStateAndRedirect (this.state.twitter, { source: this.state.name });
  }

  publish() {
    const app = this;
    const saveAsName = this.state.saveAsName;
    if (!saveAsName)
      return this.setState ({ warning: this.warning.noName });
    if (!this.state.evalText)
      return this.setState ({ warning: this.warning.noDef });

    const data = { bracery: this.state.evalText,
		   locked: this.state.locked };

    return Promise.promisify (this.setState.bind(this)) ({ warning: this.warning.saving })
      .then (() => fetch (this.addHostPrefix (this.state.store + saveAsName),
			  { method: 'PUT',
			    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
			    body: JSON.stringify (data) }))
      .then (() => app.setState ({ warning: app.warning.saved,
				   evalTextEdited: false,
				   rerollMeansRestart: false,
				   name: saveAsName }));
  }

  // Editor setState callback
  setAppStateFromMapView = (newState) => {
    if (newState.hasOwnProperty('evalText'))
      extend (newState,
              { currentSourceText: newState.evalText,
                initText: newState.evalText,
                initVars: {},
                evalTextEdited: true,
                warning: this.warning.unsaved });
    this.setState (newState);
  }
  
  // Event handlers
  evalChanged (event) {
    let text = event.target.value;
    if (text !== this.state.evalText) {
      this.setState ({ initText: text,
		       evalText: text,
                       parsedEvalText: this.parseBracery(text),
		       currentSourceText: text,
		       evalTextEdited: true,
                       mapSelection: {},
                       editorFocus: false,
                       editorContent: '',
                       editorSelection: this.emptyEditorSelection(),
		       warning: this.warning.unsaved
		   });
      return this.debounceEvalChangedUpdate();
    }
    return Promise.resolve();
  }

  evalChangedUpdate = () => {
    this.promiseBraceryExpansion (this.state.evalText, this.state.initVars, { rerollMeansRestart: false });
  }
  
  nameChanged (event) {
    let name = event.target.value
	.replace(/ /g,'_').replace(/[^A-Za-z_0-9]/g,'');
    this.setState ({ saveAsName: name });
  }

  lockChanged (event) {
    let locked = event.target.checked;
    this.setState ({ locked: locked });
  }
  
  // Interactions with store
  getBracery (symbolName) {
    var app = this;
    if (this.braceryCache[symbolName])
      return Promise.resolve (this.braceryCache[symbolName]);
    else
      return fetch (this.addHostPrefix (this.state.store + symbolName))
      .then ((response) => response.json())
      .catch (() => { return { bracery: '' }; })
      .then ((body) => {
        let result = body.bracery;
        app.braceryCache[symbolName] = result;
	return result;
      });
  }

  getSymbol (config) {
    return this.getBracery (config.symbolName || config.node.name)
      .then ((bracery) => [bracery]);
  }
  setSymbol() { return []; }
  get braceryExpandCallbacks() {
    return { expand: null,  // signals to Bracery that we want it to fetch the symbol definition & then expand it locally
	     callback: true,  // signals to Bracery that we want a Promise
	     makeLink: braceryWeb.makeInternalLink.bind (null, btoa),
	     get: this.getSymbol.bind (this),
	     set: this.setSymbol.bind (this) };
  }

  // Bracery update method
  promiseBraceryExpansion (text, vars, newState) {
    const app = this;
    text = typeof(text) !== 'undefined' ? text : app.state.currentSourceText;
    vars = extend ({}, typeof(vars) !== 'undefined' ? vars : app.state.varsBeforeCurrentExpansion);
    const varsBefore = extend ({}, vars);
    return new Promise (function (resolve, reject) {
      try {
	app.bracery.expand (text, extend ({ vars: vars }, app.braceryExpandCallbacks))
	  .then (resolve);
      } catch (e) {
	console.error(e);
	reject (e);
      }
    }).then (function (expansion) {
      app.setState (extend ({ currentSourceText: text,
			      varsBeforeCurrentExpansion: varsBefore,
			      currentExpansionText: expansion.text,
			      varsAfterCurrentExpansion: expansion.vars,
			      linkRevealed: {} },
			    newState || {}));
      return expansion;
    });
  }

  // Bracery parsing & analysis
  parseBracery (text) {
    const now = Date.now();
    const rhs = ParseTree.parseRhs (text);
    console.warn ('parsed in ' + (Date.now() - now) + 'ms');
    return rhs;
  }
  
  usingRefSets() {
    const rhs = this.state.parsedEvalText;
    let isRef = {}, isTracery = {};
    ParseTree.getSymbolNodes (rhs, { ignoreTracery: true })
      .forEach (function (node) { isRef[node.name] = true; });
    ParseTree.getSymbolNodes (rhs, { ignoreSymbols: true })
      .forEach (function (node) { isTracery[node.name] = true; });
    return [ { symbols: Object.keys(isRef) },
	     { symbols: Object.keys(isTracery), lSym: ParseTree.traceryChar, rSym: ParseTree.traceryChar } ];
  }
  
  // Rendering
  expandMarkdown() {
    return braceryWeb.expandMarkdown (this.state.currentExpansionText || '',
				      marked,
				      this.state.linkRevealed);
  }

  getTextContent (html) {
    return this.domParser.parseFromString (html, 'text/html').documentElement.textContent;
  }

  render() {
    const app = this;
    return (
      <div className="main">
        <div className="banner">
	  <span>
	    <a href={this.addHostPrefix(this.state.view)}>bracery</a> <span> / </span>
	    <span>{this.state.name}</span>
	  </span>
	  <span>{(this.state.rerollMeansRestart
		  ? <button onClick={()=>(window.confirm('Really restart? You will lose your progress.') && this.reroll())}>Restart</button>
		  : <button onClick={()=>this.reroll()}>Re-roll</button>)}</span>
	  <span><button onClick={()=>this.tweet()}>Tweet</button></span>
	  <span className="loginout">
	    {this.state.loggedIn
	     ? (<span>{this.state.user} / <button onClick={()=>this.logout()}>Logout</button></span>)
	     : (<span><button onClick={()=>this.login()}>Login / Signup</button></span>)
	    }
          </span>
	</div>
	{this.state.debugging
	 ? (<Vars vars={this.state.varsBeforeCurrentExpansion} className="varsbefore" />)
	 : ''}
        {this.state.debugging
         ? (<div className="source">{this.state.currentSourceText}</div>)
         : ''}
	<div className="expansion" dangerouslySetInnerHTML={{__html:this.expandMarkdown()}}></div>
	{this.state.debugging
	 ? (<Vars vars={this.state.varsAfterCurrentExpansion} className="varsafter" />)
	 : ''}
	<p>
	  {(this.state.editing
	    ? (<span>
	         Editing template text (<button onClick={()=>this.setState({editing:false})}>hide</button>
		 <span> / </span> <button onClick={()=>this.erase()}>erase</button>
		 <span> / </span> <button onClick={()=>this.reload()}>reload</button>
		 <span> / </span> <button onClick={()=>this.setState({debugging:!this.state.debugging})}>debug{this.state.debugging?' off':''}</button>
		 <span> / </span> <button onClick={()=>this.suggest()}>suggest</button>
		 <span> / </span> <a href="https://github.com/ihh/bracery#Bracery" target="_blank" rel="noopener noreferrer">docs</a>):</span>)
	    : (<span><button onClick={()=>this.setState({editing:true})}>Edit</button></span>))}
        </p>
	<div>
	  {this.state.suggestions
	   ? (<div>
	        <div className="suggestions" dangerouslySetInnerHTML={{__html:this.state.suggestions}} />
	        <button onClick={()=>this.setState({suggestions:''})}>Clear suggestions</button>
	      </div>)
	   : ''}
        </div>

      {this.state.editing
       ? (<MapView
          setAppState={this.setAppStateFromMapView}
          name={this.state.name}
          text={this.state.evalText}
          rhs={this.state.parsedEvalText}
          selected={this.state.mapSelection}
          editorContent={this.state.editorContent}
          editorSelection={this.state.editorSelection}
          editorFocus={this.state.editorFocus}
          editorDisabled={this.state.editorDisabled}
          />)
       : ''}
	<div>
	  {this.state.editing
	   ? (<div>
	        <div className="sourcepanel">
	          <div className="revision">Revision: {this.state.revision}
	            <span>{this.state.revision > 1
		           ? (<span> (<a href={this.addHostPrefix(this.state.view + this.state.name,{edit:'true',rev:this.state.revision-1})}>{this.state.revision-1}</a>)</span>)
		           : ''}</span></div>
	          <div className="evalcontainer">
	            <textarea className="eval" value={this.state.evalText} onChange={(event)=>this.evalChanged(event)}></textarea>
	          </div>
	  <Refs className="refs" prefix="References" view={this.addHostPrefix(this.state.view)} refSets={this.usingRefSets()} />
	          <Refs className="referring" prefix="Used by" view={this.addHostPrefix(this.state.view)} refSets={[{ symbols: this.state.referring }]} />
	          <br/>
	          <p>
	            <span>{this.addHostPrefix(this.state.view)}</span>
	            <input type="text" className="name" name="name" size="20" value={this.state.saveAsName} onChange={(event)=>this.nameChanged(event)}></input>
	            <button onClick={()=>this.publish()}>Publish</button>
	          </p>
	          <div>
	            {(this.state.loggedIn
	              ? (<div>
 		           <label>
	   	             <input type="checkbox" name="lock" checked={this.state.locked} onChange={(event)=>this.lockChanged(event)}></input>
		             Prevent other users from editing</label>
		         </div>)
	              : '')}
	          </div>
	          <div className="error">{this.state.warning}</div>
	        </div>
	      </div>)
	   : ''}
        </div>
	
	<div className="bots">
	  <hr/>
	  {(Object.keys(this.state.bots).length
            ? (<div>
	         <span>Current auto-tweets </span>
                 (<button onClick={()=>app.revokeAll()}>revoke all</button>)
	         <ul>{Object.keys (this.state.bots).map (function (botName, j) {
	           return (<li key={'bots'+j}>As <span> @<a href={'https://twitter.com/' + botName}>{botName}</a></span>
		  <ul>{app.state.bots[botName].map (function (sym, k) {
		    return (<li key={'bots'+j+'_'+k}><span>~<a href={app.state.view + sym}>{sym}</a> </span>
			      (<button onClick={()=>app.revoke(sym)}>revoke</button>)
	                    </li>);
		             })}</ul>
               </li>);})}</ul>
	       </div>)
	    : '')}
	</div>
	<div className="auto">
	  <button onClick={()=>this.autotweet()}>Add this page</button>
	  <span> to auto-tweets</span>
	</div>
	<hr/>
	<Refs className="recent" prefix="Recently updated" view={this.addHostPrefix(this.state.view)} refSets={[{ symbols: this.state.recent }]} />
      </div>
    );
  }
}

class Vars extends Component {
  render() {
    const vars = this.props.vars, className = this.props.className;
    return (<div className={this.props.className}>{
      Object.keys(vars).sort().map (function (name, k) {
	return (<span key={className+k}><span className="var">${name}</span>=<span className="val">{vars[name]}</span></span>);
      })
    }</div>);
  }
}

class Refs extends Component {
  render() {
    const view = this.props.view;
    const className = this.props.className;
    const absentText = this.props.absentText;
    const prefix = this.props.prefix;
    const refSets = this.props.refSets;
    const elements = refSets.reduce ((list, refSet, j) => {
      const symbols = refSet.symbols;
      let lSym = refSet.lSym, rSym = refSet.rSym;
      if (!lSym) { lSym = ParseTree.symChar; rSym = ''; }
      return list.concat (symbols.map ((name, k) => (<span key={className+j+'_'+k}>{lSym}<a href={view + name + '?edit=true'}>{name}</a>{rSym} </span>)));
    }, []);
    return (elements.length
	    ? (<div className={className}>{prefix}: {elements}</div>)
	    : (<div className={className}>{absentText || ''}</div>));
  }
}

export default App;
