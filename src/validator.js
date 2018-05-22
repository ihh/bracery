var jsonschema = require('jsonschema')

var tracerySchema = {
  type: "object",
  patternProperties: {
    "^.*$": {
      oneOf: [
        {
          type: "array",
          items: {
            type: "string"
          }
        },
        { type: "string" }
      ]
    }
  },
  additionalProperties: false
}

var wikiMessSchema = {
  type: "array",
  items: {
    properties: {
      name: { type: "string" },
      rules: {
        type: "array",
        items: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          items: { type: "string" }
        }
      }
    },
    required: ["name", "rules"],
    additionalProperties: true
  }
}

function isTracery (json) {
  return !validateTracery(json).errors.length
}

function validateTracery (json) {
  var validator = new jsonschema.Validator()
  var result = validator.validate (json, tracerySchema, {nestedErrors: true})
  return result
}

function isWikiMess (json) {
  return !validateWikiMess(json).errors.length
}

function validateWikiMess (json) {
  var validator = new jsonschema.Validator()
  var result = validator.validate (json, wikiMessSchema, {nestedErrors: true})
  return result
}

module.exports = {
  isTracery: isTracery,
  validateTracery: validateTracery,
  isWikiMess: isWikiMess,
  validateWikiMess: validateWikiMess
}
