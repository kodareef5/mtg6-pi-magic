/** Searching preserves private knowledge, matching names and the origin count after a group moves. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn } from "../src/core/table.ts";
import { describe, project } from "../src/core/view.ts";
import { matches, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { check, ProcedureSchema } from "../src/core/language.ts";
import { announce, example, finish, main, passBoth, place, step } from "./play.ts";

test("a named-card search exposes only the searcher's window and counts hand departures in the same group", () => {
	for (const mode of ["some", "none", "empty"] as const) {
		const table = start(standard, [{ deck: alpha(deck("4c Control")) }, { deck: alpha(deck("Mono-Red Aggro")) }], `named-search-${mode}`);
		main(table, 0);
		place(table, 0, "hand", "Deadly Cover-Up");
		const [payment] = place(table, 0, "graveyard", "Jeskai Revelation");
		const [named, hand, library] = [...table.things.values()].filter((one) => one.owner === 1 && one.card === "Hired Claw");
		assert.ok(named && hand && library);
		commit(table, [...cardsIn(table, "graveyard", 1).map((one) => ({ do: "move" as const, what: one.id, to: "library" as const, reason: "game-setup" as const })),
			{ do: "move", what: named.id, to: mode === "empty" ? "library" : "battlefield", reason: "game-setup" },
			{ do: "move", what: hand.id, to: "hand", reason: "game-setup" },
			{ do: "move", what: library.id, to: "library", reason: "game-setup" },
			{ do: "add-mana", who: 0, colors: ["B", "B", "C", "C", "C"] }], "game-setup");
		const before = structuredClone(table), from = table.ledger.length;
		const procedure = example("Deadly Cover-Up with evidence and a private name search");
		check(ProcedureSchema, procedure, "search");
		assert.throws(() => check(ProcedureSchema, { ...procedure, instructions: [{ do: "move", what: "this", to: "exile", reason: "exile", countFrom: "hand" }] }, "missing binding"));
		announce(table, procedure);
		apply(table, `payment:pick:${payment!.id}`, "model", "chosen");
		apply(table, "payment:done", "model", "chosen"); passBoth(table);
		step(table); // Destroy all creatures, before choosing the named card.
		if (mode === "empty") {
			const count = table.log.length;
			finish(table);
			assert.ok(!table.log.slice(count).flatMap((one) => one.changes).some((one) => one.do === "look" || one.do === "shuffle" || one.do === "move" && one.reason === "draw"));
			assert.deepEqual(relive(before, table.ledger.slice(from)), table);
			continue;
		}
		assert.equal(named.zone, "graveyard");
		step(table, (label) => label.includes("Hired Claw")); step(table); // Exile the chosen card.
		assert.equal(named.zone, "exile");
		assert.ok(!project(table, 0).objects!.some((one) => one.id === hand.id));
		step(table); // Search all of the owner's hand and library, not just matching cards.
		const looked = table.log.at(-1)!;
		for (const one of [...cardsIn(table, "hand", 1), ...cardsIn(table, "library", 1)])
			assert.ok(project(table, 0).objects!.some((seen) => seen.id === one.id), "the whole search window is privately known");
		assert.ok(!project(table, "spectator").objects!.some((one) => one.id === hand.id || one.id === library.id));
		assert.ok(!describe(table, looked, "spectator").includes("Hired Claw"));
		const scope = { world: viewWorld(project(table, 0)), controller: 0, bound: table.resolution!.bound };
		assert.ok(matches(scope, scope.world.objects.find((one) => one.id === hand.id)!, { zones: ["hand"], nameOf: "bound:named" }));
		assert.ok(!matches({ ...scope, world: viewWorld(project(table, "spectator")) }, { ...hand, card: undefined, faceDown: true }, { zones: ["hand"], nameOf: "bound:named" }));
		if (mode === "some") step(table, (label) => label === "Choose Hired Claw (hand)");
		const clone = structuredClone(table), at = table.ledger.length;
		if (mode === "some") step(table, (label) => label === "Choose Hired Claw (library)");
		if (nextDecision(table)!.options.some((one) => /Stop here|Decline:/.test(one.label))) step(table, (label) => /Stop here|Decline:/.test(label));
		const handSize = cardsIn(table, "hand", 1).length;
		step(table); // All found cards leave together; only hand cards contribute to the amount.
		const moved = table.log.at(-1)!.changes.filter((one) => one.do === "move" && one.to === "exile");
		assert.equal(moved.length, mode === "some" ? 2 : 0);
		assert.equal(table.resolution!.bound.exiled!.amount, mode === "some" ? 1 : 0);
		step(table); // Shuffle, revoking the library lookup.
		assert.equal(project(table, 0).objects!.filter((one) => one.zone === "library" && one.owner === 1).length, 0);
		step(table); finish(table);
		assert.equal(cardsIn(table, "hand", 1).length, handSize, "draw replaces only the exiled hand card");
		assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
		assert.deepEqual(relive(before, table.ledger.slice(from)), table);
		assert.ok(!describe(table, looked, "spectator").includes("Hired Claw"), "later public exile cannot rewrite a private receipt");
	}
	// Multi-name objects match when they share any name (201.2a); missing references match nothing.
	const table = start(standard, [{ deck: deck("4c Control") }, { deck: deck("Dimir Midrange") }], "search-room-name");
	const [room] = place(table, 0, "graveyard", "Unholy Annex // Ritual Chamber");
	const scope = { world: tableWorld(table), controller: 1, bound: { named: { objects: [{ id: room!.id, incarnation: room!.incarnation }], players: [] } } };
	assert.ok(matches(scope, room!, { zones: ["graveyard"], nameOf: "bound:named" }));
	assert.ok(!matches(scope, room!, { zones: ["graveyard"], nameOf: "bound:missing" }));
});
