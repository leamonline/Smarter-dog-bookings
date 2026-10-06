/**
 * scripts/lex-migration-sql.pl decides what scripts/apply-hosted-migrations.sh
 * executes for a committed migration (the file minus its own top-level
 * `begin;`/`commit;` lines) and what it refuses (any other top-level
 * transaction control, which would commit the schema change ahead of the
 * ledger row, and psql meta-commands or variable references, which psql
 * would act on before PostgreSQL saw the file).
 *
 * It must read a file the way psql and PostgreSQL do: in one pass, in order.
 * Each case here is a way a line-wise scan could be fooled: a `commit;` line
 * inside a dollar-quoted body is content and must not be removed (the ledger
 * stores the file as committed, so removing it would execute different SQL
 * from what is recorded); a `--` inside a string is not a comment, so the
 * `commit and chain` after it must still be seen; `foo$x$` is an identifier,
 * not the start of a dollar-quoted string; an E'' string escapes with
 * backslashes; a quoted identifier may contain anything.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LEXER = join(process.cwd(), "scripts", "lex-migration-sql.pl");

function lex(mode: "skeleton" | "executed" | "check", input: string) {
  const result = spawnSync("perl", [LEXER, mode], { input, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function refusals(input: string): string[] {
  const { status, stdout } = lex("check", input);
  return status === 0 ? [] : stdout.split("\n").filter(Boolean);
}

const TRANSACTION = "top-level transaction control the apply cannot keep atomic: ";
const DIRECTIVE = "psql meta-command or variable interpolation outside a string: ";

describe("lex-migration-sql.pl: what the apply executes", () => {
  it("removes only the file's own top-level begin;/commit; lines, not the same lines inside a dollar-quoted body", () => {
    const file = [
      "begin;",
      "insert into templates (body) values ($body$",
      "begin;",
      "template text",
      "commit;",
      "$body$);",
      "create procedure p() language plpgsql as $$",
      "begin",
      "  commit;",
      "end;",
      "$$;",
      "commit;",
      "",
    ].join("\n");
    const { status, stdout } = lex("executed", file);
    expect(status).toBe(0);
    expect(stdout).toBe(file.split("\n").slice(1, -2).join("\n") + "\n");
    expect(stdout).toContain("\nbegin;\ntemplate text\ncommit;\n");
    expect(stdout).toContain("\n  commit;\n");
    expect(refusals(file)).toEqual([]);
  });

  it("removes only the pair that encloses the file, never a second pair, one inside other SQL or an unmatched begin;", () => {
    const twoPairs = "begin;\nselect 1;\ncommit;\nbegin;\nselect 2;\ncommit;\n";
    expect(lex("executed", twoPairs).stdout).toBe("select 1;\ncommit;\nbegin;\nselect 2;\n");
    expect(refusals(twoPairs)).toEqual([`${TRANSACTION}commit`, `${TRANSACTION}begin`]);
    const inner = "select 1;\nbegin;\nselect 2;\ncommit;\nselect 3;\n";
    expect(lex("executed", inner).stdout).toBe(inner);
    expect(refusals(inner)).toEqual([`${TRANSACTION}begin`, `${TRANSACTION}commit`]);
    const unmatched = "begin;\nselect 1;\n";
    expect(lex("executed", unmatched).stdout).toBe(unmatched);
    expect(refusals(unmatched)).toEqual([`${TRANSACTION}begin`]);
    const commented = "-- header\n\nbegin;\nselect 1;\ncommit;\n-- footer\n";
    expect(lex("executed", commented).stdout).toBe("-- header\n\nselect 1;\n-- footer\n");
    expect(refusals(commented)).toEqual([]);
  });

  it("accepts the other spellings of the file's own transaction, with a trailing -- comment", () => {
    const { stdout } = lex("executed", "BEGIN TRANSACTION; -- start\nselect 1;\ncommit work;\n");
    expect(stdout).toBe("select 1;\n");
  });

  it("keeps a begin; that shares its line with anything else, so there is no enclosing pair and both ends are refused", () => {
    const file = "begin; /* note */\nselect 1;\ncommit;\n";
    expect(lex("executed", file).stdout).toBe(file);
    expect(refusals(file)).toEqual([`${TRANSACTION}begin`, `${TRANSACTION}commit`]);
  });

  it("returns a file without its own transaction byte for byte", () => {
    expect(lex("executed", "select 1;\nselect 2;\n").stdout).toBe("select 1;\nselect 2;\n");
    expect(lex("executed", "select 1;").stdout).toBe("select 1;");
    expect(lex("executed", "").stdout).toBe("");
  });

  it("does not take a string that closes at the start of a line for a top-level begin;", () => {
    // `select 'a\n' begin;` is a select with a bare column alias.
    const file = "select 'a\n'begin;\n";
    expect(lex("executed", file).stdout).toBe(file);
    expect(refusals(file)).toEqual([]);
  });
});

describe("lex-migration-sql.pl: what the apply refuses", () => {
  it("sees transaction control after a string that contains a comment marker", () => {
    expect(refusals("select '--'; commit and chain;\n")).toEqual([`${TRANSACTION}commit and chain`]);
    expect(refusals("select 'x'; -- real comment; commit and chain;\n")).toEqual([]);
  });

  it("reads /* */ comments as PostgreSQL does, nested and before any -- inside them", () => {
    expect(refusals("/* -- */ commit and chain;\n")).toEqual([`${TRANSACTION}commit and chain`]);
    expect(refusals("/* /* inner */ commit and chain; */ select 1;\n")).toEqual([]);
    expect(refusals("select 1 /* multi\nline */; rollback;\n")).toEqual([`${TRANSACTION}rollback`]);
  });

  it("leaves whitespace where a /* */ comment was, so it cannot join two words into one", () => {
    expect(refusals("select 1;\ncommit/**/and chain;\n")).toEqual([`${TRANSACTION}commit and chain`]);
    expect(refusals("select 1;\ncommit/* a *//* b */work;\n")).toEqual([`${TRANSACTION}commit  work`]);
    expect(lex("skeleton", "commit/**/and chain;\n").stdout).toBe("commit and chain;\n");
  });

  it("reads foo$x$ as an identifier, never as the start of a dollar-quoted string", () => {
    expect(refusals("select foo$x$ from t; commit and chain; -- $x$\n")).toEqual([`${TRANSACTION}commit and chain`]);
    expect(refusals("select $x$ commit and chain; $x$;\n")).toEqual([]);
    expect(refusals("create function f() returns void language plpgsql as $$\nbegin\n  perform 1;\nend;\n$$;\n")).toEqual([]);
  });

  it("understands backslash escapes inside E'' strings only", () => {
    expect(refusals("select E'\\'; commit and chain; --';\n")).toEqual([]);
    expect(refusals("select E'a\\\\'; commit and chain;\n")).toEqual([`${TRANSACTION}commit and chain`]);
    expect(refusals("select '\\'; commit and chain;\n")).toEqual([`${TRANSACTION}commit and chain`]);
    expect(refusals("select '\\'; commit and chain; --';\n")).toEqual([`${TRANSACTION}commit and chain`]);
  });

  it("reads a quoted identifier as one token whatever it contains", () => {
    const file = 'create table "x; commit and chain; --" (id int);\n';
    expect(refusals(file)).toEqual([]);
    expect(lex("skeleton", file).stdout).toBe('create table "I" (id int);\n');
  });

  it("reads a SQL-standard BEGIN ATOMIC body as a body, not as a transaction", () => {
    expect(refusals("create function f() returns int language sql begin atomic select 1; end;\n")).toEqual([]);
    expect(refusals("create procedure p() language sql begin atomic insert into t values (1); delete from t; end;\nselect 1;\n")).toEqual([]);
    // Transaction control inside such a body is still refused, and a lone END still is.
    expect(refusals("create function f() returns int language sql begin atomic commit; select 1; end;\n")).toEqual([`${TRANSACTION}commit`]);
    expect(refusals("select 1;\nend;\n")).toEqual([`${TRANSACTION}end`]);
    // An empty body closes at once, bodies nest, and the END after the last
    // body is still a lone END.
    expect(refusals("create procedure p() language sql begin atomic end;\nselect 1;\n")).toEqual([]);
    const nested = "create function f() returns int language sql begin atomic create function g() returns int language sql begin atomic select 2; end; select 1; end;\n";
    expect(refusals(nested)).toEqual([]);
    expect(refusals(`${nested}end;\n`)).toEqual([`${TRANSACTION}end`]);
  });

  it("opens a BEGIN ATOMIC body only in a CREATE FUNCTION or CREATE PROCEDURE, after its parameter list", () => {
    // Both words are non-reserved identifiers anywhere else, and the END
    // after them ends a transaction: the text is judged whole and that END
    // is still refused.
    expect(refusals("select begin atomic from (values (1)) t(begin);\nend;\n")).toEqual([`${TRANSACTION}end`]);
    expect(refusals("begin atomic select 1;\nend;\n")).toEqual([`${TRANSACTION}begin atomic select 1`, `${TRANSACTION}end`]);
    expect(refusals("create function f(begin atomic) returns int language sql as $$ select 1 $$;\nend;\n")).toEqual([`${TRANSACTION}end`]);
    expect(refusals("create function f() returns int language sql begin atomic select begin atomic from (values (1)) t(begin); end;\nend;\n")).toEqual([`${TRANSACTION}end`]);
    expect(refusals("create or replace procedure p() language sql begin atomic select 1; end;\n")).toEqual([]);
    expect(refusals("CREATE FUNCTION f(a int) RETURNS int LANGUAGE sql BEGIN ATOMIC SELECT a; END;\n")).toEqual([]);
  });

  it("refuses every top-level transaction-ending form", () => {
    for (const statement of [
      "start transaction",
      "commit and chain",
      "commit prepared 'x'",
      "rollback",
      "end",
      "abort",
      "prepare transaction 'x'",
      "begin isolation level serializable",
    ]) {
      expect(refusals(`select 1;\n${statement};\n`)).toEqual([`${TRANSACTION}${statement.replace(/'x'/, "'S'")}`]);
    }
  });

  it("refuses psql meta-commands and variable references outside strings, and nothing inside them", () => {
    expect(refusals("\\set x 1\nselect :'x', :\"y\", :z;\n")).toEqual([
      `${DIRECTIVE}\\set`,
      `${DIRECTIVE}:'S'`,
      `${DIRECTIVE}:"I"`,
      `${DIRECTIVE}:z`,
    ]);
    expect(refusals("select 'a'::int, $$ :w \\echo $$, '\\set', E'\\\\set', '-- :x';\n")).toEqual([]);
    // psql's fourth form, the variable-existence test, substitutes TRUE/FALSE.
    expect(refusals("select :{?version};\n")).toEqual([`${DIRECTIVE}:{?version}`]);
    expect(refusals("select '{?version}', $$:{?x}$$, \"{?y}\";\n")).toEqual([]);
  });

  it("refuses a string, identifier, comment or dollar-quoted body still open at the end of the file", () => {
    for (const [input, what] of [
      ["select 'abc;\n", "' string"],
      ["select E'abc\\';\n", "E' string"],
      ['select "abc;\n', '" identifier'],
      ["/* abc\n", "/* comment"],
      ["select $$abc;\n", "$$ string"],
      ["select 1;\nselect $tag$abc;\n", "$tag$ string"],
    ]) {
      for (const mode of ["executed", "check"] as const) {
        const { status, stdout, stderr } = lex(mode, input);
        expect(status).toBe(1);
        expect(stdout).toBe("");
        expect(stderr).toContain(`unterminated ${what} opened on line ${input.split("\n").length - 1}`);
      }
    }
  });

  it("refuses a file that mentions the settings its reading depends on", () => {
    for (const input of ["-- set standard_conforming_strings = off\nselect 1;\n", "set client_encoding = 'SJIS';\n"]) {
      const { status, stderr } = lex("check", input);
      expect(status).toBe(1);
      expect(stderr).toContain("standard_conforming_strings or client_encoding");
    }
  });

  it("keeps line numbers in the skeleton so a stripped line is the file's line", () => {
    const file = "select $$\na\nb$$, 'x\ny', \"q\nr\" /* c\nd */ -- e\n;\nbegin;\n";
    expect(lex("skeleton", file).stdout).toBe("select \n\n, 'S'\n, \"I\"\n \n  \n;\nbegin;\n");
  });

  it("rejects an unknown mode", () => {
    expect(lex("bogus" as never, "select 1;\n").status).toBe(2);
  });
});

describe("lex-migration-sql.pl: the committed migrations", () => {
  it("reads every file under supabase/migrations/ and refuses none of them", () => {
    const bash = spawnSync(
      "bash",
      [
        "-c",
        `for f in supabase/migrations/*.sql; do
           perl "$1" executed < "$f" > /dev/null || echo "UNREADABLE $f"
           perl "$1" check < "$f" > /dev/null || echo "REFUSED $f"
         done`,
        "bash",
        LEXER,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(bash.status).toBe(0);
    expect(bash.stdout).toBe("");
  }, 60_000);
});
