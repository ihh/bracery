#!/usr/bin/env perl -w

use strict;

use Getopt::Long;

my ($filename, $id, $root, $subset);
my ($tag, $desc, $source) = ('entries', 'n/a', 'n/a');
my $is_a = 'is_a';
my $maxLen = 100;
my $maxNum = 1000;
my $maxSynonyms = 3;
my $minDepth = 2;
GetOptions ("maxlen=i" => \$maxLen,
	    "maxnum=i" => \$maxNum,
	    "maxsyn=i" => \$maxSynonyms,
	    "mindepth=i" => \$minDepth,
	    "id=s" => \$id,
	    "tag=s" => \$tag,
	    "desc=s" => \$desc,
	    "source=s" => \$source,
	    "root=s" => \$root,
	    "subset=s" => \$subset,
	    "relation=s" => \$is_a,
	    "file=s"   => \$filename)
    or die("Error in command line arguments\n");

die "Please specify --file" unless $filename;

my ($terms, $by_id) = parseOBO (`cat $filename`);

my @t = grep ((!$id || $_->{'id'} =~ /$id/)
	      && !($_->{'name'} =~ /^\d/ || $_->{'name'} =~ /\d$/ || length($_->{'name'}) > $maxLen)
	      && (!$root || grep ($_->{'id'} eq $root, transClosure($_)))
	      && (!$subset || inSubset($_,$subset))
	      && transClosure($_) > $minDepth,
	      @$terms);
if (@t > $maxNum) {
    my $i;
    for $i (0..$maxNum-1) {
	my $j = int (($#t - $i) * rand()) + $i + 1;
	@t[$i,$j] = @t[$j,$i];
    }
}
my @short = @t > $maxNum ? @t[0..$maxNum-1] : @t;

print "{\n";
print " \"description\": \"$desc\",\n";
print " \"source\": \"$source\",\n";
print " \"$tag\":\n";
print " [\n";
print "  ", join (",\n  ", map (makeEntry($_), @short)), "\n ]\n}\n";

sub transClosure {
    my ($term, $visited) = @_;
    $visited = $visited || {};
    if ($visited->{$term}) { return () }
    $visited->{$term} = 1;
    return ($root && $term->{'id'} eq $root) ? ($term) : ($term, map (transClosure($_,$visited), @{$term->{'parents'}}));
}

sub makeEntry {
    my ($term) = @_;
    my @syns = transClosure ($term);
    @syns = @syns[0..$#syns-$minDepth];
    @syns = @syns[0..$maxSynonyms-1];
    @syns = grep (length($_->{'name'}), @syns);
    return ($maxSynonyms == 1
	    ? makeStr($syns[0]->{'name'})
	    : ("[ " . join (", ", map (makeStr($_->{'name'}), reverse @syns)) . " ]"));
}

sub makeStr {
    my ($s) = @_;
    return "\"$s\"";
}

sub parseOBO {
    my @text = @_;
    my (@term, $current);
    local $_;
    foreach $_ (@text) {
	if (/\S/) {
	    if (!$current && /^\[([^\]]+)\]\s*$/) {
		$current = { 'child' => [],
				 'subset' => [],
				 'type' => $1 };
		$current->{$is_a} = [];
	    } elsif (/^(\w+): (.*)/) {
		my ($field, $value) = ($1, $2);
		if (exists($current->{$field})) {
		    if (ref($current->{$field}) ne 'ARRAY') {
			$current->{$field} = [$current->{$field}];
		    }
		    push @{$current->{$field}}, $value;
		} else {
		    $current->{$field} = $value;
		}
	    }
	} else {
	    if ($current) {
		push @term, $current;
	    }
	    $current = undef;
	}
    }

    my $term;
    my %by_id;
    foreach $term (@term) {
	my $id = $term->{'id'};
	if ($id && $id =~ /^(\S+)/) {
	    $term->{'id'} = $1;
	    $by_id{$1} = $term;
	}
    }

    foreach $term (@term) {
	my $parent_id;
	$term->{'parents'} = [];
	foreach $parent_id (@{$term->{$is_a}}) {
	    if ($parent_id =~ /^(\S+)/) {
		my $parent = $by_id{$1};
		push @{$parent->{'child'}}, $term;
		push @{$term->{'parents'}}, $parent;
	    }
	}
    }

    my @t;
    foreach $term (@term) {
	if ($term->{'name'} && $term->{'type'} ne 'Typedef') {
	    my @c = @{$term->{'child'}};
	    if (grep(@{$_->{'child'}},@c) == 0) {
		push @t, $term;
	    }
	}
    }

    return (\@t, \%by_id, \@term);
}

sub inSubset {
    my ($term, $subset) = @_;
    my @defs = @{$term->{'subset'}};
    return grep (/^$subset/, @defs) > 0;
}
