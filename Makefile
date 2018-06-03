PEGFILES = $(wildcard src/*.peg.js)
ALL = src/rhs.js web/bracery.js web/bracery.min.js

NODE_BIN = node_modules/.bin
PEGJS = $(NODE_BIN)/pegjs
BROWSERIFY = $(NODE_BIN)/browserify
UGLIFYJS = $(NODE_BIN)/uglifyjs

all: $(ALL)

postinstall: all

clean:
	rm $(ALL)

src/rhs.js: src/rhs.defs.js src/rhs.peg.js
	(echo "{"; cat src/rhs.defs.js; echo "}"; cat src/rhs.peg.js) | $(PEGJS) >$@

src/shim.js:
	echo "window.bracery = require('./bracery');" >$@

web/bracery.js: src/shim.js src/bracery.js src/parsetree.js src/rhs.js
	$(BROWSERIFY) src/shim.js >$@

web/bracery.min.js: web/bracery.js
	$(UGLIFYJS) $< >$@

README.md:
	node -e 'console.log (fs.readFileSync("$@").toString().replace(/(~~~~\n)([^~]+)(\n~~~~\n\n<\!--DEMO-->).*/g,function(_m,b,c,e){return b+c+e+" <em> <a style=\"float:right;\" href=\"http://htmlpreview.github.io/?https://github.com/ihh/bracery/blob/master/web/demo.html#"+encodeURIComponent(c)+"\">Try this</a> </em>"}))' >$@.tmp
	mv $@.tmp $@
