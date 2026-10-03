import { strict as assert } from "node:assert";
import { test } from "node:test";

import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn, commit, start } from "../src/core/table.ts";

const table = () => start(standard, [
	{ name: "A", deck: Array(60).fill("Forest") },
	{ name: "B", deck: Array(60).fill("Swamp") },
], "decisions");

test("listing a decision never changes the table, including pending losses", () => {
	const built = table();
	const inspect = () => {
		const before = structuredClone(built);
		const first = nextDecision(built);
		assert.deepEqual(nextDecision(built), first);
		assert.deepEqual(built, before);
		return first;
	};
	assert.equal(inspect(), null);
	advance(built);
	assert.equal(inspect()?.situation, "pregame");
	apply(built, "keep", "model", "chosen");
	apply(built, "keep", "model", "chosen");
	advance(built);
	commit(built, [{ do: "change-life", who: 0, amount: -20, reason: "resolve" }], "resolve");
	const loss = inspect()!;
	assert.equal(loss.situation, "state-based");
	apply(built, loss.options[0]!.id, "engine", "forced");
	assert.deepEqual(built.outcome?.results, { 0: "lose", 1: "win" });
	assert.equal(inspect(), null);
});

test("an outcome accounts for every loss in the simultaneous group", () => {
	for (const order of [[0, 1], [1, 0]]) {
		const built = table();
		advance(built);
		apply(built, "keep", "model", "chosen");
		apply(built, "keep", "model", "chosen");
		advance(built);
		commit(built, order.map((who) => ({ do: "change-life", who, amount: -20, reason: "resolve" })), "resolve");
		const loss = nextDecision(built)!;
		apply(built, loss.options[0]!.id, "engine", "forced");
		assert.equal(built.log.at(-1)!.changes.length, 2);
		assert.deepEqual(built.outcome?.results, { 0: "draw", 1: "draw" });
	}
});

test("cleanup keeps the discard obligation pending until the hand fits", () => {
	const built = table();
	advance(built);
	apply(built, "keep", "model", "chosen");
	apply(built, "keep", "model", "chosen");
	advance(built);
	built.cursor.steps = ["cleanup"];
	commit(built, cardsIn(built, "library", 0).slice(0, 2).map((card) => ({
		do: "move", what: card.id, to: "hand", reason: "draw",
	})), "draw");
	for (const size of [9, 8]) {
		assert.equal(cardsIn(built, "hand", 0).length, size);
		const discard = nextDecision(built)!;
		assert.equal(discard.situation, "turn-based");
		assert.match(discard.question, /^Discard /);
		apply(built, discard.options[0]!.id, "model", "chosen");
	}
	assert.equal(cardsIn(built, "hand", 0).length, 7);
	assert.equal(nextDecision(built), null);
	advance(built);
	assert.equal(built.cursor.active, 1);
});
