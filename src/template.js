var ParseTree = require('./parsetree')
var extend = ParseTree.extend

var defaultMaxReplies = 100

function makeTagArray (text) {
  return text.replace (/^\s*(.*?)\s*$/, function (_m, g) { return g })
    .split(/\s+/)
    .map (function (tag) { return tag.toLowerCase() })
}

function makeTagString (text, prefix, suffix) {
  prefix = prefix || ''
  suffix = suffix || ''
  return (text
          ? (' ' + makeTagArray(text).map(function(tag){return prefix+tag+suffix}).join(' ') + ' ')
	  : '')
}

function parseTemplateDefs (text) {
  var templates = [], allTemplates = []
  var initCommandParam = { 'PREV': '',
			   'TAGS': '',
			   'TITLE': '',
			   'WEIGHT': '',
			   'AUTHOR': '',
                           'PREFIX': '',
                           'SUFFIX': '' },
      commandParam = extend ({}, initCommandParam)
  try {
    var newTemplateDefReg = /^([\d\.]*)(@.*?|)(>+)\s*(.*?)\s*(#\s*(.*?)\s*(#\s*(.*?)\s*|)|)$/;
    var commandReg = /^ *## +(\S+)\s?(.*?)\s*$/;
    var commentReg = /^ *#([^#]*|[^#]* .*)$/;
    var localSymbolReg = /~[~\*]([A-Za-z0-9_]+)/g;
    var localTagReg = /\*(\S+)/g;
    var localTagInBodyReg = /#[#\*](\S+)/g;
    function expandLocalTag (_m, tag) { return commandParam['PREFIX'] + tag + commandParam['SUFFIX'] }
    function expandLocalSymbol (_m, sym) {
      var newSym = commandParam['PREFIX'] + sym + commandParam['SUFFIX']
      if (sym.toUpperCase() === sym)
        newSym = newSym.toUpperCase()
      else if (sym[0].toUpperCase() === sym[0])
        newSym = newSym[0].toUpperCase() + newSym.substr(1).toLowerCase()
      else
        newSym = newSym.toLowerCase()
      return "~" + newSym
    }
    var replyChain = [], currentTemplates = [], newTemplateDefMatch, commandMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        line = line.replace (localSymbolReg, function (_m, sym) { return "~" + commandParam['PREFIX'] + sym + commandParam['SUFFIX'] })
        if (commandMatch = commandReg.exec (line)) {
	  var param = commandMatch[1], value = commandMatch[2]
	  if (param === 'RESET') {
	    if (value)  // RESET XXX resets the param setting for XXX
	      commandParam[value] = initCommandParam[value]
	    else  // RESET without an argument resets all params
	      commandParam = extend ({}, initCommandParam)
	  } else
	    commandParam[param] = value
        } else if (commentReg.exec (line)) {
          /* comment, do nothing */
        } else if (currentTemplates.length) {
          line = line.replace (localTagInBodyReg, expandLocalTag)
          var parsedLine = ParseTree.parseRhs (line)
          currentTemplates.forEach (function (currentTemplate) {
            currentTemplate.opts.push (parsedLine)
          })
        } else if (newTemplateDefMatch = newTemplateDefReg.exec (line)) {
          var weight = newTemplateDefMatch[1] || commandParam['WEIGHT'],
              author = newTemplateDefMatch[2] || commandParam['AUTHOR'],
              depth = newTemplateDefMatch[3].length - 1,
	      title = commandParam['TITLE'] + (newTemplateDefMatch[4] || ''),
	      prevTags = (makeTagString ((newTemplateDefMatch[6] || '') + ' ' + commandParam['PREV'])
                          .replace (localTagReg, expandLocalTag)),
	      tags = (makeTagString ((newTemplateDefMatch[8] || '') + ' ' + commandParam['TAGS'])
                      .replace (localTagReg, expandLocalTag))
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
        } else
          console.warn ("Can't parse template definition line: " + line)
      } else {
        // line is empty
        currentTemplates = []
      }
    })
  } catch(e) { console.log(e) }
  allTemplates.forEach (function (template) {
    template.content = ParseTree.addFooter (template.opts.length
			                    ? (template.opts.length > 1
			                       ? [ { type: 'alt', opts: template.opts } ]
			                       : template.opts[0])
			                    : [])
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
  //  console.warn ("Templates: " + templates.map((t)=>t.title).join(","))
  var totalWeight = templates.reduce (function (total, template) { return total + (template.weight || 1) }, 0)
  var w = totalWeight * rng()
  for (var i = 0; i < templates.length; ++i)
    if ((w -= (templates[i].weight || 1)) <= 0)
      return templates[i]
  return undefined
}

function randomRootTemplate (templates, rng) {
  return sampleTemplate (allRootTemplates (templates), rng)
}

function randomReplyTemplate (templates, tags, prevTemplate, rng) {
  return sampleTemplate (allReplyTemplates (templates, tags, prevTemplate), rng)
}

function allRootTemplates (templates) {
  return templates.filter (function (template) { return template.isRoot })
}

function allReplyTemplates (templates, tags, prevTemplate) {
  var tagArray = typeof(tags) === 'string' ? makeTagArray(tags) : tags
  return templates.filter (function (template) {
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
    }, (allowedTags.length === 0 ||
        allowedTags.reduce (function (match, tag) {
          return match || tagArray.indexOf(tag) >= 0
        }, false))))
  })
}

function promiseMessageList (config) {
  var bracery = config.bracery, templates = config.templates
  var maxReplies = typeof(config.maxReplies) === 'undefined' ? defaultMaxReplies : config.maxReplies
  var accept = config.accept || function (_expansion, _thread, callback) { callback(true) }
  var prevMessage = config.previousMessage
  var generateTemplate = (prevMessage
                          ? randomReplyTemplate.bind (null, templates, prevMessage.tags, prevMessage.template)
                          : randomRootTemplate.bind (null, templates))
  var allTemplates = (prevMessage
                      ? allReplyTemplates.bind (null, templates, prevMessage.tags, prevMessage.template)
                      : allRootTemplates.bind (null, templates))
  function generateMessage (template) {
    var message
    var template = template || generateTemplate (config.rng)
    if (template) {
      var initVars = extend ({},
                             config.vars || {},
                             { tags: template.tags || '',
                               accept: '',
                               reject: '' })
      var vars = extend ({}, initVars)
      message = { template: template,
                  vars: extend ({}, vars),
                  expansion: bracery._expandRhs (extend ({},
                                                         config,
                                                         { rhs: ParseTree.sampleParseTree (ParseTree.addFooter (template.content),
                                                                                           { rng: bracery.rng }),
                                                           vars: vars })) }
      message.title = vars.title || template.title
      message.vars = extend ({}, initVars)
      message.nextVars = extend ({}, vars)
      message.tags = message.nextVars.tags   // this will be overwritten by a future call to extractTags, but is useful for debugging to get a preview of the tags
    }
    return message
  }
  function extractTags (message) {
    message.tags = message.nextVars.prevtags = message.nextVars.tags
    delete message.nextVars.tags
    delete message.nextVars.accept
    delete message.nextVars.reject
    return message
  }
  
  function hasReject (message) {
    return message && message.nextVars && message.nextVars.reject
  }

  function isChoice (message) {
    return message && message.nextVars && (message.nextVars.accept || message.nextVars.reject)
  }
  
  function appendChoiceFooter (message, choice) {
    if (message) {
      var footer = ParseTree.makeFooter (choice)
      if (!message.footerVars) {
        message.footerVars = extend ({}, message.nextVars)
        delete message.nextVars
      }
      var vars = extend ({}, message.footerVars)
      var footerExpansion = bracery._expandRhs (extend ({},
                                                        config,
                                                        { rhs: ParseTree.sampleParseTree (footer,
                                                                                          { rng: bracery.rng }),
                                                          vars: vars }))
      message.expansion.text = message.expansion.text + footerExpansion.text
      message.expansion.tree.push (footerExpansion.tree)
      message.nextVars = extend ({}, vars)
    }
    return extractTags (message)
  }

  function promiseMessage (template) {
    var proposedMessage = generateMessage (template)
    return new Promise (function (resolve, reject) {
      if (!proposedMessage)
        resolve (true)
      else
        accept (proposedMessage, config.thread, resolve, allTemplates)
    }).then (function (accepted) {
      var result = (typeof(accepted) === 'object'
                    ? promiseMessage (extractTags (accepted))
                    : (accepted
                       ? (isChoice(proposedMessage) ? appendChoiceFooter(proposedMessage,'accept') : proposedMessage)
                       : (hasReject(proposedMessage) ? appendChoiceFooter(proposedMessage,'reject') : promiseMessage())))
      return result
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
                   allRootTemplates: allRootTemplates,
                   allReplyTemplates: allReplyTemplates,
                   randomRootTemplate: randomRootTemplate,
                   randomReplyTemplate: randomReplyTemplate,
                   promiseMessageList: promiseMessageList,
                   makeTagArray: makeTagArray,
                   makeTagString: makeTagString }
