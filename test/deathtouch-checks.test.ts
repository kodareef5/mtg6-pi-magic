/** Deathtouch is an occurrence since the last check, not a property of marked damage. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { beforeDamage } from "../src/core/damage-order.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { open, save, fork, replay as replayJournal, relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import type { Change } from "../src/core/syntax.ts";
import { dealtTable, matchup, universe } from "../tools/matchup-fixture.ts";
import type { Procedure } from "../src/core/language.ts";
import { announce, main, pack, passBoth, finish, place, quiet, step } from "./play.ts";

const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const build = (modern = true) => {
	const table = start(standard, [{ deck: alpha(deck("Jund Sacrifice")) }, { deck: alpha(deck("Lifegain")) }], "deathtouch-checkpoint", undefined, modern ? { deathtouchFrom: 0 } : {});
	main(table, 0);
	const get = (who: number, card: string) => cardsIn(table, "hand", who).find(one => one.card === card) ?? place(table, who, "hand", card)[0]!;
	const wolf = get(0, "Wolverine, Fierce Fighter"), bat = get(1, "Deep-Cavern Bat");
	commit(table, [{ do: "move", what: wolf.id, to: "battlefield", reason: "game-setup", registers: pack(wolf.card!) },
		{ do: "move", what: bat.id, to: "battlefield", reason: "game-setup" }], "game-setup");
	commit(table, [{ do: "note", note: { kind: "label", on: ref(bat), by: 1, until: "indefinite", text: "Deathtouch fixture", change: { words: ["deathtouch"] } } }], "game-setup");
	return { table, wolf, bat, get };
};
const hit = (source: Thing, target: Thing, amount = 1): Extract<Change, { do: "damage" }> => ({ do: "damage", source: ref(source), target: ref(target), amount });
const protect = (table: Table, one: Thing) => commit(table, [{ do: "note", note: { kind: "label", on: ref(one), by: one.controller, until: "indefinite", text: "Protection fixture", change: { words: ["indestructible"] } } }], "game-setup");
const remove = (table: Table, one: Thing) => commit(table, [{ do: "note", note: { kind: "label", on: ref(one), by: one.controller, until: "indefinite", text: "Ability loss fixture", change: { loseAbilities: true } } }], "resolve");
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
const check = (table: Table) => { const decision = nextDecision(table)!; assert.equal(decision.situation, "state-based"); assert.equal(decision.options.length, 1); apply(table, decision.options[0]!.id, "engine", "forced"); };

test("deathtouch survives healing until a checkpoint, expires after surviving it, and respects intervening resolution and type changes", () => {
	for (const modern of [false, true]) {
		const { table, wolf, bat } = build(modern); protect(table, wolf); commit(table, [hit(bat, wolf)], "resolve");
		assert.equal(wolf.deathtouched, true); assert.equal(wolf.damage, 1);
		const before = structuredClone(table), logs = table.log.length; nextDecision(table); project(table, 0); assert.deepEqual(table, before);
		if (modern) { check(table); assert.equal(wolf.deathtouched, undefined); assert.equal(table.log.length, logs, "the check is recorded as a compulsory decision, not a card event"); replay(table, before); }
		else assert.equal(nextDecision(table)!.situation, "priority", "historical journals retain their previous check path");
		assert.equal(wolf.damage, 1); remove(table, wolf);
		assert.equal(nextDecision(table)!.situation, modern ? "priority" : "state-based");
		if (modern) { commit(table, [hit(bat, wolf)], "resolve"); check(table); assert.equal(wolf.zone, "graveyard", "fresh deathtouch still destroys it"); }
	}
	// A later heal followed by prevention removes every mark before any check. The first occurrence still destroys.
	const healed = build(); commit(healed.table, [hit(healed.bat, healed.wolf)], "resolve");
	commit(healed.table, [{ do: "note", note: { kind: "damage-rule", mode: "prevent", by: 0, until: "end-of-turn" } }], "resolve");
	commit(healed.table, beforeDamage(healed.table, [hit(healed.wolf, healed.wolf)], "resolve"), "resolve");
	const ordered = structuredClone(healed.table);
	apply(healed.table, nextDecision(healed.table)!.options.find(one => one.label.includes("Wolverine"))!.id, "model", "chosen");
	assert.equal(healed.wolf.damage, 0); assert.equal(healed.wolf.deathtouched, true); check(healed.table); assert.equal(healed.wolf.zone, "graveyard"); replay(healed.table, ordered);
	// A checkpoint between instructions would let this creature live. No checkpoint is allowed during resolution.
	const sequence = build(); protect(sequence.table, sequence.wolf);
	const fixture: Procedure = { source: { refs: [ref(sequence.wolf)], zones: ["battlefield"], controller: "self" }, claim: "Damage then remove protection fixture", basis: "Checkpoint ordering fixture", timing: "stack", targets: [{ object: { name: sequence.bat.card!, controller: "opponent" } }],
		instructions: [{ do: "damage", to: "this", from: "target:0", amount: 1 }, { do: "modify", what: "this", change: { loseAbilities: true }, until: "end-of-turn" }] };
	const beginning = structuredClone(sequence.table); announce(sequence.table, fixture); passBoth(sequence.table); step(sequence.table);
	assert.equal(sequence.wolf.deathtouched, true); assert.equal(nextDecision(sequence.table)!.situation, "resolution"); const mid = structuredClone(sequence.table);
	finish(sequence.table); assert.equal(sequence.wolf.zone, "graveyard"); replay(sequence.table, mid); replay(sequence.table, beginning);
	// Planeswalker damage counts too if that permanent becomes a creature before the check.
	for (const checked of [false, true]) {
		const { table, bat, get } = build(), ajani = get(1, "Ajani Resolute");
		commit(table, [{ do: "move", what: ajani.id, to: "battlefield", reason: "game-setup" }], "game-setup");
		const loyalty = ajani.counters.loyalty!; commit(table, [hit(bat, ajani)], "resolve"); assert.equal(ajani.counters.loyalty, loyalty - 1); assert.equal(ajani.damage, 0);
		if (checked) { const before = structuredClone(table); check(table); replay(table, before); }
		commit(table, [{ do: "note", note: { kind: "label", on: ref(ajani), by: 1, until: "end-of-turn", text: "Animation fixture", change: { types: { add: ["creature"] }, base: { power: 5, toughness: 5 } } } }], "resolve");
		assert.ok(characteristics(table, ajani)!.types.includes("creature"));
		if (checked) assert.equal(nextDecision(table)!.situation, "priority");
		else { const before = structuredClone(table); check(table); assert.equal(ajani.zone, "graveyard"); replay(table, before); }
	}
	// Clearing old damage occurrences alone does not open cleanup priority.
	const cleanup = build(); protect(cleanup.table, cleanup.wolf);
	for (let guard = 0; guard < 250 && !(cleanup.table.cursor.steps[0] === "cleanup" && cleanup.table.cursor.stepDone); guard++) {
		const decision = nextDecision(cleanup.table); if (!decision) advance(cleanup.table); else apply(cleanup.table, quiet(decision.options).id, "model", "chosen");
	}
	assert.equal(cleanup.table.cursor.steps[0], "cleanup"); assert.equal(cleanup.table.cursor.stepDone, true);
	commit(cleanup.table, [hit(cleanup.bat, cleanup.wolf)], "resolve");
	commit(cleanup.table, [{ do: "turn", action: "complete" }], "state-based-action");
	assert.equal(cleanup.wolf.damage, 0); assert.equal(cleanup.wolf.deathtouched, true, "cleanup removes marks, not an unchecked damage occurrence");
	const before = structuredClone(cleanup.table); check(cleanup.table); assert.equal(cleanup.table.cursor.cleanupPriority, undefined); assert.equal(cleanup.table.cursor.priority, null);
	assert.equal(nextDecision(cleanup.table), null); assert.equal(before.things.get(cleanup.wolf.id)!.deathtouched, true);
	// Leaving and returning makes a new incarnation, with no inherited damage occurrence.
	const returned = build(); commit(returned.table, [hit(returned.bat, returned.wolf)], "resolve");
	commit(returned.table, [{ do: "move", what: returned.wolf.id, to: "hand", reason: "bounce" }, { do: "move", what: returned.wolf.id, to: "battlefield", reason: "resolve" }], "resolve");
	assert.equal(returned.wolf.deathtouched, undefined); assert.equal(returned.wolf.damage, 0); assert.equal(nextDecision(returned.table)!.situation, "priority");
	const dir = mkdtempSync(join(tmpdir(), "deathtouch-journal-"));
	try {
		const original = start(standard, [{ deck: alpha(deck("Jund Sacrifice")) }, { deck: alpha(deck("Lifegain")) }], "deathtouch-prefix", universe, { deathtouchFrom: 0 });
		const path = join(dir, "original.jsonl"), child = join(dir, "child.jsonl");
		const journal = open(path, { id: "original", seed: original.rng.seed, format: "standard", deathtouchFrom: 0,
			seats: original.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: matchup.cards, rules: matchup.rules, created: new Date().toISOString() });
		save(journal, original); fork(path, 0, "child", child);
		const rebuilt = replayJournal(path, dealtTable).table, cloned = replayJournal(child, dealtTable).table;
		assert.equal(rebuilt.deathtouchFrom, 0); assert.deepEqual(cloned, rebuilt);
		const { deathtouchFrom, ...oldHeader } = journal.header, old = open(join(dir, "old.jsonl"), { ...oldHeader, id: "old" });
		const legacy = replayJournal(old.path, header => ({ ...dealtTable(header), deathtouchFrom: 0 })).table;
		assert.equal(legacy.deathtouchFrom, undefined, "a modern initializer cannot upgrade an old journal silently");
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
