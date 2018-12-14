all: diseases.json infectious_diseases.json cancer.json symptoms.json environmental_hazards.json anthropogenic_features.json geographic_features.json cephalopod_anatomy.json ant_anatomy.json

# Human Disease ontology
doid.obo:
	curl -O 'https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/master/src/ontology/doid.obo' >$@

diseases.json: doid.obo
	perl obo.pl --desc "Disease terms, with increasing specificity. A random subset of the OBO Human Disease Ontology" --source "https://github.com/DiseaseOntology/HumanDiseaseOntology" --tag 'diseases' --file $< >$@

infectious_diseases.json: doid.obo
	perl obo.pl --maxsyn 1 --subset zoonotic_infectious_disease --desc "Infectious diseases. A subset of the OBO Human Disease Ontology" --source "https://github.com/DiseaseOntology/HumanDiseaseOntology" --tag 'diseases' --file $< >$@

cancer.json: doid.obo
	perl obo.pl --maxsyn 1 --root DOID:162 --desc "Types of cancer. A subset of the OBO Human Disease Ontology" --source "https://github.com/DiseaseOntology/HumanDiseaseOntology" --tag 'cancers' --file $< >$@

# Disease Symptom ontology
symp.obo:
	curl -O 'https://raw.githubusercontent.com/DiseaseOntology/SymptomOntology/master/symp.obo' >$@

symptoms.json: symp.obo
	perl obo.pl --maxsyn 1 --desc "Disease symptoms. From the OBO Symptom Ontology" --source "https://github.com/DiseaseOntology/SymptomOntology" --tag 'symptoms' --file $< >$@

# Environment ontology
envo.obo:
	curl -O 'https://raw.githubusercontent.com/EnvironmentOntology/envo/master/envo.obo' >$@

environmental_hazards.json: envo.obo
	perl obo.pl --file $< --subset environmental_hazards --maxsyn 1 --desc 'Environmental hazards. From the OBO Environment Ontology' --source 'https://github.com/EnvironmentOntology/envo' >$@

anthropogenic_features.json: envo.obo
	perl obo.pl --file $< --root 'ENVO:00000002' --maxsyn 1 --desc 'Anthropogenic environmental features. From the OBO Environment Ontology' --source 'https://github.com/EnvironmentOntology/envo' >$@

geographic_features.json: envo.obo
	perl obo.pl --file $< --root 'ENVO:00000000' --maxsyn 1 --desc 'Geographic features. From the OBO Environment Ontology' --source 'https://github.com/EnvironmentOntology/envo' >$@


# Cephalopod ontology
ceph.obo:
	curl -O 'https://raw.githubusercontent.com/obophenotype/cephalopod-ontology/master/ceph.obo' >$@

cephalopod_anatomy.json: ceph.obo
	perl obo.pl --id CEPH --maxsyn 1 --desc "Cephalopod body parts. From the OBO Cephalopod Ontology" --source "https://github.com/obophenotype/cephalopod-ontology" --tag 'parts' --file $< >$@


# Hymenoptera anatomy
hao.obo:
	curl -O 'https://raw.githubusercontent.com/hymao/hao/master/hao.obo' >$@

ant_anatomy.json: hao.obo
	 perl obo.pl --file $< --maxsyn 1 --maxnum 100 --root 'HAO:0000003' --desc "Hymenoptera (ant, bee, wasp) body parts. From the OBO Hymenoptera Anatomy Ontology" --source "https://github.com/hymao/hao" --tag 'parts' >$@
