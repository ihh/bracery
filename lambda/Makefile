
ZIP = zip

all: bracery-store.zip bracery-view.zip bracery-asset.zip bracery-expand.zip

COMMON = bracery-config.js bracery-web.js bracery-util.js
bracery-store.zip: bracery-store.js $(COMMON)
	cp $< index.js
	$(ZIP) $@ index.js $(COMMON)
	rm index.js

TEMPLATES = index.html
bracery-view.zip: bracery-view.js $(COMMON) $(TEMPLATES)
	cp $< index.js
	$(ZIP) $@ index.js $(COMMON) $(TEMPLATES)
	rm index.js

ASSETS = asset/bracery-view.js asset/bracery-view.css
bracery-asset.zip: bracery-asset.js $(COMMON) $(ASSETS)
	cp $< index.js
	$(ZIP) $@ index.js $(COMMON) $(ASSETS)
	rm index.js

WEB_BRACERY = ../web/bracery.min.js
MARKED = marked.min.js
asset/bracery-view.js: $(WEB_BRACERY) asset/$(MARKED) asset/bracery-web.js asset/view.js
	cat $^ >$@

asset/bracery-web.js: asset/bracery-web-shim.js
	browserify $< >$@

MARKED_DIR = ../node_modules/marked
asset/%.js: $(MARKED_DIR)/%.js expand-deps
	cp $< $@

BRACERY_SOURCES = bracery.js template.js parsetree.js chomsky.js validator.js rhs.js
COMPROMISE = compromise.es6.min.js
bracery-expand.zip: bracery-expand.js $(COMMON) expand-deps/$(COMPROMISE) $(addprefix expand-deps/,$(BRACERY_SOURCES))
	cp $< index.js
	$(ZIP) $@ index.js $(COMMON) expand-deps/*.js
	rm index.js

expand-deps/node_modules:
	cd expand-deps; npm install

expand-deps/%.js: ../src/%.js expand-deps
	cp $< $@

COMPROMISE_DIR = ../node_modules/compromise/builds
expand-deps/%.js: $(COMPROMISE_DIR)/%.js expand-deps
	cp $< $@

expand-deps:
	mkdir $@
