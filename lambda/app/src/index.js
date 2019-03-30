import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

var testProps = {"APP_JAVASCRIPT_FILE":"https://bracery.org/api/v1/asset/app.js","APP_STYLE_FILE":"https://bracery.org/api/v1/asset/app.css","BASE_URL":"https://bracery.org","STORE_PATH_PREFIX":"/api/v1/store/","VIEW_PATH_PREFIX":"/","BOOKMARK_PATH_PREFIX":"/api/v1/bookmark/","EXPAND_PATH_PREFIX":"/api/v1/expand/","LOGIN_PATH_PREFIX":"/api/v1/login/","TWITTER_PATH_PREFIX":"/api/v1/twitter/","SOURCE_CONTROLS_STYLE":"style=\"display:none;\"","SOURCE_REVEAL_STYLE":"","SYMBOL_NAME":"test4","SYMBOL_DEFINITION":"[test_5=>the illusion of choice leads back to [[Test 4]]]\n[test_4=>Test number &add{four}{$x} &inc$x &link@300,300{test}{Indeed, this is #test_4#} &reveal{or is it?}{yes, it is.} [[test 5]]]\n#test_4# [[new scene]] ~external_scene","REVISION":2,"REFERRING_SYMBOLS":["test_4"],"LOCKED_BY_USER":"","INIT_TEXT":false,"RECENT_SYMBOLS":["eco_war","brexit_facts","test4","welcome","any_chars"],"BOTS":{"factual_brexit":["brexit_facts"],"EC0d3z":["eco_war"]},"INIT_VARS":{"y":"3"},"USER":"i**@g**.com","INITIAL_WARNING":""};
var props = (window && window.braceryProps) || testProps;

ReactDOM.render (React.createElement (App, props), document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
