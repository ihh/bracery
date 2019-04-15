function extend (dest) {
  dest = dest || {};
  Array.prototype.slice.call (arguments, 1).forEach (function (src) {
    if (src)
      Object.keys(src).forEach (function (key) { dest[key] = src[key]; })
  });
  return dest;
}

function escapeHTML (str) {
  if (typeof(str) !== 'string')
    return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function makeInternalLink (btoa, text, link, funcname) {
  var safeLink = btoa (link.text);
  return '@@LINK_TYPE@@' + funcname + '@@LINK_DEST@@' + safeLink + '@@LINK_TEXT@@' + text.text + '@@LINK_END@@';
}

var clickHandlerName = 'handleBraceryLink';
function expandInternalLinks (text, isRevealed) {
  var regex = /^([\s\S]*)@@LINK_TYPE@@(\S*)?@@LINK_DEST@@(\S*?)@@LINK_TEXT@@([\s\S]*?)@@LINK_END@@([\s\S]*)$/;
  var internalLinkCounter = 0;
  function replacer (_m, before, linkType, safeLink, text, after) {
    replaced = true;
    var linkName = 'link' + (++internalLinkCounter) + '_' + safeLink;
    return (before
	    + (isRevealed[linkName]
	       ? atob(safeLink)
	       : '<a href="#" onclick="' + clickHandlerName + '(atob(\'' + safeLink + '\'),\'' + linkType + '\',\'' + linkName + '\')">' + text + '</a>')
	    + after);
  }
  do {
    var replaced = false;
    text = text.replace (regex, replacer);
  } while (replaced);
  return text;
}

var bookmarkTag = '<bookmark>';
var bookmarkRegex = new RegExp (bookmarkTag, 'ig');
function expandMarkdown (text, marked, isRevealed) {
  // Prevent inclusion of <script> tags or arbitrary HTML
  var safeText = text.replace(bookmarkRegex,'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var html = marked (safeText);  // Markdown expansion
  return expandInternalLinks (html, isRevealed || {});
}

function digestText (text, maxDigestChars, link, alwaysIncludeLink) {
  var digested = text.replace(/^\s*/,'').replace(/\s*$/,'');
  var linkNeeded = ((typeof(link) === 'string' && link.match(/\S/))
		    || (digested.length > maxDigestChars)
		    || alwaysIncludeLink);
  return (linkNeeded
	  ? (typeof(link) === 'function'
	     ? link()
	     : Promise.resolve(link))
	  : Promise.resolve())
    .then (function (link) {
      var linkWithSpace = link ? (' ' + link) : '';
      var truncationIndicator = '...';
      var truncationNeeded = maxDigestChars && (digested.length > (maxDigestChars - linkWithSpace.length));
      var maxTruncatedChars = maxDigestChars - truncationIndicator.length - linkWithSpace.length;
      return (truncationNeeded
              ? (digested.substr (0, maxTruncatedChars) + truncationIndicator)
              : digested)
	+ ((alwaysIncludeLink || truncationNeeded) ? linkWithSpace : '');
    });
}

// So-called "countWords" actually just flags which "words" we have seen
// Words are symbol/variable/function names, or fragments of text
function countWords (text, ParseTree, isWord) {
  isWord = isWord || {};
  function countWord (word) {
    if (word)
      isWord[word.toLowerCase()] = true;
  }
  function countWordsAtNodes (nodes) {
    if (nodes)
      nodes.forEach (countWordsAtNode);
  }
  function countWordsAtNode (node) {
    if (typeof(node) === 'object') {
      if (node.functag)
	countWord (ParseTree.funcChar + node.functag);
      switch (node.type) {
      case 'lookup':
	countWord (ParseTree.varChar + node.varname);
        break
      case 'assign':
	countWord (ParseTree.varChar + node.varname);
        countWordsAtNodes (node.value);
        countWordsAtNodes (node.local);
        break
      case 'alt':
        node.opts.forEach (countWordsAtNodes);
        break
      case 'rep':
        countWordsAtNodes (node.unit);
        break
      case 'func':
	countWord (ParseTree.funcChar + node.funcname);
	switch (node.funcname) {
	case 'eval':
          countWordsAtNodes (node.value);
          countWordsAtNodes (node.args);
	  break
	case 'strictquote':
	case 'quote':
	case 'unquote':
        default:
          countWordsAtNodes (node.args);
          break
	}
        break
      case 'cond':
        if (ParseTree.isTraceryExpr (node))
	  countWord (ParseTree.traceryChar + ParseTree.traceryVarName(node) + ParseTree.traceryChar);
        countWordsAtNodes (node.test);
        countWordsAtNodes (node.t);
        countWordsAtNodes (node.f);
        break
      case 'root':
      case 'alt_sampled':
        countWordsAtNodes (node.rhs);
        break
      case 'rep_sampled':
        node.reps.forEach (countWordsAtNodes);
        break
      case 'sym':
	countWord (ParseTree.symChar + ParseTree.leftBraceChar + (node.user || ParseTree.defaultUser) + '/' + node.name + ParseTree.rightBraceChar);
        countWordsAtNodes (node.rhs);
        countWordsAtNodes (node.bind);
        break
      default:
	break
      }
    } else if (typeof(node) === 'string')
      node
      .replace(/[^a-zA-Z0-9_]/g,' ')  // these are the characters we keep
      .replace(/\s+/g,' ').replace(/^ /,'').replace(/ $/,'')  // collapse all runs of space & remove start/end space
      .split(' ')
      .forEach (countWord);
  }
  
  var parsed = ParseTree.parseRhs (text);
  countWordsAtNodes (parsed);

  return isWord;
}

function getWords (text, ParseTree) {
  return Object.keys (countWords (text, ParseTree, {})).sort();
}

module.exports = {
  extend: extend,
  escapeHTML: escapeHTML,
  expandMarkdown: expandMarkdown,
  digestText: digestText,
  clickHandlerName: clickHandlerName,
  makeInternalLink: makeInternalLink,
  countWords: countWords,
  getWords: getWords,

  // Special pages
  defaultSymbolName: 'welcome',
  suggestionsSymbolName: 'editor_suggestions',

  // Other special strings
  bookmarkTag: bookmarkTag,
  bookmarkRegex: bookmarkRegex,
  
  // Bracery expansion limits
  braceryLimits: {
    maxDepth: 100,
    maxRecursion: 3,
    maxReps: 10,
    maxNodes: 1048576,  // 2^20
    maxLength: 16384,  // 2^14
    enableParse: false,
  },
};
