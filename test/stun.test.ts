/** A stun counter replaces an untap in every route, including the resource forecast. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { deck } from "../src/core/decks.ts";
import { cardsIn } from "../src/core/table.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { afterUntap } from "../src/core/budget.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { main, place, announce, example, passBoth, step, finish, quiet } from "./play.ts";

test("each attempted untap removes one stun counter instead, and forecasts, receipts and clones agree", () => {
	const table = start(standard, [{ deck: deck("Selesnya Landfall") }, { deck: deck("Mono-Red Aggro") }], "stun-counter");
	const [two, one, open] = place(table, 0, "battlefield", "Forest", "Forest", "Forest");
	const [other] = place(table, 1, "battlefield", "Mountain");
	main(table, 0);
	commit(table, [
		{ do: "tap", what: two!.id }, { do: "counters", what: two!.id, kind: "stun", amount: 2 },
		{ do: "tap", what: one!.id }, { do: "counters", what: one!.id, kind: "stun", amount: 1 },
		{ do: "counters", what: open!.id, kind: "stun", amount: 1 },
		{ do: "tap", what: other!.id }, { do: "counters", what: other!.id, kind: "stun", amount: 1 },
	], "game-setup");
	const frame = workFrame(table, 0), original = structuredClone(frame), forecast = afterUntap(frame);
	const seen = (id: string) => forecast.view.objects!.find(object => object.id === id)!;
	assert.equal(seen(two!.id).tapped, true); assert.equal(seen(two!.id).counters!.stun, 1);
	assert.equal(seen(one!.id).tapped, true); assert.equal(seen(one!.id).counters!.stun, undefined);
	assert.equal(seen(open!.id).tapped, false); assert.equal(seen(open!.id).counters!.stun, 1, "an untapped permanent loses no stun counter");
	assert.equal(seen(other!.id).tapped, true); assert.equal(seen(other!.id).counters!.stun, 1, "the opponent's untap is not forecast here");
	assert.deepEqual(frame, original);
	const initial = structuredClone(table), from = table.ledger.length;
	for (let guard = 0; guard < 1000; guard++) {
		const decision = nextDecision(table);
		if (table.cursor.turn === 3 && decision?.options.some(one => one.id === "untap")) break;
		if (!decision) advance(table); else apply(table, quiet(decision.options).id, "engine", "forced");
	}
	assert.equal(table.cursor.turn, 3);
	const pending = structuredClone(table), pendingAt = table.ledger.length;
	assert.match(nextDecision(table)!.options[0]!.label, /remove one stun counter from each of 2/);
	assert.deepEqual(table, pending, "listing the untap removes no counters");
	apply(table, "untap", "engine", "forced");
	assert.equal(two!.tapped, true); assert.equal(two!.counters.stun, 1);
	assert.equal(one!.tapped, true); assert.equal(one!.counters.stun, undefined);
	assert.equal(open!.counters.stun, 1);
	const receipt = table.log.findLast(one => one.turn === 3 && one.changes.some(change => change.do === "counters" && change.kind === "stun"))!;
	assert.ok(receipt);
	assert.equal(receipt.changes.filter(change => change.do === "untap").length, 0);
	assert.equal(receipt.changes.filter(change => change.do === "counters" && change.kind === "stun").length, 2);
	const partial = structuredClone(table), at = table.ledger.length;
	main(table, 0, 5);
	assert.equal(two!.tapped, true); assert.equal(two!.counters.stun, undefined);
	assert.equal(one!.tapped, false); assert.equal(open!.counters.stun, 1);
	main(table, 0, 7);
	assert.equal(two!.tapped, false);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	assert.deepEqual(relive(pending, table.ledger.slice(pendingAt)), table);
	assert.deepEqual(relive(partial, JSON.parse(JSON.stringify(table.ledger.slice(at)))), table);

	// A resolving card's untap uses the same replacement. The counter is a
	// fixture fact on the searched land, inserted before Passage's last instruction.
	const resolving = start(standard, [{ deck: deck("Selesnya Landfall") }, { deck: deck("Mono-Red Aggro") }], "stun-resolving");
	place(resolving, 0, "battlefield", "Forest", "Forest", "Forest", "Fabled Passage"); main(resolving, 0);
	announce(resolving, example("Crack Fabled Passage for a basic land")); passBoth(resolving);
	step(resolving, label => label.includes("Forest")); step(resolving);
	const land = cardsIn(resolving, "battlefield", 0).find(one => one.card === "Forest" && one.tapped)!;
	assert.ok(land);
	commit(resolving, [{ do: "counters", what: land.id, kind: "stun", amount: 1 }], "game-setup");
	const bound = structuredClone(resolving), beginning = resolving.ledger.length;
	finish(resolving);
	assert.equal(land.tapped, true); assert.equal(land.counters.stun, undefined);
	assert.deepEqual(relive(bound, resolving.ledger.slice(beginning)), resolving);
	commit(resolving, [{ do: "untap", what: land.id }], "resolve");
	assert.equal(land.tapped, false);
	commit(resolving, [{ do: "counters", what: land.id, kind: "stun", amount: 1 }], "game-setup");
	commit(resolving, [{ do: "untap", what: land.id }], "resolve");
	assert.equal(land.counters.stun, 1, "an effect that untaps an already untapped permanent removes nothing");
});
