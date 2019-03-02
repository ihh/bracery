
ZIP = zip

all: bracery-store.zip bracery-view.zip bracery-asset.zip

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

BRACERY = ../web/bracery.min.js
asset/bracery-view.js: $(BRACERY) asset/view.js
	cat $^ >$@
