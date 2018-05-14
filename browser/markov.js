function messageDiv (message, config) {
  config = config || {}
  var e = document.createElement('div')
  e.innerText = ((config.title
                  ? (message.template.title
                     ? (('[' + message.template.title + ']') + ' ')
                     : '')
                  : '')
                 + (message.template.author
                    ? (message.template.author + ': ')
                    : '')
                 +  message.expansion.text)
  return e
}

var textdefsElement = document.getElementById('textdefs')
var tempdefsElement = document.getElementById('tempdefs')
var threadElement = document.getElementById('thread')
var resetElement = document.getElementById('reset')

function update() {
  try {
    var defs = textdefsElement.value.match(/\S/) ? bracery.ParseTree.parseTextDefs (textdefsElement.value) : {}
    var templates = tempdefsElement.value.match(/\S/) ? bracery.Template.parseTemplateDefs (tempdefsElement.value) : []

    var b = new bracery.Bracery (defs)
    var markovConfig = {
      bracery: b,
      templates: templates,
      vars: {},
      accept: function (message, thread) {
        return new Promise (function (resolve, reject) {
          threadElement.innerHTML = ""
          if (thread)
            thread.forEach (function (threadMessage) {
              threadElement.appendChild (messageDiv (threadMessage))
            })
          threadElement.appendChild (messageDiv (message, { title: true }))
          var acceptElement = document.createElement('a')
          var rejectElement = document.createElement('a')
          var span = document.createElement('span')
          acceptElement.innerText = 'Accept'
          rejectElement.innerText = 'Reject'
          span.innerText = ' / '
          acceptElement.setAttribute ('href', '#')
          rejectElement.setAttribute ('href', '#')
          threadElement.appendChild (acceptElement)
          threadElement.appendChild (span)
          threadElement.appendChild (rejectElement)
          acceptElement.addEventListener ('click', function() { resolve (true) })
          rejectElement.addEventListener ('click', function() { resolve (false) })
        })
      }
    }

    currentAccept = currentReject = null
    bracery.Template.promiseMessageList (markovConfig)
      .then (function (thread) {
        threadElement.innerHTML = ""
        if (thread)
          thread.forEach (function (threadMessage) {
            threadElement.appendChild (messageDiv (threadMessage, { title: true }))
          })
      })
    
  } catch (e) {
    threadElement.innerText = e
  }
}
textdefsElement.addEventListener ('keyup', update)
tempdefsElement.addEventListener ('keyup', update)
resetElement.addEventListener ('click', update)
update()
