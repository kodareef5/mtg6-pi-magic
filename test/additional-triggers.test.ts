/** Additional instances preserve independent choices, source timing and once-only restrictions. */
import assert from "node:assert/strict";
import test from "node:test";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { relive } from "../src/core/journal.ts";
import type { Registration, Procedure } from "../src/core/language.ts";
import { announce, finish, main, pack, passBoth, place } from "./play.ts";

const staff = "Wizard's Staff", bird = "Slickshot Show-Off";
const build = (seed: string) => start(standard, [{ deck: alpha(deck("Izzet Prowess")) }, { deck: alpha(deck("Selesnya Landfall")) }], seed);
const ref = (one: { id: string; incarnation: number }) => ({ id: one.id, incarnation: one.incarnation });

test("additional trigger instances add once, keep independent choices and exclude delayed and reflexive abilities", () => {
	for (const count of [0, 1, 2]) {
		const game = build(`additional-${count}`);
		const [creature, ...equipment] = place(game, 0, "hand", bird, ...Array(count).fill(staff));
		place(game, 0, "hand", "Burst Lightning"); main(game, 0);
		const basis = game.printed[bird]!.oracle.split("\n")[1]!;
		const watch: Registration = { kind: "watch", basis, event: { on: "cast", by: "you", of: { zones: ["stack"], not: { types: ["creature"] } } },
			effect: { instructions: [{ do: "modify", what: "this", until: "end-of-turn", change: { power: 2 } }] } };
		commit(game, [{ do: "move", what: creature!.id, to: "battlefield", reason: "game-setup", registers: [watch] },
			...equipment.map(one => ({ do: "move" as const, what: one.id, to: "battlefield" as const, controller: 1, reason: "game-setup" as const, registers: pack(staff) }))], "game-setup");
		commit(game, equipment.map(one => ({ do: "attach", what: one.id, to: ref(creature!) })), "game-setup");
		const cast: Procedure = { claim: "Cast Burst Lightning", basis: game.printed["Burst Lightning"]!.oracle.split("\n").at(-1)!,
			source: { card: "Burst Lightning", zones: ["hand"], controller: "self" }, timing: "spell", targets: [{ player: "opponent" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] };
		commit(game, [{ do: "add-mana", who: 0, colors: ["R"] }], "game-setup");
		const initial = structuredClone(game), from = game.ledger.length;
		announce(game, cast);
		assert.equal(game.waiting.length, (count + 1) ** 2, "each granted prowess is an ability; two Staffs add two instances to each ability");
		assert.ok(game.waiting.every(one => one.controller === 0 && one.source?.id === creature!.id), "the granted trigger belongs to the equipped creature's controller");
		assert.equal(new Set(game.waiting.map(one => one.id)).size, game.waiting.length);
		const waiting = structuredClone(game), at = game.ledger.length;
		assert.deepEqual(nextDecision(game), nextDecision(game)); assert.deepEqual(game, waiting);
		while (game.waiting.length) apply(game, nextDecision(game)!.options[0]!.id, "model", "chosen");
		while (cardsIn(game, "stack").length > 1) { passBoth(game); finish(game); }
		assert.equal(characteristics(game, creature!)!.power, 1 + (count + 2) * (count + 1));
		passBoth(game); finish(game);
		assert.deepEqual(relive(waiting, game.ledger.slice(at)), game);
		assert.deepEqual(relive(initial, game.ledger.slice(from)), game);
	}

	// Authored watches isolate restrictions and child triggers without claiming these are Slickshot's text.
	for (const kind of ["once", "reflect", "targets", "leaves"] as const) {
		const game = build(`additional-${kind}`), [creature, equipment] = place(game, 0, "hand", bird, staff);
		const [first, second] = place(game, 1, "battlefield", "Llanowar Elves", "Llanowar Elves");
		main(game, 0);
		const watch: Registration = { kind: "watch", basis: `Authored ${kind} trigger fixture`,
			event: kind === "leaves" ? { on: "dies", of: { is: "this" } } : { on: "enters", of: { types: ["land"], controller: "you" } },
			...(kind === "once" ? { limit: "once-per-turn" as const } : {}),
			effect: kind === "reflect" ? { instructions: [{ do: "reflect", effect: { instructions: [{ do: "life", who: "you", amount: 1 }] } }] } :
				kind === "targets" ? { targets: [{ object: { types: ["creature"], controller: "opponent" } }], instructions: [{ do: "damage", to: "target:0", amount: 1 }] } : { instructions: [] } };
		commit(game, [{ do: "move", what: creature!.id, to: "battlefield", reason: "game-setup", registers: [watch] },
			{ do: "move", what: equipment!.id, to: "battlefield", reason: "game-setup", registers: pack(staff) }], "game-setup");
		commit(game, [{ do: "attach", what: equipment!.id, to: ref(creature!) },
			{ do: "note", note: { kind: "delay", by: 0, until: "end-of-turn", once: true, event: watch.event,
				effect: { instructions: [] }, fixed: { source: ref(creature!), targets: [], bound: {} } } }], "game-setup");
		if (kind === "leaves") commit(game, [creature!, equipment!].map(one => ({ do: "move", what: one.id, to: "graveyard", reason: "destroy" })), "destroy");
		else { const [land] = place(game, 0, "hand", "Island"); commit(game, [{ do: "move", what: land!.id, to: "battlefield", reason: "play-land" }], "play-land"); }
		assert.equal(game.waiting.filter(one => one.basis.startsWith("Delayed:")).length, 1, "delayed trigger is not an ability the creature has");
		assert.equal(game.waiting.filter(one => one.basis === watch.basis).length, kind === "once" ? 1 : 2, "departure reads Staff before the simultaneous group");
		const initial = structuredClone(game), at = game.ledger.length;
		if (kind === "targets") {
			for (const target of [first!, second!]) {
				const choice = nextDecision(game)!.options.find(one => one.trigger?.text === watch.basis && one.trigger.targets.some(one => "id" in one && one.id === target.id))!;
				assert.ok(choice); apply(game, choice.id, "model", "chosen");
			}
		}
		while (game.waiting.length) apply(game, nextDecision(game)!.options[0]!.id, "model", "chosen");
		let reflexive = 0;
		while (cardsIn(game, "stack").length) {
			passBoth(game); finish(game);
			if (game.waiting.length) {
				assert.equal(game.waiting.length, 1, "each reflection creates one new ability, without a Staff addition"); reflexive++;
				apply(game, nextDecision(game)!.options[0]!.id, "model", "chosen");
			}
		}
		if (kind === "reflect") assert.equal(reflexive, 2);
		if (kind === "targets") assert.ok([first!, second!].every(one => one.zone === "graveyard"));
		assert.deepEqual(relive(initial, game.ledger.slice(at)), game);
	}

	// Creature Saga chapters are abilities of that permanent too.
	const game = build("additional-chapters"), [equipment] = place(game, 0, "hand", staff);
	const [saga] = place(game, 1, "hand", "Esper Origins // Summon: Esper Maduin"); main(game, 0);
	const chapter: Registration = { kind: "chapter", face: 1, basis: "II — Add {G}{G}.", numbers: [2], effect: { instructions: [{ do: "mana", who: "you", colors: ["G", "G"] }] } };
	commit(game, [{ do: "move", what: equipment!.id, to: "battlefield", reason: "game-setup", registers: pack(staff) },
		{ do: "move", what: saga!.id, to: "battlefield", face: 1, reason: "game-setup", registers: [chapter] }], "game-setup");
	commit(game, [{ do: "attach", what: equipment!.id, to: ref(saga!) }, { do: "counters", what: saga!.id, kind: "lore", amount: 1 }], "resolve");
	assert.deepEqual(game.waiting.map(one => one.chapter), [2, 2]);
	const initial = structuredClone(game), at = game.ledger.length;
	while (game.waiting.length) apply(game, nextDecision(game)!.options[0]!.id, "model", "chosen");
	passBoth(game); finish(game); assert.equal(saga!.zone, "battlefield", "one remaining chapter still prevents sacrifice");
	passBoth(game); finish(game); assert.equal(saga!.zone, "graveyard");
	assert.equal(game.seats[1]!.pool.length, 4);
	assert.deepEqual(relive(initial, game.ledger.slice(at)), game);
});
