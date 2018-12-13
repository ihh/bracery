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

# Human Disease Ontology
doid.obo:
	curl -O 'https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/master/src/ontology/doid.obo' >$@

doid.json: doid.obo
	perl obo.pl --desc "Disease terms, with increasing specificity. A random subset of the OBO Human Disease Ontology" --source "https://github.com/DiseaseOntology/HumanDiseaseOntology" --tag 'diseases' --file $< >$@
