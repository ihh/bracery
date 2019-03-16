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
  ['D' ,  'delete'          , 'DELETE instead of PUT'],
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

      const reqOpts = {
        hostname: 'bracery.org',
        port: 443,
        path: '/store/' + def.name,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8'
        },
      };
      let content = '';
      if (opt.options['delete']) {
        reqOpts.method = 'DELETE'
      } else {
        reqOpts.method = 'PUT'
        if (opt.options.cookie)
          reqOpts.headers['Cookie'] = config.cookieName + '=' + opt.options.cookie;
        const body = { bracery: '[' + def.rules.join('|') + ']' };
        if (opt.options.lock)
          body.locked = true;
        content = JSON.stringify (body);
      }
      console.warn (reqOpts.method + ' ' + reqOpts.path + ' (' + def.rules.length + ')');
      let [res, data] = await util.httpsRequest (reqOpts, content);
      if (res.statusCode != 200)
        console.warn ('Error ' + res.statusCode + ' (' + def.name + ') ' + (data || ''));
    }, Promise.resolve());
  }, Promise.resolve());
} catch (e) {
  console.error (e);
}
