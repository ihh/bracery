
ZIP = zip

all: bracery-store.zip bracery-view.zip bracery-asset.zip bracery-expand.zip

bracery-store.zip: bracery-store.js
	cp $< index.js
	$(ZIP) $@ index.js
	rm index.js

TEMPLATES = index.html
bracery-view.zip: bracery-view.js $(TEMPLATES)
	cp $< index.js
	$(ZIP) $@ index.js $(TEMPLATES)
	rm index.js

ASSETS = asset/bracery-view.js asset/bracery-view.css
bracery-asset.zip: bracery-asset.js $(ASSETS)
	cp $< index.js
	$(ZIP) $@ index.js $(ASSETS)
	rm index.js

WEB_BRACERY = ../web/bracery.min.js
asset/bracery-view.js: $(WEB_BRACERY) asset/view.js
	cat $^ >$@

BRACERY_SOURCES = bracery.js template.js parsetree.js chomsky.js validator.js rhs.js
bracery-expand.zip: bracery-expand.js expand-deps/compromise.es6.min.js $(addprefix expand-deps/,$(BRACERY_SOURCES))
	cp $< index.js
	$(ZIP) $@ index.js expand-deps/*.js
	rm index.js

expand-deps/node_modules:
	cd expand-deps; npm install

expand-deps/%.js: ../src/%.js expand-deps
	cp $< $@

expand-deps/%.js: ../node_modules/compromise/builds/%.js expand-deps
	cp $< $@

expand-deps:
	mkdir $@
