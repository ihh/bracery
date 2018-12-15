JSFILES = $(wildcard *.js)
JSONFILES = $(subst .js,.json,$(JSFILES))

all: $(JSONFILES)

test:
	@echo JSFILES = $(JSFILES)
	@echo JSONFILES = $(JSONFILES)

clean:
	rm $(JSONFILES)

mobythes.aur:
	curl 'https://raw.githubusercontent.com/words/moby/master/words.txt' >$@

dict:
	curl -L -O http://wordnetcode.princeton.edu/wn3.1.dict.tar.gz
	tar xvzf wn3.1.dict.tar.gz

wordnet.json: wordnet.js dict
	node $< >$@

dariusk_corpora.json: dariusk_corpora.js
	cd obo; $(MAKE)
	node $< >$@

moby.json: moby.js mobythes.aur
	node $< >$@

%.json: %.js
	node $< >$@

%.bracery: %.json
	node -e 'fs=require("fs");wn=JSON.parse(fs.readFileSync("$<"));console.log(wn.map(x=>(">"+x.name+"\n"+x.rules.map(r=>r[0]).join("\n")+"\n")).join("\n")+"\n")' >$@
