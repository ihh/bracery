

PEGFILES = $(wildcard *.peg.js)

all: $(subst .peg.js,.browser.js,$(PEGFILES))

tidy:
	rm *.body.js *.header.js *.input.js *.shim.js *.browser.js || true

clean: tidy
	rm $(subst .peg.js,.js,$(PEGFILES)) || true

%.js: %.input.js
	cat $< | pegjs >$@

%.input.js: %.header.js %.body.js
	(echo "{"; cat $*.header.js; echo "}"; cat $*.body.js) >$@

rhs.body.js: rhs.peg.js
	cat $< >$@

rhs.header.js: rhs.defs.js
	cat $< >$@

%.body.js: %.peg.js rhs.peg.js
	cat $^ >$@

%.header.js: %.defs.js rhs.defs.js
	cat $^ >$@

%.shim.js:
	echo "window.$*Parser = require('./$*.js');" >$@

%.browser.js: %.shim.js %.js
	browserify $*.shim.js >$@

.SECONDARY:
