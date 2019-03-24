import React, { Component } from 'react';
import { Bracery, ParseTree } from 'bracery';
import RiTa from 'rita';
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

      initText: props.INIT_TEXT,  // value to reset text to
      initVars: props.INIT_VARS,       // value to reset vars to

      varsBeforeCurrentExpansion: props.INIT_VARS,
      currentSourceText: props.INIT_TEXT || props.SYMBOL_DEFINITION,

      exp: props.EXPANSION,
      currentExpansionText: props.EXPANSION_TEXT,
      currentExpansionHTML: props.EXPANSION_HTML,
      varsAfterCurrentExpansion: {},

      loggedIn: !!props.USER,
      editing: !!props.EDITING,
      debugging: !!props.DEBUGGING,
      suggestions: props.SUGGESTIONS,
      rerollMeansRestart: false,

      referring: props.REFERRING_SYMBOLS,
      recent: props.RECENT_SYMBOLS,
      
      store: props.STORE_PATH_PREFIX,
      view: props.VIEW_PATH_PREFIX,
      expand: props.EXPAND_PATH_PREFIX,
      login: props.LOGIN_PATH_PREFIX,
      twitter: props.TWITTER_PATH_PREFIX,
      bookmark: props.BOOKMARK_PATH_PREFIX,

    };

    this.bracery = new Bracery (null, { rita: RiTa });
  }


  
  render() {
    return (
    <div className="main">
      <div className="banner">
	<span className="path tab">
	  <a href={this.state.view} className="home">bracery</a> /
	  <span className="title">{this.state.name}</span>
	</span>
	<span className="tab"><button className="reroll">Re-roll</button></span>
	<span className="tab"><button className="tweet">Tweet</button></span>
	<span className="loginout">
	{this.state.loggedIn
	 ? (<span className="logout">{this.state.user} / <button className="logoutlink">Logout</button></span>)
	 : (<span className="login"><button className="loginlink">Login / Signup</button></span>)
	}
      </span>
	</div>
	{this.state.debugging ? (<div className="varsbefore"></div>) : ''}
        {this.state.debugging ? (<div className="init"></div>) : ''}
	<div className="expansion">{this.state.currentExpansionHTML}</div>
	{this.state.debugging ? (<div className="varsafter"></div>) : ''}
	<p>
	{(this.state.editing
	  ? (<span className="sourcecontrols">
	     Editing template text (<button onClick={()=>this.setState({editing:false})}>hide</button>
				    / <button className="erase">erase</button>
				    / <button className="reset">reload</button>
				    / <button onClick={()=>this.setState({debugging:!this.state.debugging})}>debug{this.state.debugging?' off':''}</button>
				    / <button className="suggest">suggest</button>
				    / <a href="https://github.com/ihh/bracery#Bracery" className="docs">docs</a>):</span>)
	  
	  : (<span><button onClick={()=>this.setState({editing:true})}>Edit</button></span>))}
      </p>
	{this.state.suggestions
	 ? (<div className="suggestpanel">
	    <div className="suggestions"></div>
	    <button className="dismiss">Clear suggestions</button>
	    </div>)
	 : ''}
	<div className="sourcepanel">
	  <div className="revision"></div>
	  <div>
	    <div contentEditable="true" className="eval">{this.state.evalText}</div>
	  </div>
	  <div className="refs"></div>
	  <div className="referring"></div>
	  <br/>
	  <p>
	    <span className="urlprefix">{this.state.BASE_URL}{this.state.VIEW_PATH_PREFIX}</span>
	    <input type="text" className="name" name="name" size="20" value={this.state.SYMBOL_NAME}></input>
	    <button className="save" type="button">Publish</button>
	</p>
	{(this.state.loggedIn
	  ? (<div className="lockpanel">
	     <input type="checkbox" className="lock" name="lock" checked={this.state.LOCKED_BY_USER}></input>
	     <label for="lock">Prevent other users from editing</label>
	     </div>)
	  : '')}
      </div>
	<div className="error">{this.state.INITIAL_WARNING}</div>
	<div className="bots"></div>
	<div className="auto"></div>
	<hr/>
	<div className="recent"></div>
    </div>
    );
  }
}

export default App;
