#!/usr/bin/env perl
# Read one migration file the way psql and PostgreSQL read it, so that
# scripts/apply-hosted-migrations.sh can tell a file's own transaction control
# and psql directives from quoted text that merely looks like them.
#
#   lex-migration-sql.pl skeleton < file
#       The file with every comment removed (-- and nested /* */), every
#       'string' collapsed to 'S' (E'..' backslash escapes understood), every
#       "identifier" collapsed to "I" and every $tag$ body removed with its
#       delimiters. Every newline is kept, so output line N is input line N.
#   lex-migration-sql.pl executed < file
#       The SQL the apply executes: the file minus the lines that are exactly
#       its own top-level begin;/commit; (begin/commit [transaction|work];
#       optionally followed by a -- comment). A line counts only when its
#       skeleton reads exactly that and the file's line is that same text, so
#       a begin; or commit; inside a string or a dollar-quoted body is content
#       and stays, and one that shares a line with the end of a string, an
#       identifier or a comment stays too (check then refuses it).
#   lex-migration-sql.pl check < file
#       Prints every top-level transaction-control statement and every psql
#       meta-command or variable reference left in the executed SQL, one per
#       line, and exits 1 when there is any; prints nothing and exits 0 when
#       the executed SQL is clean.
#
# The scan is one pass, in order, as the psql and PostgreSQL lexers do it: a
# -- inside a string is string content, a quote inside a comment is comment
# content, and an identifier may contain $, so foo$x$ is an identifier and
# never opens a dollar-quoted string. The lexer assumes the Supabase defaults
# (standard_conforming_strings on, UTF-8), so every mode exits 1 when the file
# mentions standard_conforming_strings or client_encoding, and when a string,
# identifier, comment or dollar-quoted body is still open at the end of the
# file (psql would read the rest of the session into it).
use strict;
use warnings;

my $mode = shift @ARGV;
$mode = '' unless defined $mode;
if (@ARGV || $mode !~ /^(?:skeleton|executed|check)$/) {
  print STDERR "usage: lex-migration-sql.pl skeleton|executed|check < file\n";
  exit 2;
}

binmode STDIN;
binmode STDOUT;
local $/;
my $sql = <STDIN>;
$sql = '' unless defined $sql;

if ($sql =~ /standard_conforming_strings|client_encoding/i) {
  print STDERR "the file mentions standard_conforming_strings or client_encoding, which would change how its quoting is read\n";
  exit 1;
}

sub refuse {
  my ($message) = @_;
  print STDERR "$message\n";
  exit 1;
}

# The skeleton of $text: see the header. Newlines inside removed or collapsed
# spans are emitted on their own so line numbers survive.
sub skeleton {
  my ($text) = @_;
  my $out  = '';
  my $line = 1;
  my $keep_newlines = sub {
    my ($span) = @_;
    my $newlines = ($span =~ tr/\n//);
    $out .= "\n" x $newlines;
    $line += $newlines;
  };
  my $open = sub {
    my ($what, $from) = @_;
    refuse("unterminated $what opened on line $from");
  };

  pos($text) = 0;
  while (pos($text) < length $text) {
    if ($text =~ /\G--[^\n]*/gc) {
      next;
    }
    if ($text =~ /\G\/\*/gc) {
      my ($from, $depth) = ($line, 1);
      while ($depth > 0) {
        if    ($text =~ /\G\/\*/gc)                   { $depth++ }
        elsif ($text =~ /\G\*\//gc)                   { $depth-- }
        elsif ($text =~ /\G(\n|[^\n\/*]+|[\/*])/gc)   { $keep_newlines->($1) }
        else                                          { $open->('/* comment', $from) }
      }
      next;
    }
    if ($text =~ /\G'/gc) {
      my $from = $line;
      $text =~ /\G((?:[^']|'')*)'/gcs or $open->("' string", $from);
      $out .= "'S'";
      $keep_newlines->($1);
      next;
    }
    if ($text =~ /\G"/gc) {
      my $from = $line;
      $text =~ /\G((?:[^"]|"")*)"/gcs or $open->('" identifier', $from);
      $out .= '"I"';
      $keep_newlines->($1);
      next;
    }
    if ($text =~ /\G([A-Za-z_\x80-\xff][A-Za-z0-9_\$\x80-\xff]*)/gc) {
      my $word = $1;
      if (lc($word) eq 'e' && $text =~ /\G'/gc) {
        # E'..': a backslash escapes the next character, '' is a quote.
        my $from = $line;
        $text =~ /\G((?:[^'\\]|\\.|'')*)'/gcs or $open->("E' string", $from);
        $out .= "'S'";
        $keep_newlines->($1);
        next;
      }
      $out .= $word;
      next;
    }
    if ($text =~ /\G\$([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)?\$/gc) {
      my $delimiter = '$' . (defined $1 ? $1 : '') . '$';
      my $from = $line;
      my $close = index $text, $delimiter, pos $text;
      $open->("$delimiter string", $from) if $close < 0;
      $keep_newlines->(substr $text, pos $text, $close - pos $text);
      pos($text) = $close + length $delimiter;
      next;
    }
    $text =~ /\G(\n|[^\n'"\$\/\-A-Za-z_\x80-\xff]+|.)/gcs
      or refuse("lexer stalled on line $line");
    $out .= $1;
    $line++ if $1 eq "\n";
  }
  return $out;
}

my $skeleton = skeleton($sql);
if ($mode eq 'skeleton') {
  print $skeleton;
  exit 0;
}

my @sql_lines      = split /\n/, $sql,      -1;
my @skeleton_lines = split /\n/, $skeleton, -1;
refuse('internal error: the skeleton does not line up with the file')
  unless @sql_lines == @skeleton_lines;

# The file's own top-level begin;/commit; lines.
my $own_transaction = qr/^\s*(?:begin|commit)(?:\s+(?:transaction|work))?\s*;\s*$/i;
my %drop;
for my $i (0 .. $#skeleton_lines) {
  next unless $skeleton_lines[$i] =~ $own_transaction;
  my $bare = $skeleton_lines[$i];
  $drop{$i} = 1 if $sql_lines[$i] =~ /^\Q$bare\E(?:--.*)?$/;
}
my @kept = grep { !$drop{$_} } 0 .. $#sql_lines;

if ($mode eq 'executed') {
  print join "\n", @sql_lines[@kept];
  exit 0;
}

# check: what psql and PostgreSQL would still act on in the executed SQL.
my $executed_skeleton = join "\n", @skeleton_lines[@kept];
my @findings;

(my $flat = $executed_skeleton) =~ s/\n/ /g;
for my $statement (split /;/, $flat) {
  $statement =~ s/^\s+//;
  $statement =~ s/\s+$//;
  next unless $statement =~ /^(?:begin|start|commit|rollback|end|abort)(?:\s.*)?$|^prepare\s+transaction(?:\s.*)?$/i;
  push @findings, "top-level transaction control the apply cannot keep atomic: $statement";
}

# A backslash outside a string is a psql meta-command; :name, :'name' and
# :"name" outside a string are psql variable references (a :: cast is not).
while ($executed_skeleton =~ /(\\[A-Za-z!?.;]?\S*|(?<!:):[A-Za-z_"'][^\s,);]*)/g) {
  push @findings, "psql meta-command or variable interpolation outside a string: $1";
}

print map { "$_\n" } @findings;
exit(@findings ? 1 : 0);
