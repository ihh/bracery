#!/usr/bin/env node
// emacs mode -*-JavaScript-*-

const fs = require('fs'),
    getopt = require('node-getopt'),
    readline = require('readline'),
    https = require('https')

const bracery = require('../..'),
    extend = bracery.ParseTree.extend

const hostname = 'bracery.org',
    storePrefix = '/api/v1/store',
    defaultUser = 'guest'

// parse command-line options
const opt = getopt.create([
  ['n' , 'name=NAME'        , 'symbol name e.g. "welcome" or "guest/welcome"'],
  ['d' , 'def=TEXT'         , 'specify bracery definition from the command line'],
  ['b' , 'bracery=FILE'     , 'specify bracery definitions file'],
  ['j' , 'json=FILE'        , 'specify JSON definitions file, with names [{name:...,rules:[["def1"],["def2"]...]}]'],
  ['h' , 'help'             , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

const name = opt.options.name;
const braceryDef = opt.options.def;
const braceryFile = opt.options.bracery;
const jsonFile = opt.options.json;

if (!braceryDef && !braceryFile && !jsonFile)
  throw new Error ('please specify a Bracery file or JSON definitions file')

run();

async function run() {
  if (!jsonFile && !name)
    throw new Error ('please specify a symbol name')

  if (braceryFile) {
    const bracery = fs.readFileSync(braceryFile).toString()
    await postBracery (name, bracery)
  } else if (braceryDef)
    await postBracery (name, braceryDef)

  if (jsonFile) {
    const json = JSON.parse (fs.readFileSync(jsonFile).toString())
    asyncForEach (json, async (page) => {
      const bracery = '[' + page.rules.map ((array) => array[0]).join('|') + ']'
      await postBracery (page.name, bracery)
    })
  }
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}
function postBracery (sym, def) {
  if (sym.indexOf('/') < 0)
    sym = defaultUser + '/' + sym
  
  return new Promise ((resolve, reject) => {

    const putData = JSON.stringify ({ bracery: def });

    const options = {
      hostname: hostname,
      port: 443,
      path: storePrefix + '/' + sym,
      method: 'PUT',
      headers: {'content-type': 'application/json',
                'content-length': Buffer.byteLength(putData)}
    };
    
    const req = https.request(options, (res) => {
      console.log(`[${sym}] statusCode:`, res.statusCode);
      console.log(`[${sym}] headers:`, res.headers);

      res.on('data', (chunk) => {
        console.log(`[${sym}] BODY: ${chunk}`);
      });
      res.on('end', () => {
        console.log(`[${sym}] No more data in response.`);
        resolve();
      });
    });

    req.write(putData);
    req.end();
  })
}
