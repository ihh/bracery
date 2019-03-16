
ZIP = zip

FUNCTIONS = bracery-store bracery-view bracery-asset bracery-expand bracery-login bracery-twitter bracery-bot
ZIPFILES = $(addsuffix .zip,$(FUNCTIONS))
PUBLISH_PSEUDOTARGETS = $(addsuffix .publish,$(FUNCTIONS))

all: $(ZIPFILES)

publish: $(PUBLISH_PSEUDOTARGETS)

%.publish: %.zip
	echo region=$(AWS_DEFAULT_REGION)
	aws lambda update-function-code --region $(AWS_DEFAULT_REGION) --publish --zip-file fileb://$< --function-name $*

COMMON = bracery-config.js bracery-web.js bracery-util.js
bracery-store.zip: bracery-store.js $(COMMON)
	cp $< index.js
	$(ZIP) $@ index.js $(COMMON)
	rm index.js

STAGING_DIR = stage
OAUTH_DEPS = oauth
TWITTER_DEPS = twit
bracery-twitter.zip: bracery-twitter.js $(COMMON)
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cd $(STAGING_DIR); npm install $(OAUTH_DEPS) $(TWITTER_DEPS)
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *

bracery-login.zip: bracery-login.js $(COMMON)
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *

TEMPLATES = index.html
bracery-view.zip: bracery-view.js $(COMMON) $(TEMPLATES)
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *

ASSETS = asset/bracery-view.js asset/bracery-view.css
GZIPPED_ASSETS = $(addsuffix .gz,$(ASSETS))
bracery-asset.zip: bracery-asset.js $(COMMON) $(ASSETS)
	cp $< index.js
	$(ZIP) $@ index.js $(COMMON) $(ASSETS)
	rm index.js

asset/%.gz: asset/%
	gzip -ck $< >$@

WEB_BRACERY = ../web/bracery.min.js
MARKED = marked.min.js
asset/bracery-view.js: $(WEB_BRACERY) asset/$(MARKED) asset/bracery-web.js asset/view.js
	cat $^ >$@

asset/bracery-web.js: asset/bracery-web-shim.js $(COMMON)
	browserify $< >$@

MARKED_DIR = ../node_modules/marked
asset/%.js: $(MARKED_DIR)/%.js
	cp $< $@

BRACERY_SOURCES = bracery.js template.js parsetree.js chomsky.js validator.js rhs.js
COMPROMISE = compromise.es6.min.js
COMPROMISE_DIR = ../node_modules/compromise/builds
BRACERY_SOURCE_DIR = ../src
bracery-expand.zip: bracery-expand.js $(COMMON) $(COMPROMISE_DIR)/$(COMPROMISE) $(addprefix $(BRACERY_SOURCE_DIR)/,$(BRACERY_SOURCES))
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cp $(COMPROMISE_DIR)/$(COMPROMISE) $(STAGING_DIR)
	cp $(addprefix $(BRACERY_SOURCE_DIR)/,$(BRACERY_SOURCES)) $(STAGING_DIR)
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *

BOT_DEPS = marked textversionjs html-entities
bracery-bot.zip: bracery-bot.js $(COMMON) $(COMPROMISE_DIR)/$(COMPROMISE) $(addprefix $(BRACERY_SOURCE_DIR)/,$(BRACERY_SOURCES))
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cp $(COMPROMISE_DIR)/$(COMPROMISE) $(STAGING_DIR)
	cp $(addprefix $(BRACERY_SOURCE_DIR)/,$(BRACERY_SOURCES)) $(STAGING_DIR)
	cd $(STAGING_DIR); npm install $(TWITTER_DEPS) $(BOT_DEPS)
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *
