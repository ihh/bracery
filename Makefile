lib/bracery.js: index.js parsetree.js grammar/rhs.js
	node_modules/browserify/bin/cmd.js index.js >$@
