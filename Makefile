ALL = src/rhs.js web/bracery.js web/bracery.min.js

NODE_MOD = node_modules
PEGJS = $(NODE_MOD)/.bin/pegjs
BROWSERIFY = $(NODE_MOD)/browserify/bin/cmd.js
UGLIFYJS = $(NODE_MOD)/uglify-js/bin/uglifyjs

all: $(ALL)

postinstall: all

clean:
	rm $(ALL)

src/rhs.js: src/rhs.defs.js src/rhs.peg.js
	(echo "{"; cat src/rhs.defs.js; echo "}"; cat src/rhs.peg.js) | $(PEGJS) >$@

src/shim.js:
	echo "window.bracery = require('./bracery');" >$@


web/bracery.nocompromise.js: src/shim.js src/bracery.js src/parsetree.js src/rhs.js src/chomsky.js src/template.js
	$(BROWSERIFY) src/shim.js >$@

web/bracery.js: web/bracery.nocompromise.js
	cat $(NODE_MOD)/compromise/builds/compromise.es6.js >$@
	cat $< >>$@

web/bracery.min.js: web/bracery.nocompromise.js
	cat $(NODE_MOD)/compromise/builds/compromise.es6.min.js >$@
	cat $< >>$@

%.md:
	node -e 'var n = 0;console.log (fs.readFileSync("$@").toString().replace(/(~~~~\n)([^~]+)(\n~~~~\n\n<\!--DEMO-->).*/g,function(_m,b,c,e){return b+c+e+" <em> <a style=\"float:right;\" href=\"https://bracery.org/guest/readme_example"+(++n)+"?edit=true&reset=true&enableParse=true&eval="+encodeURIComponent(c)+"\">Try this</a> </em>"}))' >$@.tmp
	mv $@.tmp $@
