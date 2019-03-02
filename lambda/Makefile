
ZIP = zip

all: bracery-store.zip bracery-view.zip bracery-asset.zip bracery-expand.zip

CONFIG = bracery-config.js
bracery-store.zip: bracery-store.js $(CONFIG)
	cp $< index.js
	$(ZIP) $@ index.js $(CONFIG)
	rm index.js

TEMPLATES = index.html
bracery-view.zip: bracery-view.js $(CONFIG) $(TEMPLATES)
	cp $< index.js
	$(ZIP) $@ index.js $(CONFIG) $(TEMPLATES)
	rm index.js

ASSETS = asset/bracery-view.js asset/bracery-view.css
bracery-asset.zip: bracery-asset.js $(CONFIG) $(ASSETS)
	cp $< index.js
	$(ZIP) $@ index.js $(CONFIG) $(ASSETS)
	rm index.js

WEB_BRACERY = ../web/bracery.min.js
asset/bracery-view.js: $(WEB_BRACERY) asset/view.js
	cat $^ >$@

BRACERY_SOURCES = bracery.js template.js parsetree.js chomsky.js validator.js rhs.js
bracery-expand.zip: bracery-expand.js $(CONFIG) expand-deps/compromise.es6.min.js $(addprefix expand-deps/,$(BRACERY_SOURCES))
	cp $< index.js
	$(ZIP) $@ index.js $(CONFIG) expand-deps/*.js
	rm index.js

expand-deps/node_modules:
	cd expand-deps; npm install

expand-deps/%.js: ../src/%.js expand-deps
	cp $< $@

expand-deps/%.js: ../node_modules/compromise/builds/%.js expand-deps
	cp $< $@

expand-deps:
	mkdir $@
