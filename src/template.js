var ParseTree = require('./parsetree')
var extend = ParseTree.extend

var defaultMaxReplies = 100

var standardFooter = { type: 'assign',
                       varname: 'tags',
                       value: [{ type: 'func',
                                 funcname: 'eval',
                                 args: [{ type: 'lookup',
                                          varname: 'tags' }] }] }

function makeTagArray (text) {
  return text.replace (/^\s*(.*?)\s*$/, function (_m, g) { return g })
    .split(/\s+/)
    .map (function (tag) { return tag.toLowerCase() })
}

function makeTagString (text) {
  return (text
          ? (' ' + makeTagArray(text).join(' ') + ' ')
	  : '')
}

function parseTemplateDefs (text) {
  var templates = [], allTemplates = []
  try {
    var newTemplateDefReg = /^(\d*)(@.*?|)(>+)\s*(.*?)\s*(#\s*(.*?)\s*(#\s*(.*?)\s*|)|)$/;
    var commentReg = /^ *#.*$/;
    var replyChain = [], currentTemplates = [], newTemplateDefMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        if (currentTemplates.length) {
          var parsedLine = ParseTree.parseRhs (line)
          currentTemplates.forEach (function (currentTemplate) {
            currentTemplate.opts.push (parsedLine)
          })
        } else if (newTemplateDefMatch = newTemplateDefReg.exec (line)) {
          var weight = newTemplateDefMatch[1],
              author = newTemplateDefMatch[2],
              depth = newTemplateDefMatch[3].length - 1,
	      title = newTemplateDefMatch[4],
	      prevTags = makeTagString (newTemplateDefMatch[6]),
	      tags = makeTagString (newTemplateDefMatch[8])
          var isRoot = depth === 0 && (!prevTags.match(/\S/) || (prevTags.search(' root ') >= 0))
          var authorNames = author ? author.substr(1).split(',') : [null]
          currentTemplates = authorNames.map (function (authorName) {
            var currentTemplate = { title: title,
                                    author: authorName,
			            previousTags: prevTags,
			            tags: tags,
                                    isRoot: isRoot,
                                    weight: weight.length ? parseInt(weight) : undefined,
			            opts: [],
                                    replies: [] }
            if (depth > replyChain.length)
              throw new Error ("Missing replies in chain")
            replyChain = replyChain.slice (0, depth)
            if (depth > 0)
              replyChain[depth-1].replies.push (currentTemplate)
            else
              templates.push (currentTemplate)
            replyChain.push (currentTemplate)
            allTemplates.push (currentTemplate)
            return currentTemplate
          })
        } else if (commentReg.exec (line)) {
          /* comment, do nothing */
        } else
          console.warn ("Can't parse template definition line: " + line)
      } else {
        // line is empty
        currentTemplates = []
      }
    })
  } catch(e) { console.log(e) }
  allTemplates.forEach (function (template) {
    template.content = (template.opts.length > 1
			? [ { type: 'alt', opts: template.opts } ]
			: template.opts[0])
      .concat ([standardFooter])
    
    delete template.opts
  })
  return templates
}

function flattenTemplates (templates, parent) {
  return templates.reduce (function (allTemplates, template) {
    template.parent = parent
    return allTemplates.concat (flattenTemplates (template.replies, template))
  }, templates)
}

function sampleTemplate (templates, rng) {
  rng = rng || Math.random
  var totalWeight = templates.reduce (function (total, template) { return total + (template.weight || 1) }, 0)
  var w = totalWeight * rng()
  for (var i = 0; i < templates.length; ++i)
    if ((w -= (templates[i].weight || 1)) <= 0)
      return templates[i]
  return undefined
}

function randomRootTemplate (templates, rng) {
  return sampleTemplate (templates.filter (function (template) { return template.isRoot }), rng)
}

function randomReplyTemplate (templates, tags, prevTemplate, rng) {
  var tagArray = typeof(tags) === 'string' ? makeTagArray(tags) : tags
  return sampleTemplate (templates.filter (function (template) {
    if (prevTemplate && prevTemplate.replies.indexOf (template) >= 0)
      return true
    var prevTags = makeTagArray (template.previousTags)
    var allowedTags = prevTags.filter (function (tag) { return tag[0] !== '!' && tag[0] !== '-' && tag[0] !== '+' })
    var excludedTags = prevTags.filter (function (tag) { return tag[0] === '!' || tag[0] === '-' }).map (function (xtag) { return xtag.substr(1) })
    var requiredTags = prevTags.filter (function (tag) { return tag[0] === '+' }).map (function (xtag) { return xtag.substr(1) })
    return requiredTags.reduce (function (match, xtag) {
      return match && tagArray.indexOf(xtag) >= 0
    }, excludedTags.reduce (function (match, xtag) {
      return match && tagArray.indexOf(xtag) < 0
    }, allowedTags.reduce (function (match, tag) {
      return match || tagArray.indexOf(tag) >= 0
    }, false)))
  }), rng)
}

function promiseMessageList (config) {
  var bracery = config.bracery, templates = config.templates
  var maxReplies = typeof(config.maxReplies) === 'undefined' ? defaultMaxReplies : config.maxReplies
  var accept = config.accept || function (_expansion, _thread, callback) { callback(true) }
  var prevMessage = config.previousMessage
  var generateTemplate = (prevMessage
                          ? randomReplyTemplate.bind (null, templates, prevMessage.tags, prevMessage.template)
                          : randomRootTemplate.bind (null, templates))
  function generateMessage() {
    var message
    var template = generateTemplate (config.rng)
    if (template) {
      var vars = extend ({}, config.vars || {}, { tags: template.tags || '' })
      message = { template: template,
                  vars: extend ({}, vars),
                  expansion: bracery._expandRhs (extend ({},
                                                         config,
                                                         { rhs: ParseTree.sampleParseTree (template.content, bracery.rng),
                                                           vars: vars })) }
      message.title = vars.title || template.title
      message.tags = vars.prevtags = vars.tags
      delete vars.tags
      message.nextVars = extend ({}, vars)
    }
    return message
  }
  function promiseMessage() {
    var proposedMessage = generateMessage()
    return new Promise (function (resolve, reject) {
      if (!proposedMessage)
        resolve (true)
      else
        accept (proposedMessage, config.thread, resolve)
    }).then (function (accepted) {
      return accepted ? proposedMessage : promiseMessage()
    })
  }
  return promiseMessage()
    .then (function (message) {
      return (message
              ? ((maxReplies > 0 || typeof(maxReplies) === 'undefined' || maxReplies === null)
                 ? (promiseMessageList (extend ({},
                                                config,
                                                { previousMessage: message,
                                                  vars: message.nextVars,
                                                  thread: (config.thread || []).concat (message),
                                                  maxReplies: (maxReplies ? maxReplies - 1 : maxReplies) }))
                    .then (function (replies) {
                      return [message].concat (replies)
                    }))
                 : [message])
              : [])
    })
}

module.exports = { parseTemplateDefs: parseTemplateDefs,
                   flattenTemplates: flattenTemplates,
                   sampleTemplate: sampleTemplate,
                   randomRootTemplate: randomRootTemplate,
                   randomReplyTemplate: randomReplyTemplate,
                   promiseMessageList: promiseMessageList,
                   makeTagArray: makeTagArray,
                   makeTagString: makeTagString }
