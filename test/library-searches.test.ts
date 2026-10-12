/** Searching records its actor and private window once, before selection, through saved continuation.
 * Past 150 lines to keep the search contract, Wan's two watches and journal migration together. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { relive, replay, open, save, fork, type Header } from "../src/core/journal.ts";
import { describe, project } from "../src/core/view.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { load } from "../src/core/cards.ts";
import type { Instruction } from "../src/core/language.ts";
import { main, place, announce, passBoth, step, finish, example, establish, pack } from "./play.ts";

const wan = "Wan Shi Tong, Librarian";
const searchEvents = (table: Table) => table.log.flatMap(one => one.changes).filter(one => one.do === "keyword" && one.name === "search");
const find = (table: Table, id: string) => {
	const before = structuredClone(table), decision = nextDecision(table)!;
	assert.deepEqual(table, before, "listing a search is pure");
	const option = decision.options.find(one => one.id.endsWith(`:${id}`)); assert.ok(option, decision.question);
	apply(table, option.id, "model", "chosen");
};
function position(ready = true) {
	const table = start(standard, [{ deck: alpha(deck("Dimir Midrange")) }, { deck: alpha(deck("Selesnya Landfall")) }], "library-searches", undefined, { searchesFrom: 0 });
	establish(table, 0, wan); establish(table, 1, "Fabled Passage", []); if (ready) main(table, 1);
	return table;
}
function resolveWatches(table: Table) {
	finish(table);
	while (nextDecision(table)?.situation === "trigger-order") apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
	while (cardsIn(table, "stack").length) { passBoth(table); finish(table); }
}

test("a whole-library search counts even when empty, preserves optionality and identity privacy, and resumes once", () => {
	const base = example("Crack Fabled Passage for a basic land");
	for (const mode of ["land", "none", "empty", "decline", "may", "quantity", "repeat", "reshuffle", "other", "look", "last", "departed", "choice-decline", "choice-accept"] as const) {
		const table = position(), bird = cardsIn(table, "battlefield", 0).find(one => one.card === wan)!;
		const who = mode === "other" ? "opponent" : "you";
		const choose: Instruction = { do: "choose", who: "you", from: { zones: ["library"], owner: who, ...(["quantity", "choice-accept"].includes(mode) ? {} : { types: ["land"] }) }, count: ["quantity", "choice-accept"].includes(mode) ? 2 : 1, as: "land" };
		const shuffle: Instruction = { do: "shuffle", who };
		let instructions: Instruction[] = [choose, shuffle];
		if (mode === "land") instructions = base.instructions;
		if (mode === "last") instructions = [choose];
		if (mode.startsWith("choice-")) instructions = [{ ...choose, may: true }];
		if (mode === "departed") instructions = [choose, { do: "destroy", every: { types: ["creature"], controller: "opponent" } }, shuffle];
		if (mode === "decline" || mode === "may") instructions = [{ do: "perform", who: "you", may: true, instructions }];
		if (mode === "repeat") instructions = [choose, { ...choose, as: "second" }, shuffle];
		if (mode === "reshuffle") instructions = [choose, shuffle, { ...choose, as: "second" }, shuffle];
		if (mode === "look") instructions = [{ do: "look", who: "you", what: { top: 2, of: "you" }, as: "window" },
			{ do: "choose", who: "you", from: { zones: ["library"], is: "bound:window" }, count: 1, as: "picked" }];
		if (mode === "empty") commit(table, cardsIn(table, "library", 1).map(one => ({ do: "move", what: one.id, to: "outside", reason: "game-setup" })), "game-setup");
		// Variants isolate search rules using registered physical cards, not alternative Oracle interpretations.
		const procedure = checkProcedure({ ...base, claim: mode === "land" ? base.claim : `Search contract fixture: ${mode}`, instructions });
		const initial = structuredClone(table), from = table.ledger.length, hand = cardsIn(table, "hand", 0).length;
		announce(table, procedure); passBoth(table);
		const before = structuredClone(table), at = table.ledger.length, library = cardsIn(table, "library", mode === "other" ? 0 : 1);
		if (mode === "decline" || mode === "may") step(table, label => mode === "decline" ? label.startsWith("Decline") : label.startsWith("Carry out"));
		if (mode === "choice-decline") find(table, "decline-search");
		if (mode === "look") {
			step(table); assert.equal(searchEvents(table).length, 0);
			assert.ok(nextDecision(table)!.options.every(one => !one.label.startsWith("Search")));
			apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
		} else if (mode !== "decline" && mode !== "choice-decline") {
			const start = nextDecision(table)!;
			assert.equal(start.seat, 1); assert.equal(start.options.length, mode === "choice-accept" ? 2 : 1);
			assert.ok(start.options.every(one => !one.objects?.length && !one.cards?.length));
			for (const card of library) assert.equal(project(table, 1).objects!.find(one => one.id === card.id)?.card, undefined);
			find(table, "search");
			assert.equal(searchEvents(table).length, 1);
			assert.equal(table.waiting.length, mode === "other" ? 0 : 1);
			assert.equal(nextDecision(table)!.situation, "resolution", "waiting search triggers cannot interrupt this effect");
			const searched = structuredClone(table), searchedAt = table.ledger.length;
			for (const viewer of [0, 1, "spectator"] as const) for (const card of library)
				assert.equal(project(table, viewer).objects!.find(one => one.id === card.id)?.card, viewer === 1 ? card.card : undefined);
			const receipt = table.log.at(-1)!;
			assert.match(describe(table, receipt, "spectator"), /searched .* library/);
			assert.ok(!library.some(card => describe(table, receipt, "spectator").includes(card.card!)), "the receipt carries no private card names");
			if (mode === "land") step(table, label => label.startsWith("Choose Forest"));
			else if (mode === "quantity" || mode === "choice-accept") {
				assert.ok(!nextDecision(table)!.options.some(one => one.id.endsWith(":done")), "quantity-only searches cannot fail to find");
				apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
				const picked = structuredClone(table), pickedAt = table.ledger.length;
				assert.equal(table.resolution!.picked.length, 1); assert.equal(searchEvents(table).length, 1);
				assert.ok(!nextDecision(table)!.options.some(one => one.id.endsWith(":done")));
				apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); finish(table);
				assert.deepEqual(relive(picked, table.ledger.slice(pickedAt)), table);
			} else find(table, "done");
			if (mode === "repeat" || mode === "reshuffle") {
				if (mode === "reshuffle") step(table);
				find(table, "search"); find(table, "done");
			}
			finish(table);
			assert.deepEqual(relive(searched, table.ledger.slice(searchedAt)), table, "clone during the private selection records no second search");
		}
		const expected = ["decline", "choice-decline", "look"].includes(mode) ? 0 : mode === "reshuffle" ? 2 : 1;
		assert.equal(searchEvents(table).length, expected);
		resolveWatches(table);
		assert.equal(table.things.get(bird.id)!.counters["+1/+1"] ?? 0, mode === "other" || mode === "departed" ? 0 : expected, mode);
		assert.equal(cardsIn(table, "hand", 0).length, hand + (mode === "other" ? 0 : expected));
		assert.equal(project(table, 1).objects!.filter(one => one.zone === "library").length, 0, "search access closes with the effect or shuffle");
		if (mode === "decline" || mode === "choice-decline") { assert.deepEqual(table.rng, before.rng); assert.ok(!table.log.slice(before.log.length).some(one => one.changes.some(change => change.do === "look"))); }
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		assert.deepEqual(relive(before, table.ledger.slice(at)), table);
	}

	// The two entry instructions use the cast's X, including odd halves rounded down.
	const castTable = start(standard, [{ deck: alpha(deck("Dimir Midrange")) }, { deck: alpha(deck("Selesnya Landfall")) }], "wan-cast", undefined, { searchesFrom: 0 });
	main(castTable, 0); const [bird] = place(castTable, 0, "hand", wan);
	editWork(castTable, 0, [{ do: "package.put", package: { card: wan, assessed: true, registers: pack(wan), procedures: [example("Cast Wan Shi Tong with X")] } }], "prepare-wan");
	commit(castTable, [{ do: "add-mana", who: 0, colors: ["U", "U", "C", "C", "C"] }], "game-setup");
	const castInitial = structuredClone(castTable), castAt = castTable.ledger.length, hand = cardsIn(castTable, "hand", 0).length;
	announce(castTable, example("Cast Wan Shi Tong with X"), one => one.activation.x === 3); passBoth(castTable); resolveWatches(castTable);
	assert.equal(bird!.counters["+1/+1"], 3); assert.equal(cardsIn(castTable, "hand", 0).length, hand, "cast one card, then draw floor(3/2)");
	assert.deepEqual(relive(castInitial, castTable.ledger.slice(castAt)), castTable);

	const table = position(); table.searchesFrom = table.ledger.length;
	const legacy = structuredClone(table); delete legacy.searchesFrom;
	announce(table, base); passBoth(table); const at = table.ledger.length;
	find(table, "search"); const pending = structuredClone(table), selectedAt = table.ledger.length;
	find(table, "done"); resolveWatches(table);
	announce(legacy, base); passBoth(legacy);
	assert.ok(nextDecision(legacy)!.options.some(one => one.objects?.length), "historical games retain their original decision sequence");
	const dir = mkdtempSync(join(tmpdir(), "library-searches-"));
	try {
		const universe = load("cards/standard.tsv"), header: Header = { id: "search", seed: table.rng.seed, format: "standard", searchesFrom: table.searchesFrom,
			seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: universe.path, generated: universe.generated, names: universe.names, faces: universe.faces },
			rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
		const journal = open(join(dir, "game.jsonl"), header); save(journal, table);
		assert.deepEqual(replay(journal.path, () => position(false)).table, table);
		for (const version of [at, selectedAt]) {
			const path = join(dir, `clone-${version}.jsonl`); fork(journal.path, version, `clone-${version}`, path);
			const clone = replay(path, () => position(false)).table;
			if (version === selectedAt) assert.deepEqual(clone.resolution, pending.resolution);
			assert.deepEqual(relive(clone, table.ledger.slice(version)), table);
		}
		delete header.searchesFrom; const old = open(join(dir, "historical.jsonl"), header); save(old, legacy);
		assert.deepEqual(replay(old.path, () => position(false)).table, legacy, "the header overrides a starter's search default");
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
