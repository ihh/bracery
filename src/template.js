var ParseTree = require('./parsetree')
var extend = ParseTree.extend

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
    var newTemplateDefReg = /^(\d*)(@.*|)(>+)\s*(.*?)\s*(#\s*(.*?)\s*(#\s*(.*?)\s*|)|)$/;
    var replyChain = [], currentTemplate, newTemplateDefMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        if (currentTemplate)
          currentTemplate.content = currentTemplate.content.concat (ParseTree.parseRhs (line + '\n'))
        else if (newTemplateDefMatch = newTemplateDefReg.exec (line)) {
          var weight = newTemplateDefMatch[1],
              author = newTemplateDefMatch[2],
              depth = newTemplateDefMatch[3].length - 1,
	      title = newTemplateDefMatch[4],
	      prevTags = makeTagString (newTemplateDefMatch[6]),
	      tags = makeTagString (newTemplateDefMatch[8])
          var isRoot = !prevTags.match(/\S/) || (prevTags.search(' root ') >= 0)
          author = author ? author.substr(1) : null
          currentTemplate = { title: title,
                              author: author,
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
        }
      } else {
        // line is empty
        currentTemplate = undefined
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
      return match || (prevTags.indexOf (' ' + tag + ' ') >= 0)
    }, false)
  }))
}

function randomChain (config) {
  var bracery = config.bracery, templates = config.templates
  var maxReplies = config.maxReplies
  var chain = [], vars = {}
  var template = randomRootTemplate (templates)
  while (template && !(chain.length > maxReplies)) {
    var message = { template: template,
                    vars: extend ({}, vars),
                    expansion: bracery._expandRhs (extend ({},
                                                           config,
                                                           { rhs: template.content,
                                                             vars: vars })) }
    message.title = vars.title || template.title
    message.tags = vars.prevtags = vars.tags || template.tags
    delete vars.tags
    chain.push (message)
    template = randomReplyTemplate (templates, message.tags, template)
  }
  return chain
}

module.exports = { parseTemplateDefs: parseTemplateDefs,
                   sampleTemplate: sampleTemplate,
                   randomRootTemplate: randomRootTemplate,
                   randomReplyTemplate: randomReplyTemplate,
                   randomChain: randomChain,
                   makeTagArray: makeTagArray,
                   makeTagString: makeTagString }
