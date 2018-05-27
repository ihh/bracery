var jsonschema = require('jsonschema')

// for Tracery
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

// for "Bracery JSON", enforce an extremely simple schema requiring the definition of any symbol to be an alternation over strings
// this shouldn't really be relied on as very stable, it's mostly for import
var braceryJSONSchema = {
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

function isBraceryJSON (json) {
  return !validateBraceryJSON(json).errors.length
}

function validateBraceryJSON (json) {
  var validator = new jsonschema.Validator()
  var result = validator.validate (json, braceryJSONSchema, {nestedErrors: true})
  return result
}

module.exports = {
  isTracery: isTracery,
  validateTracery: validateTracery,
  isBraceryJSON: isBraceryJSON,
  validateBraceryJSON: validateBraceryJSON
}
