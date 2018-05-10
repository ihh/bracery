all: lib/bracery.js lib/bracery.min.js

lib/%.min.js: lib/%.js
	node_modules/uglify-js/bin/uglifyjs $< >$@

lib/bracery.js: index.js parsetree.js grammar/rhs.js
	node_modules/browserify/bin/cmd.js index.js >$@
