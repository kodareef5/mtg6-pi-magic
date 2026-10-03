/**
 * The committed rules file, and the reader over it.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { cited, load, rule, search, term } from "../src/core/rules.ts";

const rules = load("rules/cr.tsv");

test("it loads every row and states its own date", () => {
	assert.equal(rules.entries.length, 4063);
	assert.equal(rules.effective, "September 25, 2026");
	assert.equal(rules.entries.filter((e) => e.kind === "rule").length, 3166);
	assert.equal(rules.entries.filter((e) => e.kind === "head").length, 156);
	assert.equal(rules.entries.filter((e) => e.kind === "term").length, 741);
});

test("a rule the design depends on is there, in full", () => {
	assert.match(rule(rules, "613.4").text, /Within layer 7/);
	assert.match(rule(rules, "117.5").text, /state-based actions/);
	assert.match(rule(rules, "104.3a").text, /concede/);
});

test("an unknown rule names its group rather than returning nothing", () => {
	assert.throws(() => rule(rules, "613.99"), /No rule 613\.99.*Rule 613 is/s);
});

test("an example stays with the rule it follows", () => {
	const withExample = rules.entries.filter((e) => e.text.includes("\nExample:"));
	assert.ok(withExample.length > 200, `${withExample.length} rules carry an example`);
});

test("a glossary term is found however it is capitalised", () => {
	assert.equal(term(rules, "deathtouch")?.ref, "Deathtouch");
	assert.match(term(rules, "DEATHTOUCH")!.text, /keyword ability/);
	assert.equal(term(rules, "not a word"), undefined);
});

test("search puts the definition ahead of the mentions", () => {
	const hits = search(rules, "deathtouch");
	assert.equal(hits[0]?.kind, "term");
	assert.ok(hits.length > 1);
	assert.equal(search(rules, "613.4")[0]?.ref, "613.4");
	assert.deepEqual(search(rules, ""), []);
});

test("every word has to appear", () => {
	assert.equal(search(rules, "deathtouch xyzzy").length, 0);
});

test("citations come back as refs that resolve", () => {
	const refs = cited(rule(rules, "702.2b").text);
	for (const ref of refs) assert.ok(rules.byRef.has(ref), `${ref} resolves`);
});
