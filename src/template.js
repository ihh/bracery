function makeTagString (text) {
  return (text
          ? (' ' + text.replace (/^\s*(.*?)\s*$/, function (_m, g) { return g }).split(/\s+/).join(' ') + ' ')
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
          currentTemplate.content = currentTemplate.content.concat (parseRhs (line + '\n'))
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
    log(5,"Parsed text file and converted to the following JSON:\n" + JSON.stringify(templates,null,2))
  } catch(e) { console.log(e) }
  return templates
}

module.exports = { parseTemplateDefs: parseTemplateDefs,
                   makeTagString: makeTagString }
