
# set AWS keys
include Makefile.keys

ZIP = zip

FUNCTIONS = bracery-store bracery-view bracery-asset bracery-expand bracery-login bracery-twitter bracery-bot bracery-news bracery-index bracery-bookmark
ZIPFILES = $(addsuffix .zip,$(FUNCTIONS))
PUBLISH_PSEUDOTARGETS = $(addsuffix .publish,$(FUNCTIONS))

all: $(ZIPFILES)

publish: $(PUBLISH_PSEUDOTARGETS)

%.publish: %.zip
	@echo Publishing $* '('`stat -f %z $<` 'bytes)'
	@AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) aws lambda update-function-code --region $(AWS_DEFAULT_REGION) --publish --zip-file fileb://$< --function-name $* >$@

COMMON = bracery-config.js bracery-web.js bracery-util.js
bracery-store.zip: bracery-store.js $(COMMON)
	cp $< index.js
	$(ZIP) $@ index.js $(COMMON)
	rm index.js

STAGING_DIR = stage
OAUTH_NPM_DEPS = oauth
TWITTER_NPM_DEPS = twit
bracery-twitter.zip: bracery-twitter.js $(COMMON)
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cd $(STAGING_DIR); npm install $(OAUTH_NPM_DEPS) $(TWITTER_NPM_DEPS)
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *

bracery-login.zip: bracery-login.js $(COMMON)
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *

NODE_MODULES = ../node_modules

COMPROMISE = compromise.es6.min.js
COMPROMISE_DIR = $(NODE_MODULES)/compromise/builds
COMPROMISE_DEP = $(COMPROMISE_DIR)/$(COMPROMISE)

RITA = rita-tiny.js
RITA_DIR = $(NODE_MODULES)/rita/lib
RITA_DEP = $(RITA_DIR)/$(RITA)

BRACERY_SOURCES = bracery.js template.js parsetree.js chomsky.js validator.js rhs.js
BRACERY_SOURCE_DIR = ../src
BRACERY_DEPS = $(addprefix $(BRACERY_SOURCE_DIR)/,$(BRACERY_SOURCES))

EXPAND_DEPS = $(COMPROMISE_DEP) $(RITA_DEP) $(BRACERY_DEPS)

TEMPLATES = index.html
VIEW_NPM_DEPS = marked
bracery-view.zip: bracery-view.js $(COMMON) $(TEMPLATES) $(EXPAND_DEPS)
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cd $(STAGING_DIR); npm install $(VIEW_NPM_DEPS)
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
MARKED_DIR = ../node_modules/marked
asset/bracery-view.js: $(WEB_BRACERY) $(MARKED_DIR)/$(MARKED) $(RITA_DEP) asset/bracery-web.js asset/tooltips.js asset/view.js
	cat $^ >$@

asset/bracery-web.js: asset/bracery-web-shim.js $(COMMON)
	browserify $< >$@

bracery-expand.zip: bracery-expand.js $(COMMON) $(EXPAND_DEPS)
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cp $(COMPROMISE_DEP) $(STAGING_DIR)
	cp $(RITA_DEP) $(STAGING_DIR)
	cp $(BRACERY_DEPS) $(STAGING_DIR)
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *

BOT_NPM_DEPS = $(VIEW_NPM_DEPS) textversionjs html-entities
bracery-bot.zip: bracery-bot.js $(COMMON) $(EXPAND_DEPS)
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)/node_modules
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cp $(COMPROMISE_DEP) $(STAGING_DIR)
	cp $(RITA_DEP) $(STAGING_DIR)
	cp $(BRACERY_DEPS) $(STAGING_DIR)
	cd $(STAGING_DIR); npm install $(TWITTER_NPM_DEPS) $(BOT_NPM_DEPS)
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *

bracery-news.zip: bracery-news.js $(COMMON)
	cp $< index.js
	$(ZIP) $@ index.js $(COMMON)
	rm index.js

bracery-index.zip: bracery-index.js $(COMMON) $(COMPROMISE_DEP) $(BRACERY_DEPS)
	(test -e $(STAGING_DIR) && rm -rf $(STAGING_DIR)) || true
	mkdir -p $(STAGING_DIR)
	cp $^ $(STAGING_DIR)
	mv $(STAGING_DIR)/$< $(STAGING_DIR)/index.js
	cp $(COMPROMISE_DEP) $(STAGING_DIR)
	cp $(BRACERY_DEPS) $(STAGING_DIR)
	cd $(STAGING_DIR); $(ZIP) -r ../$@ *

bracery-bookmark.zip: bracery-bookmark.js $(COMMON)
	cp $< index.js
	$(ZIP) $@ index.js $(COMMON)
	rm index.js
