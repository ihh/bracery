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

    const storage = localStorage.getItem (this.localStorageKey);
    const savedState = storage && JSON.parse(storage)[props.SYMBOL_NAME];

    const evalText = savedState ? savedState.eval : props.SYMBOL_DEFINITION;
    const initText = savedState ? savedState.initText : (props.INIT_TEXT || evalText);
    const currentSourceText = savedState ? savedState.text : initText;
    const initVars = (savedState ? JSON.parse(savedState.initVars) : props.INIT_VARS) || {};
    const varsBeforeCurrentExpansion = (savedState && JSON.parse(savedState.vars)) || initVars;
    const currentExpansionText = savedState ? savedState.expansion.text : '';
    const varsAfterCurrentExpansion = (savedState && savedState.expansion.vars) || {};

    this.state = {
      user: props.USER,
      bots: props.BOTS,

      name: props.SYMBOL_NAME,
      evalText,  // text entered into evaluation window
      evalTextEdited: false,
      parsedEvalText: this.parseBracery (evalText),
      revision: props.REVISION,
      locked: !!props.LOCKED_BY_USER,
      hidden: !!props.HIDDEN_BY_USER,

      saveAsUser: this.userPartOfName (props.SYMBOL_NAME),
      saveAsSymbol: this.symbolPartOfName (props.SYMBOL_NAME),

      initText,  // value to reset text to
      initVars,  // value to reset vars to

      varsBeforeCurrentExpansion,
      currentSourceText,

      currentExpansionText,
      varsAfterCurrentExpansion,

      linkRevealed: {},

      warning: props.INITIAL_WARNING,

      mapText: evalText,
      mapSelection: {},
      
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
    
    const urlParams = braceryWeb.decodeURIParams();
    if (urlParams.edit)
      this.state.editing = true;
    if (urlParams.debug)
      this.state.debugging = true;
    if (urlParams.redirect || urlParams.reset)
      window.history.pushState ({}, '', braceryWeb.encodeURIParams (window.location.origin + window.location.pathname,
							            extend (urlParams, { redirect: null, reset: null })));

    this.mapView = React.createRef();

    this.domParser = new DOMParser();
    this.bracery = new Bracery (null, { rita: RiTa });
    this.ParseTree = ParseTree;  // a convenience, for debugging
    this.braceryCache = {};
    this.debounceMapChanged = DebouncePromise (this.mapChanged.bind(this), this.mapChangedDelay);
    window[braceryWeb.clickHandlerName] = this.handleBraceryLink.bind(this);
  }

  // Constants
  get warning() { return { unsaved: 'Changes will not be final until saved.',
			   noName: 'Please enter a name.',
			   noDef: 'You cannot save an empty definition. Please enter some text.',
			   saving: 'Saving...',
			   saved: 'Saved.',
                           pleaseFork: 'You don\'t have write permission for this symbol. Fork to make your own version.' }; }
  get maxUrlLength() { return 2000; }  // a lower bound...
  get mapChangedDelay() { return 400; }
  get maxTweetLen() { return 280; }

  get localStorageKey() { return 'bracery_app'; }
  
  // Helpers
  emptyEditorSelection() {
    return { startOffset: 0, endOffset: 0 };
  }

  userPartOfName (name) {
    return braceryWeb.userPartOfName (name || this.state.name) || braceryWeb.defaultUserName;
  }
  
  symbolPartOfName (name) {
    return braceryWeb.symbolPartOfName (name || this.state.name) || braceryWeb.defaultSymbolName;
  }
  
  // Global methods
  handleBraceryLink (newEvalText, linkType, linkName) {
    window.event.preventDefault();
    if (linkType === 'reveal') {
      let newLinkRevealed = extend ({}, this.state.linkRevealed);
      newLinkRevealed[linkName] = true;
      this.setState ({ linkRevealed: newLinkRevealed });
    } else {
      // linkType === 'link'
      this.promiseBraceryExpansion (newEvalText, this.state.varsAfterCurrentExpansion, { rerollMeansRestart: true })
	.then (() => { this.saveAppStateToLocalStorage(); });
    }
  }

  // State persistence
  currentPersistentState (includeExpansion) {
    var state = { name: this.state.name,
		  text: this.state.currentSourceText,
		  vars: JSON.stringify (this.state.varsBeforeCurrentExpansion),
		  initText: this.state.initText,
		  initVars: JSON.stringify (this.state.initVars),
		  eval: this.state.evalText };
    if (includeExpansion)
      state.expansion = JSON.stringify ({ text: this.state.currentExpansionText || '',
					  vars: this.state.varsAfterCurrentExpansion || {} });
    return state;
  }

  saveAppStateToLocalStorage() {
    const data = this.currentPersistentState (true);
    const key = this.localStorageKey;
    let storage = JSON.parse (localStorage.getItem(key) || '{}');
    storage[data.name] = data;
    localStorage.setItem (key, JSON.stringify (storage));
  }

  createBookmark() {
    const data = extend ({ link: true },
			 this.currentPersistentState (true));
    return fetch (this.addHostPrefix (this.state.bookmark),
		  { method: 'POST',
		    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
		    body: JSON.stringify (data) })
      .then ((response) => response.json());
  }

  saveStateAndRedirect (url, params) {
    params = params || {};
    const redirectUrl = braceryWeb.encodeURIParams (this.addHostPrefix(url), params);
    this.saveAppStateToLocalStorage();
    this.redirect (redirectUrl);
  }

  // URL management
  decodeURIParams (url) {
    url = url || window.location.href;
    let params = {};
    url.replace (/[?&]+([^=&]+)=([^&]*)/gi, (m,key,value) => {
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
    return (window.location.host === this.state.base ? '' : this.state.base) + braceryWeb.encodeURIParams (path, params);
  }

  viewURL (name, params) {
    return this.addHostPrefix (this.state.view + (name || ''), params);
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
	this.setState ({ saveAsSymbol: name,
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
    this.getBracery (braceryWeb.suggestionsSymbolName)
      .then ((suggestions) => {
	return this.bracery.expand (suggestions, extend ({ vars: {} }, this.braceryExpandCallbacks));
      }).then ((expansion) => {
	this.setState ({ suggestions: braceryWeb.expandMarkdown (expansion.text, marked) });
      });
  }
  
  tweet() {
    const html = this.expandMarkdown();
    this.createBookmark()
      .then ((bookmark) => {
	return braceryWeb.digestText (this.getTextContent(html), this.maxTweetLen - (bookmark.url.length + 1))
	  .then ((tweet) => {
            const webIntentUrl = braceryWeb.encodeURIParams ('https://twitter.com/intent/tweet',
						             { text: tweet,
							       url: bookmark.url });
            this.openTab (webIntentUrl);
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

  saveAs (user, symbol) {
    const saveAsUser = user || this.state.saveAsUser;
    const saveAsSymbol = symbol || this.state.saveAsSymbol;
    const saveAsName = saveAsUser + '/' + saveAsSymbol;
    const nameOwned = this.state.loggedIn && this.state.user === saveAsUser;

    if (!saveAsSymbol)
      return this.setState ({ warning: this.warning.noName });

    if (!this.state.evalText)
      return this.setState ({ warning: this.warning.noDef });

    if (!nameOwned && this.state.locked)
      return this.setState ({ warning: this.warning.pleaseFork });

    let data = { bracery: this.state.evalText };
    if (this.state.locked)
      data.locked = true;
    if (this.state.hidden)
      data.hidden = true;

    return new Promise ((resolve) => {
      this.setState ({ saveAsUser,
                       saveAsSymbol,
                       warning: this.warning.saving },
                     resolve);
    }).then (() => fetch (this.addHostPrefix (this.state.store + saveAsName),
			  { method: 'PUT',
			    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
			    body: JSON.stringify (data) }))
      .then (() => this.setState ({ warning: this.warning.saved,
				    evalTextEdited: false,
				    rerollMeansRestart: false,
				    name: saveAsName }));
  }

  // Editor open page callback
  openSymPage (symName) {
    this.openTab (this.viewURL (symName));
  }
  
  // Event handlers
  evalChanged (event) {
    let text = event.target.value;
    if (text !== this.state.evalText) {
      this.setState ({ evalText: text,
                       initText: text,
		       parsedEvalText: this.parseBracery(text),
		       evalTextEdited: true,
                       mapSelection: {},
		       warning: this.warning.unsaved,
		       rerollMeansRestart: false,
		     },
		     () => (this.mapMounted() && this.mapView.updateGraph (text)));
    }
  }

  mapChanged (text) {
    this.setState ({ evalText: text,
                     initText: text,
		     parsedEvalText: this.parseBracery(text) },
                   this.saveAppStateToLocalStorage.bind (this));
  }

  mapMounted() {
    return this.state.editing;
  }
  
  nameChanged (event) {
    let name = event.target.value
	.replace(/ /g,'_').replace(/[^A-Za-z_0-9]/g,'');
    this.setState (extend ({ saveAsSymbol: name },
                           this.state.loggedIn ? { saveAsUser: this.state.user } : {}));
  }

  editPermissionChanged (event) {
    let locked = !event.target.checked;
    this.setState ({ locked });
  }

  readPermissionChanged (event) {
    let hidden = !event.target.checked;
    this.setState ({ hidden });
  }

  // Interactions with store
  getBracery (symbolName) {
    if (this.braceryCache[symbolName])
      return Promise.resolve (this.braceryCache[symbolName]);
    else
      return fetch (this.addHostPrefix (this.state.store + symbolName))
      .then ((response) => response.json())
      .catch (() => { return { bracery: '' }; })
      .then ((body) => {
        let result = body.bracery;
        this.braceryCache[symbolName] = result;
	return result;
      });
  }

  getSymbol (config) {
    return this.getBracery (config.symbolName
			    || ((config.node.user || config.defaultUser || this.ParseTree.defaultUser) + '/' + config.node.name))
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
    text = typeof(text) !== 'undefined' ? text : this.state.currentSourceText;
    vars = extend ({}, typeof(vars) !== 'undefined' ? vars : this.state.varsBeforeCurrentExpansion);
    const varsBefore = extend ({}, vars);
    return new Promise ((resolve, reject) => {
      try {
	this.bracery.expand (text, extend ({ vars: vars }, this.braceryExpandCallbacks))
	  .then (resolve);
      } catch (e) {
	console.error(e);
	reject (e);
      }
    }).then ((expansion) => {
      this.setState (extend ({ currentSourceText: text,
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
//    const now = Date.now();
    const rhs = ParseTree.parseRhs (text);
//    console.warn ('parsed in ' + (Date.now() - now) + 'ms');
    return rhs;
  }
  
  usingRefSets() {
    const rhs = this.state.parsedEvalText;
    let isRef = {}, isTracery = {};
    ParseTree.getSymbolNodes (rhs, { ignoreTracery: true })
      .forEach ((node) => { isRef[node.name] = true; });
    ParseTree.getSymbolNodes (rhs, { ignoreSymbols: true })
      .forEach ((node) => { isTracery[node.name] = true; });
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
    return (
        <div className="main">

        <div className="banner">
	<span>
	<a href={this.viewURL()}>bracery</a>
	<span>{' / ' + this.userPartOfName() + ' / ' + this.symbolPartOfName()}</span>
	</span>
	<span>{(this.state.rerollMeansRestart
		? <button onClick={()=>(window.confirm('Really restart? You will lose your progress.') && this.reroll())}>Restart</button>
		: <button onClick={()=>this.reroll()}>Re-roll</button>)}</span>
	<span style="display:none;"><button onClick={()=>this.tweet()}>Tweet</button></span>
	<span className="loginout">
	{this.state.loggedIn
	 ? (<span>{this.state.user} / <button onClick={()=>this.logout()}>Logout</button></span>)
	 : (<span><button onClick={()=>this.login()}>Login / Signup</button></span>)
	}
      </span>
	</div>

      {this.state.debugging
       && (<Vars vars={this.state.varsBeforeCurrentExpansion} className="varsbefore" />)}

      {this.state.debugging
       && (<div className="source">{this.state.currentSourceText}</div>)}
	<div className="expansion" dangerouslySetInnerHTML={{__html:this.expandMarkdown()}}></div>
	{this.state.debugging
	 && (<Vars vars={this.state.varsAfterCurrentExpansion} className="varsafter" />)}

	<p>
      {(this.state.editing
	? (<span>
	     Editing (<button onClick={()=>this.setState({editing:false})}>hide</button>
		      <span> / </span> <button onClick={()=>this.setState({debugging:!this.state.debugging})}>debug{this.state.debugging?' off':''}</button>
                      <span> / </span> <button onClick={()=>this.reload()}>reset</button>):</span>)
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

      <div>
      {this.state.editing
       && (<MapView
	   ref={(mv) => { this.mapView = mv; }}
	   setText={this.mapChanged.bind(this)}
           openSymPage={this.openSymPage.bind(this)}
           name={this.state.name}
           text={this.state.evalText}
           rhs={this.state.parsedEvalText}
           selected={this.state.mapSelection}
           />)}
      </div>
      
        <div>
	{this.state.editing
         && this.state.debugging
	 && (<div className="sourcepanel">

	     <div className="revision">Revision: {this.state.revision}
	     <span>{this.state.revision > 1
		    && (<span> (<a href={this.viewURL(this.state.name,{edit:'true',rev:this.state.revision-1})}>{this.state.revision-1}</a>)</span>)}</span>
             </div>

	     <div className="eval-container">
	     <textarea className="eval" value={this.state.evalText} onChange={(event)=>this.evalChanged(event)}></textarea>
	     </div>

	     <br/>
             </div>)}
      </div>
        
        <div>
	{this.state.editing
	 && (<div>
	     <p>
	     <span>{this.viewURL() + this.state.saveAsUser + '/'}</span>
	     <input type="text" className="name" name="name" size="20" value={this.state.saveAsSymbol} onChange={(event)=>this.nameChanged(event)}></input>
	     {(!this.state.locked || (this.state.loggedIn && this.state.user === this.state.saveAsUser)) && <button onClick={()=>this.saveAs()}>Save</button>}
	     {this.state.loggedIn && this.state.user !== this.state.saveAsUser && (<span><span> </span><button onClick={()=>this.saveAs (this.state.user)}>Copy</button></span>)}
	     </p>
	     <div>
	     {this.state.loggedIn && this.state.user === this.state.saveAsUser
	      && (<div><div>
 		  <label>
	   	  <input type="checkbox" name="lock" checked={!this.state.hidden} onChange={(event)=>this.readPermissionChanged(event)}></input>
		  Anyone can view {this.state.hidden && (<span style={{fontStyle:'italic'}}>(Nope. This is private)</span>)}</label>
                  </div><div>
 		  <label className={this.state.hidden?'hidden':''}>
	   	  <input disabled={this.state.hidden} type="checkbox" name="lock" checked={!this.state.hidden && !this.state.locked} onChange={(event)=>this.editPermissionChanged(event)}></input>
		  Anyone can edit {this.state.locked && !this.state.hidden && (<span style={{fontStyle:'italic'}}>(Nope. Read-only)</span>)}</label>
		  </div></div>)}
	     </div>
	     <div className="error">{this.state.warning}</div>
	     </div>)}
      </div>

	<div className="bots">
	<hr/>
	{(Object.keys(this.state.bots).length
          ? (<div>
	     <span>Current auto-tweets </span>
             (<button onClick={()=>this.revokeAll()}>revoke all</button>)
	     <ul>{Object.keys (this.state.bots).map ((botName, j) => {
	       return (<li key={'bots'+j}>As <span> @<a href={'https://twitter.com/' + botName}>{botName}</a></span>
		       <ul>{this.state.bots[botName].map ((sym, k) => {
		         return (<li key={'bots'+j+'_'+k}><span>~<a href={this.viewURL(sym)}>{sym}</a> </span>
			         (<button onClick={()=>this.revoke(sym)}>revoke</button>)
	                         </li>);
		       })}</ul>
                       </li>);})}</ul>
	     </div>)
	  : '')}
      </div>
        
	<div className="auto" style="display:none;">
	<button onClick={()=>this.autotweet()}>Add this page</button>
	<span> to auto-tweets</span>
	</div>
	<hr/>
	{false && (<Refs className="recent" prefix="Recently updated" view={this.viewURL()} refSets={[{ symbols: this.state.recent }]} />)}
      </div>
        
    );
  }
}

class Vars extends Component {
  render() {
    const vars = this.props.vars, className = this.props.className;
    return (<div className={this.props.className}>{
      Object.keys(vars).sort().map ((name, k) => {
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
