/** A private library window stays bounded through selection, ordering, replay and cloning. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn } from "../src/core/table.ts";
import { describe, project } from "../src/core/view.ts";
import { viewWorld } from "../src/core/selectors.ts";
import { announce, example, finish, main, passBoth, place, step } from "./play.ts";

test("private inspection exposes only its bounded window and orders it without changing identities", () => {
	for (const random of [false, true]) {
		const table = start(standard, [{ deck: alpha(deck("4c Control")) }, { deck: alpha(deck("Mono-Red Aggro")) }], `private-window-${random}`);
		main(table, 0);
		const spell = random ? "Consult the Star Charts" : "Stock Up", size = random ? 4 : 5;
		place(table, 0, "hand", spell);
		const lands = cardsIn(table, "library", 0).filter((one) => table.printed[one.card!]!.type.includes("Land")).slice(0, 4);
		commit(table, [...lands.map((one) => ({ do: "move" as const, what: one.id, to: "battlefield" as const, reason: "game-setup" as const })),
			{ do: "add-mana", who: 0, colors: ["C", "C", "U", "U"] }], "game-setup");
		const library = structuredClone(cardsIn(table, "library", 0)), window = library.slice(0, size);
		const initial = structuredClone(table), from = table.ledger.length;
		announce(table, example(random ? "Consult the Star Charts with kicker" : "Stock Up from five cards")); passBoth(table);
		assert.match(nextDecision(table)!.options[0]!.label, new RegExp(`Look at ${size} cards`));
		assert.equal(project(table, 0).objects!.filter((one) => one.zone === "library").length, 0);
		step(table, (label) => label.startsWith("Look"));
		const looked = table.log.at(-1)!;
		assert.deepEqual(project(table, 0).objects!.filter((one) => one.zone === "library").map((one) => one.id).sort(), window.map((one) => one.id).sort());
		assert.equal(viewWorld(project(table, 0)).objects.filter((one) => one.zone === "library" && one.owner === 0).length, library.length);
		for (const viewer of [1, "spectator"] as const) {
			const view = project(table, viewer, 0);
			assert.equal(view.objects!.filter((one) => one.zone === "library").length, 0);
			assert.deepEqual(view.resolution!.bound.looked!.objects, []);
			assert.equal(Object.keys(view.resolution!.seen ?? {}).length, viewer === "spectator" ? 0 : 1);
			for (const one of window) assert.ok(!describe(table, looked, viewer).includes(one.card!));
		}
		const selected: string[] = [];
		const choose = () => {
			const decision = nextDecision(table)!;
			assert.ok(decision.options.every((one) => !one.objects?.length || one.objects.every((ref) => window.some((card) => card.id === ref.id))));
			const option = decision.options.find((one) => one.objects?.length)!;
			selected.push(option.objects![0]!.id); apply(table, option.id, "model", "chosen");
		};
		choose();
		assert.deepEqual(project(table, 1).resolution!.picked, []);
		const partial = structuredClone(table), at = table.ledger.length;
		choose();
		step(table, (label) => label.startsWith("Put into hand"));
		assert.ok(selected.every((id) => table.things.get(id)!.zone === "hand"));
		const rest = window.filter((one) => !selected.includes(one.id));
		const ordered: string[] = [], rng = structuredClone(table.rng);
		while (table.resolution) {
			const before = structuredClone(table), decision = nextDecision(table)!;
			assert.deepEqual(table, before, "listing never exposes a random permutation or consumes RNG");
			const pick = decision.options.at(-1)!;
			if (pick.objects?.length) ordered.push(pick.objects[0]!.id);
			apply(table, pick.id, "model", "chosen");
		}
		finish(table);
		const after = cardsIn(table, "library", 0), bottom = after.slice(-rest.length);
		assert.deepEqual(after.map((one) => one.position), after.map((_, at) => at), "one contiguous library order");
		assert.deepEqual(after.slice(0, -rest.length).map((one) => one.id), library.slice(size).map((one) => one.id));
		assert.deepEqual(bottom.map((one) => one.id).sort(), rest.map((one) => one.id).sort());
		for (const one of bottom) assert.equal(one.incarnation, rest.find((was) => was.id === one.id)!.incarnation);
		if (!random) { assert.deepEqual(bottom.map((one) => one.id), ordered); assert.deepEqual(table.rng, rng); }
		else assert.notDeepEqual(table.rng, rng);
		assert.deepEqual(relive(partial, table.ledger.slice(at)), table, "a clone halfway through selection resumes the same private window");
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		commit(table, [{ do: "move", what: window[0]!.id, to: "graveyard", reason: "resolve" }], "resolve");
		assert.ok(!describe(table, looked, 1).includes(window[0]!.card!), "a later reveal cannot expose an earlier private receipt");
	}
	for (const left of [0, 1]) {
		const table = start(standard, [{ deck: alpha(deck("4c Control")) }, { deck: alpha(deck("Mono-Red Aggro")) }], `short-look-${left}`);
		main(table, 0); place(table, 0, "hand", "Stock Up");
		commit(table, [...cardsIn(table, "library", 0).slice(left).map((one) => ({ do: "move" as const, what: one.id, to: "outside" as const, reason: "game-setup" as const })),
			{ do: "add-mana", who: 0, colors: ["C", "C", "U"] }], "game-setup");
		const initial = structuredClone(table), at = table.ledger.length, hand = cardsIn(table, "hand", 0).length;
		announce(table, example("Stock Up from five cards")); passBoth(table); finish(table);
		assert.equal(cardsIn(table, "hand", 0).length, hand - 1 + left);
		assert.equal(table.outcome, null, "looking and choosing from a short library is not a failed draw");
		assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
});
