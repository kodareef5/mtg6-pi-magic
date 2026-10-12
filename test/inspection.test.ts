/** A private library window stays bounded through selection, ordering, replay and cloning. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import { startingIntent } from "../src/context/plan.ts";
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
	for (const left of [0, 1, 2, 8]) for (const last of [false, true]) {
		const table = start(standard, [{ deck: alpha(deck("Izzet Spellementals")) }, { deck: alpha(deck("Azorius Control")) }], `sleight-window-${left}-${last}`);
		main(table, 0); place(table, 0, "hand", "Sleight of Hand");
		commit(table, [...cardsIn(table, "library", 0).slice(left).map(one => ({ do: "move" as const, what: one.id, to: "outside" as const, reason: "game-setup" as const })),
			{ do: "add-mana", who: 0, colors: ["U"] }], "game-setup");
		const initial = structuredClone(table), from = table.ledger.length, hand = cardsIn(table, "hand", 0).length;
		const library = structuredClone(cardsIn(table, "library", 0)), window = library.slice(0, 2);
		announce(table, example("Cast Sleight of Hand")); passBoth(table); step(table);
		const pending = structuredClone(table), at = table.ledger.length, decision = nextDecision(table)!;
		assert.deepEqual(decision.options.flatMap(one => one.objects ?? []).map(one => one.id).sort(),
			window.filter((one, i) => window.findIndex(other => other.card === one.card) === i).map(one => one.id).sort());
		for (const viewer of [1, "spectator"] as const) assert.deepEqual(project(table, viewer).resolution!.bound.looked!.objects, []);
		const pick = last ? decision.options.at(-1)! : decision.options[0]!;
		const chosen = pick.objects?.[0]?.id;
		apply(table, pick.id, "model", "chosen"); finish(table);
		assert.equal(cardsIn(table, "hand", 0).length, hand - 1 + Math.min(1, left));
		if (chosen) assert.equal(table.things.get(chosen)!.zone, "hand");
		assert.deepEqual(cardsIn(table, "library", 0).map(one => one.id), [...library.slice(2), ...window.filter(one => one.id !== chosen)].map(one => one.id));
		assert.equal(table.outcome, null, "inspection and selection do not cause a failed draw");
		assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	}
});

test("private selection cannot expose another hand through a malformed selector or an unearned library order", async () => {
	for (const from of [{ zones: ["hand"] }, { zones: ["hand"], types: ["creature"] }, { zones: ["hand"], name: "Forest" },
		{ zones: ["library"] }, { zones: ["library"], any: [{ owner: "you" }, { types: ["land"] }] }]) {
		const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("4c Control") }], "unseen-choice");
		main(table, 0); place(table, 0, "hand", "Winternight Stories");
		commit(table, [{ do: "add-mana", who: 0, colors: ["C", "C", "U"] }], "game-setup");
		announce(table, { source: { card: "Winternight Stories", zones: ["hand"] }, claim: "Malformed hand selection", basis: table.printed["Winternight Stories"]!.oracle,
			timing: "spell", instructions: [{ do: "choose", who: "you", from, count: 1, as: "chosen" }] });
		passBoth(table);
		const before = structuredClone(table), decision = nextDecision(table)!;
		assert.deepEqual(table, before, "checking visibility grants no knowledge and moves nothing");
		assert.deepEqual(decision.options, []); assert.match(decision.blocked!, /unseen cards/);
		assert.throws(() => apply(table, "pass", "model", "chosen"), /unseen cards/);
		assert.deepEqual(table, before, "no pick or fallback can bypass visibility");
		let asked = 0;
		const player = { name: "Unasked", observe() {}, close() {}, answer: async () => { asked++; throw new Error("must not be asked"); } };
		assert.equal(await play(table, { 0: player, 1: player }, { 0: startingIntent(0), 1: startingIntent(1) }), null);
		assert.equal(asked, 0); assert.equal(table.gaps.length, 1); assert.deepEqual(table.things, before.things);
	}
	for (const chooser of ["you", "opponent"] as const) {
		const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("4c Control") }], "earned-choice");
		main(table, 0); place(table, 0, "hand", "Winternight Stories");
		commit(table, [{ do: "add-mana", who: 0, colors: ["C", "C", "U"] }], "game-setup");
		const hand = cardsIn(table, "hand", 1), initial = structuredClone(table), at = table.ledger.length;
		announce(table, { source: { card: "Winternight Stories", zones: ["hand"] }, claim: "Visibility fixture", basis: table.printed["Winternight Stories"]!.oracle,
			timing: "spell", instructions: [
			...(chooser === "you" ? [{ do: "look" as const, who: "you", every: { zones: ["hand"], controller: "opponent" } }] : []),
			{ do: "choose", who: chooser, from: { zones: ["hand"], controller: "opponent" }, count: 1, as: "chosen" },
			{ do: "move", what: "bound:chosen", to: "graveyard", reason: "discard" },
		] });
		passBoth(table);
		if (chooser === "you") step(table);
		const decision = nextDecision(table)!;
		assert.equal(decision.seat, chooser === "you" ? 0 : 1); assert.equal(decision.blocked, undefined);
		assert.ok(decision.options.some((one) => one.cards?.some((card) => hand.some((one) => one.card === card))));
		assert.ok(!project(table, "spectator").objects!.some((one) => one.zone === "hand"));
		step(table, () => true);
		if (chooser === "opponent") assert.ok(nextDecision(table)!.options.every((one) => !hand.some((card) => one.label.includes(card.card!))), "the controller cannot read the other chooser's private card before it moves");
		finish(table);
		assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
	for (const libraryOf of ["you", "controller:this", "owner:this", "target:0"]) for (const looked of [false, true]) {
		const order = start(standard, [{ deck: deck("4c Control") }, { deck: deck("Mono-Red Aggro") }], `unseen-order-${libraryOf}-${looked}`);
		main(order, 0); place(order, 0, "hand", "Stock Up");
		commit(order, [{ do: "add-mana", who: 0, colors: ["C", "C", "U"] }], "game-setup");
		const initial = structuredClone(order), at = order.ledger.length, owner = libraryOf === "target:0" ? 1 : 0;
		const window = cardsIn(order, "library", owner).slice(0, 2).map(one => one.id);
		announce(order, { ...example("Stock Up from five cards"), ...(libraryOf === "target:0" ? { targets: [{ player: "opponent" }] } : {}),
			instructions: [...(looked ? [{ do: "look" as const, who: "you", what: { top: 2, of: libraryOf } }] : []),
				{ do: "order", who: "you", what: { top: 2, of: libraryOf }, position: "top" }] });
		passBoth(order);
		if (!looked) { assert.match(nextDecision(order)!.blocked!, /unseen library/); assert.deepEqual(nextDecision(order)!.options, []); continue; }
		assert.equal(project(order, 0).objects!.filter(one => one.zone === "library").length, 0);
		step(order);
		assert.deepEqual(project(order, 0).objects!.filter(one => one.zone === "library").map(one => one.id).sort(), [...window].sort());
		for (const viewer of [1, "spectator"] as const) assert.equal(project(order, viewer).objects!.filter(one => one.zone === "library").length, 0);
		const partial = structuredClone(order), after = order.ledger.length;
		while (order.resolution) step(order, () => true);
		finish(order);
		assert.deepEqual(relive(initial, order.ledger.slice(at)), order);
		assert.deepEqual(relive(partial, order.ledger.slice(after)), order);
	}
});

test("a whole-hand reveal becomes public only on resolution, then permits the caster's eligible selection", () => {
	for (const eligible of [false, true]) {
		const table = start(standard, [{ deck: alpha(deck("Dimir Excruciator")) }, { deck: alpha(deck("Mono-Red Aggro")) }], `public-hand-${eligible}`);
		main(table, 0); place(table, 0, "hand", "Duress");
		commit(table, cardsIn(table, "hand", 1).map((one) => ({ do: "move", what: one.id, to: "library", reason: "game-setup" })), "game-setup");
		const targets = place(table, 1, "hand", "Mountain", "Hired Claw", ...(eligible ? ["Burst Lightning"] : []));
		commit(table, [{ do: "add-mana", who: 0, colors: ["B"] }], "game-setup");
		const old = table.log.find((receipt) => receipt.changes.some((change) => change.do === "move" && change.what === targets[0]!.id && change.to === "hand"))!;
		const initial = structuredClone(table), at = table.ledger.length;
		announce(table, example("Cast Duress to reveal an opponent's hand and choose a discard")); passBoth(table);
		const pending = structuredClone(table), before = table.ledger.length, reveal = nextDecision(table)!;
		assert.deepEqual(table, pending, "listing the reveal is pure");
		assert.ok(reveal.options.every((one) => !one.objects?.length && !one.cards?.length));
		assert.ok(targets.every((card) => !JSON.stringify(reveal).includes(card.card!)), "the confirmation names no hidden cards");
		assert.ok(!project(table, 0).objects!.some((one) => one.zone === "hand" && one.owner === 1));
		step(table);
		for (const viewer of [0, 1, "spectator"] as const)
			assert.deepEqual(project(table, viewer).objects!.filter((one) => one.zone === "hand" && one.owner === 1).map((one) => one.card).sort(), targets.map((one) => one.card).sort());
		const shown = structuredClone(table), after = table.ledger.length, choose = nextDecision(table)!;
		assert.equal(choose.seat, 0); assert.equal(choose.blocked, undefined);
		assert.equal(choose.options.length, 1);
		if (eligible) assert.deepEqual(choose.options[0]!.cards, ["Burst Lightning"]);
		else assert.match(choose.options[0]!.id, /:done$/);
		step(table); finish(table);
		assert.equal(targets.at(-1)!.zone, eligible ? "graveyard" : "hand");
		assert.ok(targets.slice(0, 2).every((one) => one.zone === "hand"));
		assert.ok(!describe(table, old, "spectator").includes("Mountain"), "earlier receipts retain their event-time visibility");
		assert.deepEqual(relive(shown, table.ledger.slice(after)), table);
		assert.deepEqual(relive(pending, table.ledger.slice(before)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
});
