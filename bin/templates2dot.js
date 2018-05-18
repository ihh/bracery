#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    getopt = require('node-getopt'),
    colors = require('colors'),
    extend = require('extend'),
    jsonschema = require('jsonschema'),
    Promise = require('bluebird'),
    templateParser = require('../src/template')

var defaultVerbosity = 3
var defaultMatchRegex = '\\.(json|txt)$'
var symChar = '$'

function defaultPath (subdir, opt) {
  var dataDir = (opt && opt.options.data) || defaultDataDir
  var pathVar = eval ('default' + subdir + 'Filename')
  pathVar = pathVar.replace('$DATA',dataDir)
  return pathVar
}

function schemaPath (schema) {
  return 'assets/schemas/' + schema + '.json'
}

var opt = getopt.create([
  ['T' , 'templates=PATH+'  , 'path to .js, .json or .txt template file(s) or directories'],
  ['v' , 'verbose=INT'      , 'verbosity level (default=' + defaultVerbosity + ')'],
  ['h' , 'help'             , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

var verbose = opt.options.verbose || defaultVerbosity
var logColor = ['green', 'yellow', 'magenta', 'cyan', 'red', 'blue']

function log (v, text) {
  if (typeof text === 'undefined') {
    text = v
    v = 0
  }
  if (verbose >= v) {
    var color = v <= 0 ? 'white' : (v > logColor.length ? logColor[logColor.length-1] : logColor[v-1])
    console.log (colors[color].call (colors, text))
  }
}

var nestedTemplates = (opt.options.templates || []).concat(opt.argv).reduce (function (templates, templateFilename) {
  return templates.concat (templateParser.parseTemplateDefs (fs.readFileSync(templateFilename).toString(), log))
}, [])

function flattenTemplates (templates, parent) {
  return templates.reduce (function (allTemplates, template) {
    template.parent = parent
    return allTemplates.concat (flattenTemplates (template.replies, template))
  }, templates)
}
var allTemplates = flattenTemplates (nestedTemplates)
var isTag = {}, nAuthor = {}, repliesForTag = {}
allTemplates.forEach (function (template, n) {
  template.id = n
  if (template.author && !nAuthor[template.author])
    nAuthor[template.author] = Object.keys(nAuthor).length + 1
  forTags (template.tags, function (tag) {
    isTag[tag] = true
  })
  if (template.isRoot && (!template.previousTags || (' ' + template.previousTags + ' ').indexOf(' root ') < 0))
    template.previousTags = (template.previousTags || '') + ' root '
  forTags (template.previousTags, function (tag) {
    isTag[tag] = true
    repliesForTag[tag] = repliesForTag[tag] || []
    repliesForTag[tag].push (template)
  })
})
var allTags = Object.keys(isTag).sort()
var allAuthors = Object.keys(nAuthor).sort()

console.log ('digraph G {')

var deadEndColor = '"#eeeeee"'
allTemplates.forEach (function (template) {
  var isDeadEnd = !(template.replies && template.replies.length) && (!template.tags || template.tags.split(/\s+/).filter (function (tag) { return repliesForTag[tag] }).length === 0)
  describeNode (templateNodeId (template), template.title.replace(/"/g,'\\"'), 'ellipse', (isDeadEnd ? 'color=black' : authorColorAttr(template.author)) + ';style=filled;' + authorColorAttr(template.author,'fillcolor',isDeadEnd?.4:.2,1))
})

allTags.forEach (function (tag) {
  var isDeadEnd = !(repliesForTag[tag] && repliesForTag[tag].length)
  describeNode (tagNodeId (tag), '#' + tag, 'rect', isDeadEnd ? 'style=filled;fillcolor="#eeeeee"' : '')
})

allTemplates.forEach (function (template) {
  if (template.parent)
    describeEdge (templateNodeId (template.parent), templateNodeId (template), '', authorColorAttr(template.author))
  forTags (template.tags, function (tag) {
    describeEdge (templateNodeId (template), tagNodeId (tag), '', authorColorAttr(template.author))
  })
  forTags (template.previousTags, function (tag) {
    describeEdge (tagNodeId (tag), templateNodeId (template), '', authorColorAttr(template.author))
  })
})

console.log ('}')

function forTags (tags, callback) {
  if (tags)
    tags.split(/\s+/).forEach (function (tag) {
      if (tag.match (/\S/))
        callback (tag)
    })
}

function tagNodeId (tag) { return 'tag_' + tag }
function templateNodeId (template) { return 'template_' + template.id }
function colorAttr (hue, sat, val, attr) { return (attr || 'color') + '="' + (hue || 0) + ',' + (sat || 0) + ',' + (val || 1) + '"' }
function authorColorAttr (author, attr, sat, val) { return colorAttr(nAuthor[author] / allAuthors.length, sat || 1, val || 1, attr) }

function describeNode (id, label, shape, colorStr) {
  console.log (id + ' [shape=' + (shape || 'ellipse') + ';label="' + label + '";' + (colorStr || '') + '];')
}

function describeEdge (src, dest, tag, colorStr) {
  console.log (src + ' -> ' + dest + ' [label="' + (tag || '') + '";' + (colorStr || '') + '];')
}
