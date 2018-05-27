#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    getopt = require('node-getopt'),
    colors = require('colors'),
    extend = require('extend'),
    Promise = require('bluebird'),
    tmp = require('tmp'),
    execSync = require('child_process').execSync,
    templateParser = require('../src/template')

function defaultPath (subdir, opt) {
  var dataDir = (opt && opt.options.data) || defaultDataDir
  var pathVar = eval ('default' + subdir + 'Filename')
  pathVar = pathVar.replace('$DATA',dataDir)
  return pathVar
}

function schemaPath (schema) {
  return 'assets/schemas/' + schema + '.json'
}

var dotCommand = 'dot -Tpdf', openCommand = 'open'

var opt = getopt.create([
  ['t' , 'templates=PATH+'  , 'path to .js, .json or .txt template file(s) or directories'],
  ['o' , 'open'             , 'make PDF using \'' + dotCommand + '\' then open using \'' + openCommand + '\''],
  ['h' , 'help'             , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

var nestedTemplates = (opt.options.templates || []).concat(opt.argv).reduce (function (templates, templateFilename) {
  return templates.concat (templateParser.parseTemplateDefs (fs.readFileSync(templateFilename).toString()))
}, [])

var allTemplates = templateParser.flattenTemplates (nestedTemplates)
var isTag = {}, tagWeight = {}, nAuthor = {}, repliesForTag = {}
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
    tagWeight[tag] = (tagWeight[tag] || 0) + (template.weight || 1)
  })
})
var allTags = Object.keys(isTag).sort()
var allAuthors = Object.keys(nAuthor).sort()

var output = []
output.push ('digraph G {')

var deadEndColor = '"#eeeeee"'
allTemplates.forEach (function (template) {
  var isDeadEnd = !(template.replies && template.replies.length) && (!template.tags || template.tags.split(/\s+/).filter (function (tag) { return repliesForTag[tag] }).length === 0)
  describeNode (templateNodeId (template),
                template.title.replace(/"/g,'\\"'),
                'ellipse',
                (isDeadEnd ? 'color=black' : authorColorAttr(template.author)) + ';style=filled;' + authorColorAttr(template.author,'fillcolor',isDeadEnd?.4:.2,1))
})

allTags.forEach (function (tag) {
  var isDeadEnd = !(repliesForTag[tag] && repliesForTag[tag].length)
  describeNode (tagNodeId (tag), tagNodeLabel (tag), 'rect', isDeadEnd ? 'style=filled;fillcolor="#eeeeee"' : '')
})

allTemplates.forEach (function (template) {
  if (template.parent)
    describeEdge (templateNodeId (template.parent), templateNodeId (template), '', authorColorAttr(template.author))
  forTags (template.tags, function (tag, nTags) {
    describeEdge (templateNodeId (template),
                  tagNodeId (tag),
                  nTags > 1 ? (tagWeight[tag] || 0) : '',
                  authorColorAttr(template.author))
  })
  forTags (template.previousTags, function (tag, nTags) {
    describeEdge (tagNodeId (tag),
                  templateNodeId (template),
                  (template.weight && template.weight !== 1) ? template.weight : '',
                  authorColorAttr(template.author) + ';' + authorColorAttr(template.author,'fontcolor'))
  })
})

output.push ('}')
var outputText = output.join('\n') + '\n'

if (opt.options.open) {
  var tmpDotFilename = tmp.tmpNameSync ({ postfix: '.dot' })
  var tmpPdfFilename = tmp.tmpNameSync ({ postfix: '.pdf' })
  fs.writeFileSync (tmpDotFilename, outputText)
  execSync (dotCommand + ' ' + tmpDotFilename + ' >' + tmpPdfFilename)
  execSync (openCommand + ' ' + tmpPdfFilename)
  fs.unlinkSync (tmpDotFilename)
} else
  console.log (outputText)

function forTags (tags, callback) {
  if (tags) {
    var tagArray = tags.split(/\s+/).filter (function (tag) { return tag.length })
    tagArray.forEach (function (tag) {
      if (tag.match (/\S/))
        callback (tag, tagArray.length)
    })
  }
}

function tagNodeId (tag) { return tag[0] === '!' ? ('not_tag_' + tag.substr(1)) : ('tag_' + tag) }
function tagNodeLabel (tag) { return tag[0] === '!' ? ('!#' + tag.substr(1)) : ('#' + tag) }
function templateNodeId (template) { return 'template_' + template.id }
function colorAttr (hue, sat, val, attr) { return (attr || 'color') + '="' + (hue || 0) + ',' + (sat || 0) + ',' + (val || 1) + '"' }
function authorColorAttr (author, attr, sat, val) { return colorAttr(nAuthor[author] / allAuthors.length, sat || 1, val || 1, attr) }

function describeNode (id, label, shape, colorStr) {
  output.push (id + ' [shape=' + (shape || 'ellipse') + ';label="' + label + '";' + (colorStr || '') + '];')
}

function describeEdge (src, dest, tag, colorStr) {
  output.push (src + ' -> ' + dest + ' [taillabel="' + (tag || '') + '";' + (colorStr || '') + '];')
}
