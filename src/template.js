var ParseTree = require('./parsetree')
var extend = ParseTree.extend

var defaultMaxReplies = 100

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
  var templates = []
  try {
    var newTemplateDefReg = /^(\d*)(@.*?|)(>+)\s*(.*?)\s*(#\s*(.*?)\s*(#\s*(.*?)\s*|)|)$/;
    var replyChain = [], currentTemplates = [], newTemplateDefMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        if (currentTemplates.length) {
          var parsedLine = ParseTree.parseRhs (line + '\n')
          currentTemplates.forEach (function (currentTemplate) {
            currentTemplate.content = currentTemplate.content.concat (parsedLine)
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
			            content: [],
                                    replies: [] }
            if (depth > replyChain.length)
              throw new Error ("Missing replies in chain")
            replyChain = replyChain.slice (0, depth)
            if (depth > 0)
              replyChain[depth-1].replies.push (currentTemplate)
            else
              templates.push (currentTemplate)
            replyChain.push (currentTemplate)
            return currentTemplate
          })
        }
      } else {
        // line is empty
        currentTemplates = []
      }
    })
  } catch(e) { console.log(e) }
  return templates
}

function sampleTemplate (templates) {
  var totalWeight = templates.reduce (function (total, template) { return total + (template.weight || 1) }, 0)
  var w = totalWeight * Math.random()
  for (var i = 0; i < templates.length; ++i)
    if ((w -= (templates[i].weight || 1)) <= 0)
      return templates[i]
  return undefined
}

function randomRootTemplate (templates) {
  return sampleTemplate (templates.filter (function (template) { return template.isRoot }))
}

function randomReplyTemplate (templates, tags, prevTemplate) {
  tags = typeof(tags) === 'string' ? makeTagArray(tags) : tags
  return sampleTemplate (templates.filter (function (template) {
    if (prevTemplate && prevTemplate.replies.indexOf (template) >= 0)
      return true
    var prevTags = template.previousTags.toLowerCase()
    return tags.reduce (function (match, tag) {
      return match || (prevTags.search (' ' + tag + ' ') >= 0)
    }, false)
  }))
}

function promiseMessageList (config) {
  var bracery = config.bracery, templates = config.templates
  var maxReplies = typeof(config.maxReplies) === 'undefined' ? defaultMaxReplies : config.maxReplies
  var accept = config.accept || function (expansion, thread) { return true }
  var prevMessage = config.previousMessage
  var generateTemplate = (prevMessage
                          ? randomReplyTemplate.bind (null, templates, prevMessage.tags, prevMessage.template)
                          : randomRootTemplate.bind (null, templates))
  function generateMessage() {
    var message
    var template = generateTemplate()
    if (template) {
      var vars = extend ({}, config.vars || {})
      message = { template: template,
                  vars: extend ({}, vars),
                  expansion: bracery._expandRhs (extend ({},
                                                         config,
                                                         { rhs: ParseTree.sampleParseTree (template.content, bracery.rng),
                                                           vars: vars })) }
      message.title = vars.title || template.title
      message.tags = vars.prevtags = vars.tags || template.tags
      delete vars.tags
      message.nextVars = extend ({}, vars)
    }
    return message
  }
  function promiseMessage() {
    var proposedMessage = generateMessage()
//    console.warn('proposedMessage',proposedMessage)
    return new Promise (function (resolve, reject) {
      if (!proposedMessage)
        resolve (true)
      else
        resolve (accept (proposedMessage, config.thread))
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
                   sampleTemplate: sampleTemplate,
                   randomRootTemplate: randomRootTemplate,
                   randomReplyTemplate: randomReplyTemplate,
                   promiseMessageList: promiseMessageList,
                   makeTagArray: makeTagArray,
                   makeTagString: makeTagString }
