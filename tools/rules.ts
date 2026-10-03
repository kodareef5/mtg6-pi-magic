#!/usr/bin/env node
// A local, searchable Comprehensive Rules. One row per rule, subrule, heading
// and glossary term; tab separated; examples folded into the rule they follow.
//
// The rules page lists the current file and the URL changes with every set, so
// the default below is the one that was current when this was written and
// --url takes a newer one. The effective date in the output is read from the
// file itself, so it is never a guess.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

type Row = [kind: string, ref: string, text: string];

const CACHE = process.env.PI_MAGIC_CACHE || ".";
const RAW = `${CACHE}/cr.txt`, OUT = `${CACHE}/rules.tsv`;
const SOURCE = "https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt";
const UA = { "User-Agent": "pi-magic/0", Accept: "*/*" };
const FS = "\t", COLUMNS = ["kind", "ref", "text"];
// The text carries 38 U+2028 line separators, which fold a continuation
// paragraph into a rule. JavaScript's `.` does not match one, so the patterns
// below take the s flag and esc flattens them. Without both, 38 rules vanish.
const BREAKS = new RegExp(`[\\t\\n${String.fromCharCode(0x2028, 0x2029)}]+`, "g");
// Separators are a no-break space, which is why a plain blank-line test misses
// them. Eight genuinely empty lines appear too, and both mean the same thing.
const sep = (l: string) => l.replace(/[\s ]/g, "") === "";
const esc = (s: string) => s.replace(BREAKS, " ").trim();
// A number may or may not carry a trailing period, in both forms: 606.5 and
// 119.1d. appear exactly as written.
const RULE = /^(\d{3}\.\d+[a-z]*)\.?\s+(\S.*)$/s, GROUP = /^(\d{3})\.\s+(\S.*)$/s, SECT = /^(\d)\.\s+(\S.*)$/s;
const CITE = /\brules?\s+(\d{3}(?:\.\d+[a-z]*)?)/g;

async function fetchRaw(url: string, force = false) {
  if (existsSync(RAW) && !force) return;
  process.stderr.write(`downloading ${url}\n`);
  const r = await fetch(url, { headers: UA }); if (!r.ok) throw Error(`${r.status} ${r.statusText}: ${url}`);
  writeFileSync(RAW + ".part", await r.text()); renameSync(RAW + ".part", RAW);
}

function parse(text: string) {
  const lines = text.split("\n"), rows: Row[] = [], lost: string[] = [];
  const date = text.match(/These rules are effective as of ([^.]+)\./)?.[1] ?? "unknown";
  // The contents block repeats every heading, and it ends with its own
  // Glossary and Credits entries. Starting at the first rule line instead
  // would drop the two headings that sit above it.
  const at = (what: string, from = 0) => lines.findIndex((l, i) => i >= from && l.trim() === what);
  const body = at("Credits") + 1, gloss = at("Glossary", body), end = at("Credits", gloss);
  if (body < 1 || gloss < 0 || end < 0) throw Error("not a Comprehensive Rules file: no contents, glossary or credits");

  for (const line of lines.slice(body, gloss)) {
    if (sep(line)) continue;
    const r = RULE.exec(line), g = !r && GROUP.exec(line), s = !r && !g && SECT.exec(line);
    if (r) rows.push(["rule", r[1]!, esc(r[2]!)]);
    else if (g) rows.push(["head", g[1]!, esc(g[2]!)]);
    else if (s) rows.push(["head", s[1]!, esc(s[2]!)]);
    else if (line.startsWith("Example:") && rows.length) rows.at(-1)![2] += `\\n${esc(line)}`;
    else lost.push(line);
  }

  // A glossary entry is a term then its definition, split by separators. Four
  // of them run to two definition lines.
  let block: string[] = [];
  const flush = () => { if (block.length > 1) rows.push(["term", block[0]!, block.slice(1).map(esc).join(" ")]); block = []; };
  for (const line of lines.slice(gloss + 1, end)) { if (sep(line)) flush(); else block.push(line); }
  flush();
  return { rows, lost, date };
}

function write(o: Opts, rows: Row[], date: string) {
  const kinds = o.kind ? new Set(o.kind.split(",")) : null;
  const keep = rows.filter((r) => (!kinds || kinds.has(r[0])) && (!o.only || r[1].startsWith(o.only)));
  const head = `# Magic: The Gathering Comprehensive Rules, one row each
# Effective: ${date}   Rules: ${keep.length}   Generated: ${new Date().toISOString().slice(0, 10)}
# Source: ${o.url}
# Rebuild: ./tools/rules.ts${o.only ? ` --only ${o.only}` : ""}${o.kind ? ` --kind ${o.kind}` : ""}
# TAB-separated; '#' starts a comment; the next line names the columns.
# kind  rule, head (a section or rule-group title), or term (a glossary entry)
# ref   a rule number, a heading number, or the term itself
# text  the rule, with any Example folded in after an escaped \\n
${COLUMNS.join(FS)}\n`;
  writeFileSync(o.out, (o.bare ? `${COLUMNS.join(FS)}\n` : head) + keep.map((r) => r.join(FS) + "\n").join(""));
  return keep;
}

function verify(o: Opts, all: Row[], lost: string[]) {
  const lines = readFileSync(o.out, "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  const hdr = lines.shift()!.split(FS), rows = lines.map((l) => l.split(FS) as Row);
  const err = new Map<string, string[]>();
  const chk = (ok: unknown, k: string, who: string) => { if (ok) return; const a = err.get(k) ?? []; if (a.length < 3) a.push(who); err.set(k, a); };

  chk(hdr.join(FS) === COLUMNS.join(FS), "header mismatch", hdr.join(FS));
  rows.forEach((r) => chk(r.length === 3, "field count", r[1] ?? ""));
  // Nothing in the body may be dropped. Eleven lines were missed by a first
  // parser that assumed every rule number ends in a period; this is the check
  // that found them.
  lost.forEach((l) => chk(false, "line not parsed", l.slice(0, 60)));

  const refs = new Set(all.map((r) => r[1]));
  const seen = new Set<string>();
  for (const [kind, ref] of rows) { chk(!seen.has(`${kind}:${ref}`), "duplicate ref", ref); seen.add(`${kind}:${ref}`); }
  // Every rule the text points at must exist. A parser that mangles a number
  // breaks a cross-reference, so this catches what a row count cannot.
  for (const [, ref, text] of all) for (const m of text.matchAll(CITE)) chk(refs.has(m[1]!), "citation to a missing rule", `${ref} cites ${m[1]}`);
  for (const [, ref, text] of rows) chk(!BREAKS.test(text), "line break left in text", ref);

  const counts = (k: string) => all.filter((r) => r[0] === k).length;
  console.log(`\nverification: ${rows.length} rows written, ${counts("rule")} rules, ${counts("head")} headings, ${counts("term")} terms`);
  if (err.size) { for (const [k, who] of err) console.log(`  FAIL ${k.padEnd(30)} e.g. ${JSON.stringify(who)}`); return false; }
  console.log("  PASS  every body line parsed; refs unique; every citation resolves"); return true;
}

type Opts = { out: string, url: string, only?: string, kind?: string, bare: boolean };

async function main() {
  const { values: a } = parseArgs({ options: {
    refresh: { type: "boolean" }, verify: { type: "boolean" }, url: { type: "string", default: SOURCE },
    only: { type: "string" }, kind: { type: "string", short: "k" }, bare: { type: "boolean" },
    out: { type: "string", short: "o", default: OUT }, help: { type: "boolean", short: "h" } } });
  if (a.help) return console.log(`usage: rules.ts [--refresh] [--verify] [--only PREFIX] [-k KINDS] [--bare] [-o FILE] [--url URL]

  default        every rule, heading and glossary term
  --only 613     only refs starting with that, so one rule group or one rule
  -k rule,term   only these kinds: rule, head, term
  --bare         no comment header, column line only
  --refresh      download the rules text again
  --verify       every body line parsed, refs unique, every citation resolves

  The text is cached at ${RAW}. The rules page lists the current URL and it
  changes with every set; pass --url when it moves.`);
  const o: Opts = { out: a.out!, url: a.url!, bare: !!a.bare, ...(a.only ? { only: a.only } : {}), ...(a.kind ? { kind: a.kind } : {}) };
  await fetchRaw(o.url, a.refresh);
  const { rows, lost, date } = parse(readFileSync(RAW, "utf8"));
  const keep = write(o, rows, date);
  console.log(`wrote ${o.out}: ${keep.length} rows, effective ${date}`);
  if (a.verify && !verify(o, rows, lost)) process.exit(1);
}
main();
