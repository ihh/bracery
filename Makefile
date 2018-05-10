ALL = lib/bracery.js lib/bracery.min.js

all: $(ALL)

clean:
	rm $(ALL)

lib/%.min.js: lib/%.js
	node_modules/uglify-js/bin/uglifyjs $< >$@

lib/shim.js:
	echo "window.bracery = require('../index.js');" >$@

lib/bracery.js: index.js parsetree.js grammar/rhs.js lib/shim.js
	node_modules/browserify/bin/cmd.js lib/shim.js -o $@
