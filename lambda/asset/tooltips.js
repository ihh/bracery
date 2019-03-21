var tooltip = {
  home: 'Go to the welcome page.',
  eval: 'Enter template text here.',
  erase: 'Clear the template text and initial variables.',
  reset: 'Reload the template text from the server, and clear the initial variables.',
  reroll: 'Regenerate the expansion text randomly from the template text.',
  tweet: 'Tweet out the current expansion text.',
  clear_autosave: 'Clear the auto-saved session data on the server.',
  autotweet: 'Add this page as a template for a Twitter bot.',
  revoke_autotweet: 'Remove page from Twitter bot\'s repertoire.',
  revoke_all_autotweets: 'Cancel this Twitter bot entirely.',
  previous_revision: 'View the previous version of this page.',
  name: 'The name this template will be published under.',
  save: 'Publish this element for browsing and re-use by other users.',
  sourcereveal: 'Reveal the template text for this expansion, so it can be viewed or edited.',
  sourcehide: 'Hide the template text for this expansion.',
  lock: 'If checked, other users can still view this template, but they can\'t save over it.',
  debugreveal: 'Reveal the debugging tools, showing variable assignments before and after expansion.',
  debughide: 'Hide the debugging tools.',
  varsbefore: 'Variable assignments before expansion of the template.',
  varsafter: 'Variable assignments after expansion of the template.',
  init: 'The template text actually used for the expansion. Normally this is the text typed into this page, but it may change if the reader follows a link.',
  suggest: 'Show suggestions for phrase lists to go in the template.',
  docs: 'View documentation on GitHub.',
  login: 'Log in, or create a new account.',
  logout: 'Log out of this account.',
};

function addTooltips() {
  Object.keys(tooltip).forEach (function (id) {
    var element = document.getElementById (id)
    if (element)
      element.title = tooltip[id]
  })
}
