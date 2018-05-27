JSFILES = $(wildcard *.js)
JSONFILES = $(subst .js,.json,$(JSFILES))

all: $(JSONFILES)

test:
	@echo JSFILES = $(JSFILES)
	@echo JSONFILES = $(JSONFILES)

clean:
	rm $(JSONFILES)

%.json: %.js
	node $< >$@
