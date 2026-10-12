/** Counter events retain their crossing even if later changes remove counters. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { editWork } from "../src/core/work-tools.ts";
import { printedCast } from "../src/core/procedures.ts";
import { cardsIn } from "../src/core/table.ts";
import type { Change } from "../src/core/syntax.ts";
import type { Registration } from "../src/core/language.ts";
import { announce, establish, finish, main, pack, passBoth, place, step } from "./play.ts";

test("counter watches distinguish each placement and a threshold, including entry, and replay the resulting ability", () => {
	const card = "Political Triumph", registers = pack(card), threshold = registers[1]!;
	assert.equal(threshold.kind, "watch"); if (threshold.kind !== "watch") assert.fail();
	const setup = () => start(standard, [{ deck: alpha(deck("Boros Tokens")) }, { deck: deck("Mono-Green Landfall") }], "fourth-counter");
	const position = (count: number, watch: Registration = threshold) => {
		const table = setup(), source = establish(table, 0, card, [watch]);
		commit(table, [{ do: "counters", what: source.id, kind: "plan", amount: count }], "game-setup");
		return { table, source };
	};
	for (const [before, changes, expected] of [
		[0, [1], 0], [3, [1], 1], [2, [3], 1], [4, [1], 0], [5, [-2], 0], [3, [0], 0],
		[3, [2, -2], 1], [2, [1, 1], 1], [2, [-5, 4], 1], [3, [1, -1, 1], 2],
	] as const) {
		const { table, source } = position(before);
		commit(table, changes.map(amount => ({ do: "counters", what: source.id, kind: "plan", amount })), "resolve");
		assert.equal(table.waiting.length, expected, `${before} then ${changes}`);
	}
	for (const wrong of ["kind", "recipient", "zone"] as const) {
		const { table, source } = position(3);
		const other = establish(table, 0, card, []);
		if (wrong === "zone") commit(table, [{ do: "move", what: source.id, to: "graveyard", reason: "game-setup" }], "game-setup");
		commit(table, [{ do: "counters", what: wrong === "recipient" ? other.id : source.id, kind: wrong === "kind" ? "quest" : "plan", amount: 4 }], "resolve");
		assert.equal(table.waiting.length, 0);
	}
	for (const count of [3, 4, 5]) {
		const table = setup(), [source] = place(table, 0, "hand", card);
		commit(table, [{ do: "move", what: source!.id, to: "battlefield", reason: "resolve", counters: { plan: count }, registers }], "resolve");
		assert.equal(table.waiting.length, count >= 4 ? 1 : 0, "entry counters count from zero");
	}
	for (const batch of [false, true]) {
		const watch = { ...threshold, event: { on: "counters" as const, counter: "plan", of: { is: "this" }, ...(batch ? { batch: true as const } : {}) } };
		const { table, source } = position(0, watch);
		commit(table, [{ do: "counters", what: source.id, kind: "plan", amount: 3 }, { do: "counters", what: source.id, kind: "plan", amount: 2 }], "resolve");
		assert.equal(table.waiting.length, batch ? 1 : 5);
		assert.ok(table.waiting.every(one => one.event.amount === (batch ? 5 : 1)));
	}
	// A token's counters come from its actual entry terms, not its count after later changes.
	const { table: tokenTable, source: watcher } = position(0, { ...threshold, event: { on: "counters", counter: "loyalty", reaches: 4 } });
	commit(tokenTable, [{ do: "token", id: "entering-jace", controller: 0,
		spec: { name: "Jace", types: ["planeswalker"], subtypes: ["Jace"], colors: ["U"], loyalty: 4 } },
		{ do: "counters", what: "entering-jace", kind: "loyalty", amount: -1 }], "resolve");
	assert.equal(tokenTable.waiting.length, 1); assert.equal(tokenTable.waiting[0]!.source?.id, watcher.id);
	assert.equal(tokenTable.things.get("entering-jace")!.counters.loyalty, 3);

	const table = setup();
	const [triumph] = place(table, 0, "hand", card), creatures = place(table, 0, "hand", ...Array(4).fill("Voice of Victory"));
	for (const name of [card, "Voice of Victory"]) editWork(table, 0, [{ do: "package.put", package: { card: name, printedCast: true, registers: pack(name) } }], `prepare-${name}`);
	main(table, 0);
	commit(table, [{ do: "add-mana", who: 0, colors: Array(9).fill("W") }], "game-setup");
	const initial = structuredClone(table), from = table.ledger.length;
	announce(table, printedCast(card, table.printed[card]!)); passBoth(table); finish(table);
	const putTrigger = () => {
		const before = structuredClone(table), decision = nextDecision(table)!;
		assert.equal(decision.situation, "trigger-order"); assert.equal(decision.options.length, 1); assert.deepEqual(table, before);
		apply(table, decision.options[0]!.id, "model", "chosen");
	};
	for (let count = 1; count <= 4; count++) {
		announce(table, printedCast("Voice of Victory", table.printed["Voice of Victory"]!)); passBoth(table); finish(table);
		putTrigger(); passBoth(table); step(table); // Look privately, then keep the top card.
		step(table, label => label.startsWith("Decline"));
		assert.equal(triumph!.counters.plan ?? 0, count - 1, "scry precedes the counter");
		finish(table); assert.equal(triumph!.counters.plan, count);
		assert.equal(table.waiting.length, count === 4 ? 1 : 0);
	}
	const pending = structuredClone(table), at = table.ledger.length, hand = cardsIn(table, "hand", 0).length;
	putTrigger(); passBoth(table); finish(table);
	assert.equal(triumph!.zone, "graveyard"); assert.equal(cardsIn(table, "hand", 0).length, hand + 1);
	assert.ok(creatures.every(one => one.counters["+1/+1"] === 1));
	const resolved = table.log.flatMap(one => one.changes).filter((one): one is Extract<Change, { do: "move" }> => one.do === "move");
	assert.ok(resolved.findIndex(one => one.what === triumph!.id && one.reason === "sacrifice") < resolved.findLastIndex(one => one.reason === "draw"));
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	assert.deepEqual(relive(pending, table.ledger.slice(at)), table, "a clone with the fourth-counter trigger pending continues identically");
});
