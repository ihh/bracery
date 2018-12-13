all: diseases.json infectious_diseases.json cancer.json cephalopodAnatomy.json symptoms.json

# Human Disease ontology
doid.obo:
	curl -O 'https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/master/src/ontology/doid.obo' >$@

diseases.json: doid.obo
	perl obo.pl --desc "Disease terms, with increasing specificity. A random subset of the OBO Human Disease Ontology" --source "https://github.com/DiseaseOntology/HumanDiseaseOntology" --tag 'diseases' --file $< >$@

infectious_diseases.json: doid.obo
	perl obo.pl --maxsyn 1 --subset zoonotic_infectious_disease --desc "Infectious diseases. A subset of the OBO Human Disease Ontology" --source "https://github.com/DiseaseOntology/HumanDiseaseOntology" --tag 'diseases' --file $< >$@

cancer.json: doid.obo
	perl obo.pl --maxsyn 1 --root DOID:162 --desc "Types of cancer. A subset of the OBO Human Disease Ontology" --source "https://github.com/DiseaseOntology/HumanDiseaseOntology" --tag 'cancers' --file $< >$@

# Cephalopod ontology
ceph.obo:
	curl -O 'https://raw.githubusercontent.com/obophenotype/cephalopod-ontology/master/ceph.obo' >$@

cephalopodAnatomy.json: ceph.obo
	perl obo.pl --id CEPH --maxsyn 1 --desc "Cephalopod body parts. From the OBO Cephalopod Ontology" --source "https://github.com/obophenotype/cephalopod-ontology" --tag 'parts' --file $< >$@

# Disease Symptom ontology
symp.obo:
	curl -O 'https://raw.githubusercontent.com/DiseaseOntology/SymptomOntology/master/symp.obo' >$@

symptoms.json: symp.obo
	perl obo.pl --maxsyn 1 --desc "Disease symptoms. From the OBO Symptom Ontology" --source "https://github.com/DiseaseOntology/SymptomOntology" --tag 'symptoms' --file $< >$@
