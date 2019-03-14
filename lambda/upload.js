#!/usr/bin/env node
// emacs mode -*-JavaScript-*-

var fs = require('fs'),
    https = require('https'),
    getopt = require('node-getopt')

var util = require('./bracery-util')
var config = require('./bracery-config')

// parse command-line options
var opt = getopt.create([
  ['d' , 'data=PATH+'       , 'upload data file(s) with format [{"name":"symbol1","rules":["option1","option2"...]},{"name":"symbol2","rules":[...]},...]'],
  ['n' , 'name=NAME+'       , 'include only named symbols'],
  ['b' , 'begin=NAME'       , 'begin at named symbol'],
  ['c' , 'cookie=COOKIE'    , 'use session cookie'],
  ['l' , 'lock'             , 'set lock flag (requires session cookie to establish identity)'],
  ['s' , 'summary'          , 'don\'t upload anything; instead, just output a summary in Markdown'],
  ['v' , 'verbose'          , 'make lots of noise'],
  ['h' , 'help'             , 'display this help message'],
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

try {
  const dataFiles = (opt.options.data || []).concat (opt.argv);
  if (!(dataFiles && dataFiles.length)) {
    console.error ('Please specify a data file');
    process.exit();
  }

  let symbolAllowed = null, firstSymbol = null, begun = false;
  if (opt.options.name) {
    symbolAllowed = {};
    opt.options.name.forEach ((sym) => (symbolAllowed[sym] = true));
  }
  if (opt.options.begin)
    firstSymbol = opt.options.begin;
  
  dataFiles.reduce (async (previousFiles, filename) => {

    await previousFiles;
    
    const file = fs.readFileSync(filename).toString();
    const defs = JSON.parse (file);

    await defs.reduce (async (previousDefs, def) => {
      await previousDefs;
      if (symbolAllowed && !symbolAllowed[def.name]) {
        if (opt.options.verbose)
          console.warn (def.name + ' not whitelisted');
        return;
      } if (firstSymbol) {
        if (def.name === firstSymbol)
          begun = true;
        if (!begun) {
          if (opt.options.verbose)
            console.warn (def.name + ' skipped');
          return;
        }
      }

      if (opt.options.summary) {
        console.log ("- ~[" + def.name + "](/" + def.name + ") " + def.summary);
        return;
      }

      const putOpts = {
        hostname: 'bracery.org',
        port: 443,
        path: '/store/' + def.name,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8'
        },
      };
      if (opt.options.cookie)
        putOpts.headers['Cookie'] = config.cookieName + '=' + opt.options.cookie;
      const body = { bracery: '[' + def.rules.join('|') + ']' };
      if (opt.options.lock)
        body.locked = true;
      console.warn (putOpts.method + ' ' + putOpts.path + ' (' + def.rules.length + ')');
      let [res, data] = await util.httpsRequest (putOpts, JSON.stringify (body));
      if (res.statusCode != 200)
        console.warn ('Error ' + res.statusCode + ' (' + def.name + ') ' + (data || ''));
    }, Promise.resolve());
  }, Promise.resolve());
} catch (e) {
  console.error (e);
}
