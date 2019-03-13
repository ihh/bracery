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

function makeInternalLink (text, link) {
  var safeLink = escapeHTML (link.text)
  return '&LINK_BEGIN;' + safeLink + '&LINK_TEXT;' + text.text + '&LINK_END;'
}

var clickHandlerName = 'handleBraceryLink'
function expandInternalLinks (text) {
  var regex = /^([\s\S]*)&LINK_BEGIN;([\s\S]*)&LINK_TEXT;([\s\S]*)&LINK_END;([\s\S]*)$/;
  do {
    var replaced = false;
    text = text.replace
    (regex,
     function (_m, before, safeLink, text, after) {
       replaced = true;
       return before + '<a href="#" onclick="' + clickHandlerName + '(\'' + safeLink + '\')">' + text + '</a>' + after;
     });
  } while (replaced);
  return text;
}

function expandMarkdown (text, marked) {
  // Prevent inclusion of <script> tags or arbitrary HTML
  var safeText = text.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var html = marked (safeText);  // Markdown expansion
  return expandInternalLinks (html);
}

function digestHTML (html, domParser, maxDigestChars, link) {
  var linkWithSpace = link ? (' ' + link) : '';
  var truncationIndicator = '...';
  var maxTruncatedChars = maxDigestChars - truncationIndicator.length - linkWithSpace.length;
  var digested = domParser.parseFromString(html,'text/html').documentElement.textContent
      .replace(/^\s*/,'').replace(/\s*$/,'');
  return (maxDigestChars && (digested.length > maxTruncatedChars)
          ? (digested.substr (0, maxTruncatedChars) + truncationIndicator)
          : digested) + linkWithSpace;
}

// So-called "countWords" actually just flags which "words" we have seen
// Words are things that don't look like concatenated expressions
function countWords (text, isWord) {
  isWord = isWord || {};
  var words = text.toLowerCase()
      .replace(/[^a-zA-Z0-9_&~%@]/g,'')  // these are the characters we keep
      .replace(/\s+/g,' ').replace(/^ /,'').replace(/ $/,'')  // collapse all runs of space & remove start/end space
      .split(' ');
  words.forEach (function (word) { isWord[word] = true; });
  return isWord;
}

function getWords (text) {
  return Object.keys (countWords (text, {})).sort();
}

module.exports = {
  extend: extend,
  escapeHTML: escapeHTML,
  expandMarkdown: expandMarkdown,
  digestHTML: digestHTML,
  clickHandlerName: clickHandlerName,
  makeInternalLink: makeInternalLink,
  countWords: countWords,
};
