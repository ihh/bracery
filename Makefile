PEGFILES = $(wildcard src/*.peg.js)
ALL = src/rhs.js browser/bracery.js browser/bracery.min.js

NODE_BIN = node_modules/.bin
PEGJS = $(NODE_BIN)/pegjs
BROWSERIFY = $(NODE_BIN)/browserify
UGLIFYJS = $(NODE_BIN)/uglifyjs

all: $(ALL)

clean:
	rm $(ALL)

src/rhs.js: src/rhs.defs.js src/rhs.peg.js
	(echo "{"; cat src/rhs.defs.js; echo "}"; cat src/rhs.peg.js) | $(PEGJS) >$@

src/shim.js:
	echo "window.bracery = require('./bracery');" >$@

browser/bracery.js: src/shim.js src/bracery.js src/parsetree.js src/rhs.js
	$(BROWSERIFY) src/shim.js >$@

browser/bracery.min.js: browser/bracery.js
	$(UGLIFYJS) $< >$@
