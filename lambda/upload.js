#!/usr/bin/env node
// emacs mode -*-JavaScript-*-

var fs = require('fs'),
    https = require('https'),
    getopt = require('node-getopt')

var util = require('./bracery-util')

// parse command-line options
var opt = getopt.create([
  ['d' , 'data=PATH+'       , 'upload data file(s) with format [{"name":"symbol1","rules":["option1","option2"...]},{"name":"symbol2","rules":[...]},...]'],
  ['s' , 'symbols=NAME+'    , 'include only named symbols'],
  ['b' , 'begin=NAME'       , 'begin at named symbol'],
  ['h' , 'help'             , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

try {
  const dataFiles = (opt.options.data || []).concat (opt.argv);
  if (!(dataFiles && dataFiles.length))
    throw new Error ('Please specify a data file');

  let symbolAllowed = null, firstSymbol = null, begun = false;
  if (opt.options.symbols) {
    symbolAllowed = {};
    opt.options.symbols.forEach ((sym) => (symbolAllowed[sym] = true));
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
        console.warn (def.name + ' not whitelisted');
        return;
      } if (firstSymbol) {
        if (def.name === firstSymbol)
          begun = true;
        if (!begun) {
          console.warn (def.name + ' skipped');
          return;
        }
      }
      const opts = {
        hostname: 'bracery.org',
        port: 443,
        path: '/store/' + def.name,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8'
        },
      };
      const body = { bracery: '[' + def.rules.join('|') + ']' };
      console.warn (opts.method + ' ' + opts.path + ' (' + def.rules.length + ')');
      let [res, data] = await util.httpsRequest (opts, JSON.stringify (body));
      if (res.statusCode != 200)
        console.warn ('Error ' + res.statusCode + ' (' + def.name + ')');
    }, Promise.resolve());
  }, Promise.resolve());
} catch (e) {
  console.error (e);
}
