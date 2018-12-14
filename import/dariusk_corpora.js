var fs = require('fs')
var rp = require('request-promise')
var bb = require('bluebird')
var _ = require('lodash')

var baseUrl = 'https://raw.githubusercontent.com/dariusk/corpora/master/data/'

var targets = [
  { name: 'common_animal',
    path: 'animals/common.json',
    key: 'animals' },

  { name: 'common_flower',
    path: 'plants/flowers.json',
    key: 'flowers' },

  { name: 'common_fruit',
    path: 'foods/fruits.json',
    key: 'fruits' },

  { name: 'common_condiment',
    path: 'foods/condiments.json',
    key: 'condiments' },

  { name: 'common_bread',
    path: 'foods/breads_and_pastries.json',
    key: 'breads' },

  { name: 'common_pastry',
    path: 'foods/breads_and_pastries.json',
    key: 'pastries' },

  { name: 'menu_item',
    path: 'foods/menuItems.json',
    key: 'menuItems' },

  { name: 'human_mood',
    path: 'humans/moods.json',
    key: 'moods' },

  { name: 'rich_person',
    path: 'humans/richpeople.json',
    key: 'richPeople',
    rhs: function (entry) { return [entry.name] }
  },

  { name: 'lovecraftian_god',
    path: 'mythology/lovecraft.json',
    key: 'deities' },
  
  { name: 'lovecraftian_creature',
    path: 'mythology/lovecraft.json',
    key: 'supernatural_creatures' },

  { name: 'famous_duo',
    path: 'humans/famousDuos.json',
    key: 'famousDuos' },

  { name: 'english_town',
    path: 'geography/english_towns_cities.json',
    key: 'towns' },

  { name: 'english_city',
    path: 'geography/english_towns_cities.json',
    key: 'cities' },

  { name: 'american_city',
    path: 'geography/us_cities.json',
    key: 'cities',
    rhs: function (entry) { return [entry.city] } },

  { name: 'london_underground_station',
    path: 'geography/london_underground_stations.json',
    key: 'stations',
    rhs: function (entry) { return [entry.name] } },

  { name: 'major_sea',
    path: 'geography/oceans.json',
    key: 'seas',
    rhs: function (entry) { return [entry.name] } },

  { name: 'major_river',
    path: 'geography/rivers.json',
    key: 'rivers',
    rhs: function (entry) { return [entry.name] } },
  
  { name: 'crayola_color',
    path: 'colors/crayola.json',
    key: 'colors',
    rhs: function (entry) { return [entry.color.toLowerCase()] }
  },

  { name: 'disease_diagnosis',
    path: 'medicine/diagnoses.json',
    key: 'codes',
    rhs: function (entry) { return [entry.desc] }
  },

  { name: 'hebrew_god',
    path: 'mythology/hebrew_god.json',
    key: 'names',
    rhs: function (entry) { return [entry.name] }
  },

  { name: 'harry_potter_spell',
    path: 'words/spells.json',
    key: 'spells',
    rhs: function (entry) { return [entry.incantation] }
  },
]

// 12/15/2017 IH added code to autodetect key, so we can represent targets as a hash
var symbolPath = {
  tolkien_character: 'humans/tolkienCharacterNames.json',
  famous_author: 'humans/authors.json',
  body_part: 'humans/bodyParts.json',
  british_actor: 'humans/britishActors.json',
  famous_celebrity: 'humans/celebrities.json',
  person_adjective: 'humans/descriptions.json',
  english_honorific: 'humans/englishHonorifics.json',
  english_first_name: 'humans/firstNames.json',
  english_last_name: 'humans/lastNames.json',
  spanish_first_name: 'humans/spanishFirstNames.json',
  spanish_last_name: 'humans/spanishLastNames.json',
  human_occupation: 'humans/occupations.json',
  name_prefix: 'humans/prefixes.json',
  name_suffix: 'humans/suffixes.json',
  famous_scientist: 'humans/scientists.json',
  music_genre: 'music/genres.json',
  musical_instrument: 'music/instruments.json',
  random_room: 'architecture/rooms.json',
  art_genre: 'art/isms.json',
  car_manufacturer: 'corporations/cars.json',
  fortune500_company: 'corporations/fortune500.json',
  american_industry: 'corporations/industries.json',
  american_newspaper: 'corporations/newspapers.json',
  tv_show: 'film-tv/tv_shows.json',
  pizza_topping: 'foods/pizzaToppings.json',
  cocktail_name: 'foods/iba_cocktails.json',
  common_vegetable: 'foods/vegetables.json',
  wrestling_move: 'games/wrestling_moves.json',
  major_country: 'geography/countries.json',
  federal_agency: 'governments/us_federal_agencies.json',
  military_operation: 'governments/us_mil_operations.json',
  nsa_project: 'governments/nsa_projects.json',
  bodily_fluid: 'materials/abridged-body-fluids.json',
  building_material: 'materials/building-materials.json',
  decorative_stone: 'materials/decorative-stones.json',
  common_fabric: 'materials/fabrics.json',
  common_fiber: 'materials/fibers.json',
  gemstone: 'materials/gemstones.json',
  common_metal: 'materials/layperson-metals.json',
  packaging_material: 'materials/packaging.json',
  sculpture_material: 'materials/sculpture-materials.json',
  pharma_drug: 'medicine/drugs.json',
  hospital_name: 'medicine/hospitals.json',
  greek_god: 'mythology/greek_gods.json',
  greek_monster: 'mythology/greek_monsters.json',
  greek_titan: 'mythology/greek_titans.json',
  mythic_monster: 'mythology/monsters.json',
  common_clothing: 'objects/clothing.json',
  common_object: 'objects/objects.json',
  home_appliance: 'technology/appliances.json',
  software_technology: 'technology/computer_sciences.json',
  firework: 'technology/fireworks.json',
  brand_of_gun: 'technology/guns_n_rifles.json',
  common_knot: 'technology/knots.json',
  new_technology: 'technology/new_technologies.json',
  programming_language: 'technology/programming_languages.json',
  social_networking_website: 'technology/social_networking_websites.json',
  video_hosting_website: 'technology/video_hosting_websites.json',
  common_adjective: 'words/adjs.json',
  common_adverb: 'words/adverbs.json',
  encouraging_word: 'words/encouraging_words.json',
//  common_expletive: 'words/expletives.json',
  common_interjection: 'words/interjections.json',
  common_noun: 'words/nouns.json',
  oprah_quote: 'words/oprah_quotes.json',
  personal_noun: 'words/personal_nouns.json',
  common_preposition: 'words/prepositions.json',
  drunken_state: 'words/states_of_drunkenness.json',
// Commented out the emoji; Unicode makes Sails barf, apparently
//  emoji: 'words/emoji/emoji.json',
//  cute_kaomoji: 'words/emoji/cute_kaomoji.json',
}

var symbolFile = {
  disease: 'obo/diseases.json',
  infectious_disease: 'obo/infectious_diseases.json',
  cancer: 'obo/cancer.json',
  symptom: 'obo/symptoms.json',
  environmental_hazard: 'obo/environmental_hazards.json',
  anthropogenic_feature: 'obo/anthropogenic_features.json',
  geographic_feature: 'obo/geographic_features.json',
  cephalopod_part: 'obo/cephalopod_anatomy.json',
  ant_part: 'obo/ant_anatomy.json'
}

Object.keys(symbolPath).forEach (function (symbol) {
  targets.push ({ name: symbol,
		  path: symbolPath[symbol] })
})

bb.Promise.map (targets, function (target) {
  return rp (baseUrl + target.path)
    .then (function (htmlString) {
      return processFile (target, htmlString)
    }).catch (function (err) {
      console.warn ('Error fetching ' + target.path)
      throw err
    })
}).then (function (results) {
  results = results.concat (Object.keys(symbolFile).map (function (symbol) {
    var filename = symbolFile[symbol]
    return processFile ({ name: symbol,
                          path: filename,
                          rhs: function (entry) {
                            return _.isArray(entry) ? entry[entry.length-1] : entry
                          } },
                        fs.readFileSync(filename).toString())
  }))
  console.log (JSON.stringify (results))
})

function processFile (target, text) {
  var json
  try {
    json = JSON.parse (text)
  } catch (e) {
    console.warn(text)
    throw e
  }
  var array
  if (target.key)
    array = json[target.key]
  else if (_.isArray(json))
    array = json
  else {
    var keys = Object.keys(json)
	.filter (function (key) {
	  return _.isArray (json[key])
	})
    if (keys.length === 1)
      array = json[keys[0]]
  }
  if (!array)
    throw new Error ('Error autodetecting key for ' + target.path)
  console.warn ('~' + target.name + ' <-- ' + target.path)
  var result = { name: target.name,
                 summary: target.summary,
                 rules: array.map (function (text) {
                   return target.rhs ? target.rhs(text) : [text]
                 })
               }
  return result
}
