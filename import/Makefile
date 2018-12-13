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

# Human Disease ontology
doid.obo:
	curl -O 'https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/master/src/ontology/doid.obo' >$@

doid.json: doid.obo
	perl obo.pl --desc "Disease terms, with increasing specificity. A random subset of the OBO Human Disease Ontology" --source "https://github.com/DiseaseOntology/HumanDiseaseOntology" --tag 'diseases' --file $< >$@

# Cephalopod ontology
ceph.obo:
	curl -O 'https://raw.githubusercontent.com/obophenotype/cephalopod-ontology/master/ceph.obo' >$@

ceph.json: ceph.obo
	perl obo.pl --id CEPH --maxsyn 1 --desc "Cephalopod body parts. From the OBO Cephalopod Ontology" --source "https://github.com/obophenotype/cephalopod-ontology" --tag 'parts' --file $< >$@

# Disease Symptom ontology
symp.obo:
	curl -O 'https://raw.githubusercontent.com/DiseaseOntology/SymptomOntology/master/symp.obo' >$@

symp.json: symp.obo
	perl obo.pl --maxsyn 1 --desc "Disease symptoms. From the OBO Symptom Ontology" --source "https://github.com/DiseaseOntology/SymptomOntology" --tag 'symptoms' --file $< >$@
