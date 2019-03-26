import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
    
var props = (window && window.braceryProps) || {"APP_JAVASCRIPT_FILE":"https://bracery.org/api/v1/asset/app.js","APP_STYLE_FILE":"https://bracery.org/api/v1/asset/app.css","BASE_URL":"https://bracery.org","STORE_PATH_PREFIX":"/api/v1/store/","VIEW_PATH_PREFIX":"/","BOOKMARK_PATH_PREFIX":"/api/v1/bookmark/","EXPAND_PATH_PREFIX":"/api/v1/expand/","LOGIN_PATH_PREFIX":"/api/v1/login/","TWITTER_PATH_PREFIX":"/api/v1/twitter/","SOURCE_CONTROLS_STYLE":"style=\"display:none;\"","SOURCE_REVEAL_STYLE":"","SYMBOL_NAME":"test4","SYMBOL_DEFINITION":"test number &add{four}{$x} &inc$x &link{test}{Indeed, this is ~test4} &reveal{or is it?}{yes, it is.}","REVISION":1,"REFERRING_SYMBOLS":["test4"],"LOCKED_BY_USER":"","INIT_TEXT":false,"RECENT_SYMBOLS":["eco_war","brexit_facts","test4","welcome","any_chars"],"BOTS":{"factual_brexit":["brexit_facts"],"EC0d3z":["eco_war"]},"INIT_VARS":{"y":"3"},"USER":"i**@g**.com","EXPANSION":{"text":"test number four @@LINK_TYPE@@link@@LINK_DEST@@SW5kZWVkLCB0aGlzIGlzIH50ZXN0NA==@@LINK_TEXT@@test@@LINK_END@@ @@LINK_TYPE@@reveal@@LINK_DEST@@eWVzLCBpdCBpcy4=@@LINK_TEXT@@or is it?@@LINK_END@@","vars":{"x":"1"}},"EXPANSION_HTML":"<p>test number four <a href=\"#\" onclick=\"handleBraceryLink(atob('SW5kZWVkLCB0aGlzIGlzIH50ZXN0NA=='),'link')\">test</a> <a href=\"#\" onclick=\"handleBraceryLink(atob('eWVzLCBpdCBpcy4='),'reveal')\">or is it?</a></p>\n","INITIAL_WARNING":""};
ReactDOM.render (React.createElement (App, props), document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
