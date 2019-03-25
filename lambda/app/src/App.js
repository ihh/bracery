import React, { Component } from 'react';
import { Bracery, ParseTree } from 'bracery';
import braceryWeb, { extend } from './bracery-web';
import RiTa from 'rita';
import marked from 'marked';
import DebouncePromise from 'awesome-debounce-promise';
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
      revision: props.REVISION,
      locked: props.LOCKED_BY_USER,

      initText: props.INIT_TEXT || props.SYMBOL_DEFINITION,  // value to reset text to
      initVars: props.INIT_VARS || {},  // value to reset vars to

      varsBeforeCurrentExpansion: props.INIT_VARS,
      currentSourceText: props.INIT_TEXT || props.SYMBOL_DEFINITION,

      currentExpansionText: (props.EXPANSION && props.EXPANSION.text) || '',
      varsAfterCurrentExpansion: (props.EXPANSION && props.EXPANSION.vars) || {},

      linkRevealed: {},

      warning: props.INITIAL_WARNING,
      
      loggedIn: !!props.USER,
      editing: !!props.EDITING,
      debugging: !!props.DEBUGGING,
      suggestions: props.SUGGESTIONS,
      rerollMeansRestart: false,

      referring: props.REFERRING_SYMBOLS,
      recent: props.RECENT_SYMBOLS,

      base: props.BASE_URL,
      store: props.STORE_PATH_PREFIX,
      view: props.VIEW_PATH_PREFIX,
      expand: props.EXPAND_PATH_PREFIX,
      login: props.LOGIN_PATH_PREFIX,
      twitter: props.TWITTER_PATH_PREFIX,
      bookmark: props.BOOKMARK_PATH_PREFIX,

    };

    this.bracery = new Bracery (null, { rita: RiTa });
    this.braceryCache = {};

    let evalChangedUpdateDelay = 400
    this.debounceEvalChangedUpdate = DebouncePromise (this.getNewExpansion.bind(this), evalChangedUpdateDelay)
    
    window[braceryWeb.clickHandlerName] = this.handleBraceryLink.bind (this)
  }

  handleBraceryLink (newEvalText, linkType, linkName) {
    var app = this
    window.event.preventDefault()
    if (linkType === 'reveal') {
      let newLinkRevealed = extend ({}, this.state.linkRevealed);
      newLinkRevealed[linkName] = true;
      this.setState ({ linkRevealed: newLinkRevealed });
    } else {
      // linkType === 'link'
      this.getNewExpansion (newEvalText, this.state.varsAfterCurrentExpansion, { rerollMeansRestart: true })
	.then (function() { app.saveAppStateToServer(false); })
    }
  }

  saveAppStateToServer (createBookmark) {
    // WRITE ME
  }
  
  reroll() {
    this.getNewExpansion (this.state.initText, this.state.initVars, { rerollMeansRestart: false })
  }

  erase() {
    this.setState ({ initText: '',
		     initVars: {},
		     evalText: '',
		     currentSourceText: '',
		     evalTextEdited: true,
		     warning: this.unsavedWarning
		   })
    this.getNewExpansion()
  }

  reload() {
    this.getBracery (this.state.name)
      .then ((text) => {
	this.setState ({ initText: text,
			 initVars: {},
			 evalText: text,
			 currentSourceText: text,
			 evalTextEdited: false,
			 warning: '' })
	return this.getNewExpansion()
      })
  }

  evalChanged (event) {
    let text = event.target.value
    this.setState ({ initText: text,
		     evalText: text,
		     currentSourceText: text,
		     evalTextEdited: true,
		     warning: this.unsavedWarning
		   })
    return this.debounceEvalChangedUpdate()
  }

  get unsavedWarning() { return 'Changes will not be final until saved.' }
  
  makeVarHtml (vars) {
    return Object.keys(vars).sort().map (function (name) {
      return '<span class="var">$' + name + '</span>=<span class="val">' + vars[name] + '</span>'
    }).join(', ')
  }

  getBracery (symbolName) {
    var app = this
    if (this.braceryCache[symbolName])
      return Promise.resolve (this.braceryCache[symbolName])
    else
      return fetch (this.state.base + this.state.store + symbolName)
      .then ((response) => response.json())
      .then ((body) => {
        let result = body.bracery;
        app.braceryCache[symbolName] = result;
	return result;
      })
  }

  getSymbol (config) {
    return this.getBracery (config.symbolName || config.node.name)
      .then ((bracery) => [bracery])
  }
  setSymbol() { return [] }
  get braceryExpandCallbacks() {
    return { expand: null,  // signals to Bracery that we want it to fetch the symbol definition & then expand it locally
	     callback: true,  // signals to Bracery that we want a Promise
	     makeLink: braceryWeb.makeInternalLink.bind (null, btoa),
	     get: this.getSymbol.bind (this),
	     set: this.setSymbol.bind (this) }
  }

  getNewExpansion (text, vars, newState) {
    const app = this;
    text = typeof(text) !== 'undefined' ? text : app.state.currentSourceText;
    vars = extend ({}, typeof(vars) !== 'undefined' ? vars : app.state.varsBeforeCurrentExpansion);
    const varsBefore = extend ({}, vars);
    return new Promise (function (resolve, reject) {
      try {
	app.bracery.expand (text, extend ({ vars: vars }, app.braceryExpandCallbacks))
	  .then (resolve)
      } catch (e) {
	console.error(e)
	reject (e)
      }
    }).then (function (expansion) {
      app.setState (extend ({ currentSourceText: text,
			      varsBeforeCurrentExpansion: varsBefore,
			      currentExpansionText: expansion.text,
			      varsAfterCurrentExpansion: expansion.vars,
			      linkRevealed: {} },
			    newState || {}))
      return expansion
    })
  }
  
  render() {
    return (
    <div className="main">
      <div className="banner">
	<span>
	  <a href={this.state.view}>bracery</a> <span> / </span>
	  <span>{this.state.name}</span>
	</span>
	<span>{(this.state.rerollMeansRestart
		? <button onClick={()=>(window.confirm('Really restart? You will lose your progress.') && this.reroll())}>Restart</button>
		: <button onClick={()=>this.reroll()}>Re-roll</button>)}</span>
	<span><button>Tweet</button></span>
	<span className="loginout">
	{this.state.loggedIn
	 ? (<span>{this.state.user} / <button>Logout</button></span>)
	 : (<span><button>Login / Signup</button></span>)
	}
      </span>
	</div>
	{this.state.debugging
	 ? (<div className="varsbefore" dangerouslySetInnerHTML={{__html:this.makeVarHtml(this.state.varsBeforeCurrentExpansion)}}></div>)
	 : ''}
      {this.state.debugging
       ? (<div className="source">{this.state.currentSourceText}</div>)
       : ''}
	<div className="expansion" dangerouslySetInnerHTML={{__html:braceryWeb.expandMarkdown(this.state.currentExpansionText || '',marked,this.state.linkRevealed)}}></div>
	{this.state.debugging
	 ? (<div className="varsafter" dangerouslySetInnerHTML={{__html:this.makeVarHtml(this.state.varsAfterCurrentExpansion)}}></div>)
	 : ''}
	<p>
	{(this.state.editing
	  ? (<span>
	     Editing template text (<button onClick={()=>this.setState({editing:false})}>hide</button>
				    <span> / </span> <button onClick={()=>this.erase()}>erase</button>
				    <span> / </span> <button onClick={()=>this.reload()}>reload</button>
				    <span> / </span> <button onClick={()=>this.setState({debugging:!this.state.debugging})}>debug{this.state.debugging?' off':''}</button>
				    <span> / </span> <button>suggest</button>
				    <span> / </span> <a href="https://github.com/ihh/bracery#Bracery">docs</a>):</span>)
	  
	  : (<span><button onClick={()=>this.setState({editing:true})}>Edit</button></span>))}
      </p>
	{this.state.suggestions
	 ? (<div>
	    <div></div>
	    <button>Clear suggestions</button>
	    </div>)
	 : ''}
	<div className="sourcepanel">
	  <div className="revision"></div>
	<div className="evalcontainer">
	<textarea className="eval" value={this.state.evalText} onChange={(event)=>this.evalChanged(event)}></textarea>
	  </div>
	  <div className="refs"></div>
	  <div className="referring"></div>
	  <br/>
	  <p>
	<span dangerouslySetInnerHTML={{__html:this.state.base + this.state.view}}></span>
	    <input type="text" className="name" name="name" size="20" defaultValue={this.state.name}></input>
	    <button type="button">Publish</button>
	</p>
	{(this.state.loggedIn
	  ? (<div>
	     <input type="checkbox" name="lock" checked={this.state.locked}></input>
	     <label for="lock">Prevent other users from editing</label>
	     </div>)
	  : '')}
      </div>
	<div className="error">{this.state.warning}</div>
	<div className="bots"></div>
	<div className="auto"></div>
	<hr/>
	<div className="recent"></div>
    </div>
    );
  }
}

export default App;
