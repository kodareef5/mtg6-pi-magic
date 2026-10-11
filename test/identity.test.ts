/** A card becomes a new object only when its zone changes, never merely when its position changes. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { announce, establish, example, finish, main, passBoth, place, step } from "./play.ts";

test("same-zone motion preserves identity, bindings and state while actual zone changes replace identity", () => {
	for (const legacyMove of [false, true]) {
		const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("Mono-Green Landfall") }], `scry-identity-${legacyMove}`);
		main(table, 0); place(table, 0, "hand", "Opt");
		commit(table, [{ do: "add-mana", who: 0, colors: ["U"] }], "game-setup");
		const initial = structuredClone(table), from = table.ledger.length;
		const [top, second] = cardsIn(table, "library", 0), incarnation = top!.incarnation;
		const spell = example("Opt with a private scry");
		if (legacyMove) spell.instructions[1] = { do: "move", what: { top: 1, of: "you" }, to: "library", position: "bottom", reason: "resolve", may: true, as: "bottomed", countFrom: "library" };
		announce(table, spell); passBoth(table); step(table); // The private look.
		const inspected = structuredClone(table), at = table.ledger.length;
		step(table, (label) => label.startsWith("Place"));
		assert.equal(top!.incarnation, incarnation);
		assert.deepEqual(table.resolution!.bound.looked!.objects, [{ id: top!.id, incarnation }]);
		if (legacyMove) assert.deepEqual(table.resolution!.bound.bottomed, { objects: [{ id: top!.id, incarnation }], players: [], amount: 1 });
		assert.equal(cardsIn(table, "library", 0).at(-1)!.id, top!.id);
		assert.deepEqual(cardsIn(table, "library", 0).map((one) => one.position), cardsIn(table, "library", 0).map((_, at) => at));
		assert.ok(project(table, 0).objects!.some((one) => one.id === top!.id));
		assert.ok(!project(table, 1).objects!.some((one) => one.id === top!.id));
		finish(table); assert.equal(second!.zone, "hand");
		assert.deepEqual(relive(inspected, table.ledger.slice(at)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		const before = top!.incarnation;
		commit(table, [{ do: "move", what: top!.id, to: "library", position: "top", reason: "resolve" }], "resolve");
		assert.equal(top!.incarnation, before); assert.equal(cardsIn(table, "library", 0)[0]!.id, top!.id);
		commit(table, [{ do: "move", what: second!.id, to: "library", position: "bottom", reason: "resolve" }], "resolve");
		assert.equal(second!.incarnation, 2, "the draw and return each crossed a zone");
		assert.deepEqual(cardsIn(table, "library", 0).map((one) => one.position), cardsIn(table, "library", 0).map((_, at) => at));
		const bird = establish(table, 1, "Sazh's Chocobo", [{ kind: "watch", basis: "Landfall — Whenever a land you control enters, put a +1/+1 counter on this creature.",
			event: { on: "enters", of: { types: ["land"], controller: "you" } }, effect: { instructions: [{ do: "counters", on: "this", kind: "+1/+1", amount: 1 }] } }]);
		const [land] = place(table, 1, "battlefield", "Forest");
		commit(table, [{ do: "tap", what: land!.id }, { do: "counters", what: land!.id, kind: "+1/+1", amount: 2 }], "game-setup");
		const physical = structuredClone(land), waiting = structuredClone(table.waiting);
		commit(table, [{ do: "move", what: land!.id, to: "battlefield", reason: "resolve" }], "resolve");
		assert.deepEqual(land, physical, "same-zone motion cannot reset counters, tap state or entry time");
		assert.deepEqual(table.waiting, waiting, "it is not a new landfall event");
		assert.equal(bird.zone, "battlefield");
	}
});
