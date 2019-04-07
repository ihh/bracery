import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

//var longStringLength = 1000, longString = new Array(longStringLength).fill('x').join('');
//var longString = 'blah'
//var bigCyclicTestSize = 100, bigCyclicTest = new Array(bigCyclicTestSize).fill(0).map ((_,n) => "[scene" + (n+1) + "@" + (200+10*(n % Math.floor(Math.sqrt(bigCyclicTestSize)))) + "," + 10*Math.floor(n / Math.floor(Math.sqrt(bigCyclicTestSize))) + "=>" + [1,2,3].map ((d) => "[test" + n + "/" + d + " " + longString + "]{#scene" + (((n + d) % bigCyclicTestSize) + 1) + "#}").join(" | ") + "]\n").join("") + "#scene1#\n";
//var testSymDef = bigCyclicTest;

var testSymDef = "[epsilon_5=>the illusion of choice leads back to [[Delta 4]]]\n[delta_4=>Test number &add{four}{$x} &inc$x &link@60,-360{beta}{Indeed, this is #delta_4# so sue me} &reveal{or is it?}{yes, it is.} [[epsilon 5]] #gamma#]\n#delta_4# [[new scene]] ~external_scene";
var testProps = {"APP_JAVASCRIPT_FILE":"https://bracery.org/api/v1/asset/app.js","APP_STYLE_FILE":"https://bracery.org/api/v1/asset/app.css","BASE_URL":"https://bracery.org","STORE_PATH_PREFIX":"/api/v1/store/","VIEW_PATH_PREFIX":"/","BOOKMARK_PATH_PREFIX":"/api/v1/bookmark/","EXPAND_PATH_PREFIX":"/api/v1/expand/","LOGIN_PATH_PREFIX":"/api/v1/login/","TWITTER_PATH_PREFIX":"/api/v1/twitter/","SOURCE_CONTROLS_STYLE":"style=\"display:none;\"","SOURCE_REVEAL_STYLE":"","SYMBOL_NAME":"alpha","SYMBOL_DEFINITION":testSymDef,"REVISION":2,"REFERRING_SYMBOLS":["delta_4"],"LOCKED_BY_USER":"","INIT_TEXT":false,"RECENT_SYMBOLS":["eco_war","brexit_facts","alpha","welcome","any_chars"],"BOTS":{"factual_brexit":["brexit_facts"],"EC0d3z":["eco_war"]},"INIT_VARS":{"y":"3"},"USER":"i**@g**.com","INITIAL_WARNING":""};
var props = (window && window.braceryProps) || testProps;

ReactDOM.render (React.createElement (App, props), document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
