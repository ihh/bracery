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

function expandMarkdown (text, marked) {
  // Prevent inclusion of <script> tags or arbitrary HTML
  var safeText = text.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var html = marked (safeText);  // Markdown expansion
  return html;
}

module.exports = {
  extend: extend,
  escapeHTML: escapeHTML,
  expandMarkdown: expandMarkdown,
};
