/** A source remembers its entry choice and chosen modes, never the success of those modes.
 * Past 150 lines to exercise entry, real casts, counters, simultaneous waiting triggers and new incarnations together. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { beforeEntry } from "../src/core/entry-payments.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn, type Table, type Trigger } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { matches, chosenSelector, tableWorld } from "../src/core/selectors.ts";
import { editWork } from "../src/core/work-tools.ts";
import { checkProcedure, printedCast } from "../src/core/procedures.ts";
import { main, place, announce, passBoth, step, finish, pack, example } from "./play.ts";

const gollum = "Gollum, Riddle Master", siren = "Spyglass Siren", drowner = "Floodpits Drowner";
const ref = (one: { id: string; incarnation: number }) => ({ id: one.id, incarnation: one.incarnation });
const snapshot = (table: Table) => ({ table: structuredClone(table), at: table.ledger.length });
const replay = (table: Table, from: ReturnType<typeof snapshot>) => assert.deepEqual(relive(from.table, table.ledger.slice(from.at)), table);
function choose(table: Table, quality: string) {
	const decision = nextDecision(table)!; assert.equal(decision.situation, "replacement-order");
	assert.deepEqual(decision.options.map(one => one.label), [`Choose odd for ${gollum}`, `Choose even for ${gollum}`]);
	apply(table, decision.options.find(one => one.id.endsWith(`:${quality}`))!.id, "model", "chosen");
	finish(table);
}
function position(quality: "odd" | "even") {
	const table = start(standard, [{ deck: alpha(deck("Mono-Black Aggro")) }, { deck: alpha(deck("Dimir Midrange")) }], `remember-${quality}`);
	main(table, 0);
	editWork(table, 0, [{ do: "package.put", package: { card: gollum, registers: pack(gollum), printedCast: true, assessed: true } }], "prepare-gollum");
	if (!cardsIn(table, "hand", 0).some(one => one.card === gollum)) place(table, 0, "hand", gollum);
	if (!cardsIn(table, "hand", 0).some(one => one.card === "Forsaken Miner")) place(table, 0, "hand", "Forsaken Miner");
	commit(table, [{ do: "add-mana", who: 0, colors: ["B", "B", "B"] }], "game-setup");
	const initial = snapshot(table);
	const cast = announce(table, printedCast(gollum, table.printed[gollum]!));
	const card = table.things.get(cast.activation.source.id)!;
	passBoth(table); step(table);
	assert.ok(table.entry); assert.equal(card.zone, "stack", "entry waits for its mandatory choice");
	const pending = snapshot(table);
	nextDecision(table); assert.deepEqual(table, pending.table, "listing entry options is pure");
	choose(table, quality);
	assert.equal(card.choices?.quality, quality);
	for (const who of [0, 1, "spectator"] as const) assert.equal(project(table, who).objects!.find(one => one.id === card.id)!.choices?.quality, quality);
	replay(table, initial); replay(table, pending);
	announce(table, printedCast("Forsaken Miner", table.printed["Forsaken Miner"]!));
	assert.equal(table.waiting.length, 0, "casting your own spell never triggers Gollum");
	passBoth(table); finish(table); main(table, 1);
	for (const one of cardsIn(table, "library", 1).filter(one => [siren, drowner].includes(one.card!)))
		commit(table, [{ do: "move", what: one.id, to: "hand", reason: "game-setup" }], "game-setup");
	const swamp = place(table, 1, "battlefield", "Swamp")[0]!;
	commit(table, [{ do: "add-mana", who: 1, colors: Array.from({ length: 12 }, () => "U" as const) }], "game-setup");
	return { table, card, swamp };
}
function selectMode(table: Table, mode: number) {
	const decision = nextDecision(table)!; assert.equal(decision.situation, "trigger-order");
	apply(table, decision.options.find(one => one.id.endsWith(`:mode:${mode}`))!.id, "model", "chosen");
}
function waitAgain(table: Table, trigger: Trigger, id: string, controller = trigger.controller) {
	// An extra instance fixture tests ordering and lifetime without claiming a printed multiplier on Gollum.
	commit(table, [{ do: "trigger", action: "wait", trigger: { ...structuredClone(trigger), controller, id } }], "game-setup");
}

test("entry parity and used modes belong to the exact source incarnation and replay at every pending choice", () => {
	for (const quality of ["odd", "even"] as const) for (const countered of [false, true]) {
		const { table, card, swamp } = position(quality), initial = snapshot(table);
		const scope = { world: tableWorld(table), controller: 0, source: card };
		assert.equal(matches(scope, swamp, { manaValue: { parity: "even" } }), true, "zero is even");
		assert.equal(matches(scope, swamp, { manaValue: { parity: "odd" } }), false);
		assert.equal(matches(scope, swamp, { manaValue: { parity: { chosen: "missing" } } }), false);
		const frozen = chosenSelector(scope, { manaValue: { parity: { chosen: "quality" } } });
		assert.equal(frozen.manaValue!.parity, quality, "a produced resource freezes its choice");
		assert.equal(matches({ ...scope, source: { ...card, choices: { quality: "unrelated" } } }, swamp, { manaValue: { parity: { chosen: "quality" } } }), false);
		const matching = quality === "odd" ? siren : drowner, other = quality === "odd" ? drowner : siren;
		announce(table, printedCast(other, table.printed[other]!));
		assert.equal(table.waiting.length, 0, "the other parity does not trigger"); passBoth(table); finish(table);
		const hand = cardsIn(table, "hand", 0).length, life = table.seats.map(one => one.life);
		let remembered: Trigger | undefined;
		for (let mode = 0; mode < 4; mode++) {
			announce(table, printedCast(matching, table.printed[matching]!));
			assert.equal(table.waiting.length, 1);
			remembered ??= structuredClone(table.waiting[0]!);
			const pending = snapshot(table), decision = nextDecision(table)!;
			assert.deepEqual(table, pending.table, "listing remembered modes is pure");
			if (mode === 3) {
				assert.equal(decision.options.length, 1); assert.ok(decision.options[0]!.id.endsWith(":removed"));
				apply(table, decision.options[0]!.id, "engine", "forced");
			} else {
				assert.deepEqual(decision.options.map(one => Number(one.id.split(":mode:")[1])), Array.from({ length: 3 - mode }, (_, i) => i + mode));
				selectMode(table, mode);
				const ability = cardsIn(table, "stack").find(one => one.ability?.trigger)!, chosen = snapshot(table);
				assert.equal(ability.ability!.trigger!.mode, mode);
				if (mode === 0 && countered) {
					// A complete test procedure isolates countering the chosen mode, without claiming Swamp has this ability.
					announce(table, checkProcedure({ source: { zones: ["battlefield"], controller: "self", refs: [ref(swamp)] },
						claim: "Counter chosen trigger fixture", basis: "Remembered mode fixture", timing: "stack", cost: {},
						targets: [{ object: { zones: ["stack"], ability: "triggered" } }], instructions: [{ do: "counter", what: "target:0" }] }));
				}
				passBoth(table); finish(table); replay(table, chosen);
			}
			passBoth(table); finish(table); replay(table, pending);
		}
		assert.equal(card.counters["+1/+1"] ?? 0, countered ? 0 : 1);
		assert.deepEqual(table.seats.map(one => one.life), [life[0]! + 2, life[1]! - 2]);
		assert.equal(cardsIn(table, "hand", 0).length, hand + 1);
		replay(table, initial);
		main(table, 1, 4);
		waitAgain(table, remembered!, "later-controller", 1);
		assert.ok(nextDecision(table)!.options[0]!.id.endsWith(":removed"), "a later turn or trigger controller cannot reuse a mode");
		apply(table, nextDecision(table)!.options[0]!.id, "engine", "forced");
		const old = ref(card);
		commit(table, [{ do: "move", what: card.id, to: "exile", reason: "exile" }], "resolve");
		assert.equal(card.choices, undefined);
		commit(table, beforeEntry(table, [{ do: "move", what: card.id, to: "battlefield", registers: pack(gollum), reason: "resolve" }], "resolve"), "resolve");
		const entry = snapshot(table); choose(table, quality === "odd" ? "even" : "odd"); replay(table, entry);
		assert.notEqual(card.incarnation, old.incarnation);
		waitAgain(table, { ...remembered!, source: ref(card) }, "fresh-incarnation");
		assert.equal(nextDecision(table)!.options.length, 3, "a returned source has fresh modes");
	}

	const { table, card } = position("odd");
	announce(table, printedCast(siren, table.printed[siren]!));
	const trigger = structuredClone(table.waiting[0]!);
	waitAgain(table, trigger, "second-instance"); waitAgain(table, trigger, "third-instance"); waitAgain(table, trigger, "fourth-instance");
	const waiting = snapshot(table);
	for (let mode = 0; mode < 3; mode++) {
		assert.equal(nextDecision(table)!.options.length, (4 - mode) * (3 - mode));
		selectMode(table, mode);
	}
	assert.ok(nextDecision(table)!.options[0]!.id.endsWith(":removed"));
	apply(table, nextDecision(table)!.options[0]!.id, "engine", "forced");
	replay(table, waiting);
	commit(table, [{ do: "move", what: card.id, to: "graveyard", reason: "destroy" }], "resolve");
	const departed = snapshot(table), hand = cardsIn(table, "hand", 0).length, life = table.seats[0]!.life;
	for (let i = 0; i < 3; i++) { passBoth(table); finish(table); }
	assert.equal(cardsIn(table, "hand", 0).length, hand + 1); assert.equal(table.seats[0]!.life, life + 2);
	assert.equal(card.counters["+1/+1"] ?? 0, 0, "the counter mode cannot affect a later graveyard incarnation");
	replay(table, departed);

	for (const quality of ["odd", "even"] as const) for (const x of [0, 1]) {
		const { table } = position(quality);
		const wan = "Wan Shi Tong, Librarian";
		if (!cardsIn(table, "hand", 1).some(one => one.card === wan)) place(table, 1, "hand", wan);
		const initial = snapshot(table);
		announce(table, example("Cast Wan Shi Tong with X"), one => one.activation.x === x);
		assert.equal(table.waiting.length, quality === (x === 0 ? "even" : "odd") ? 1 : 0, "stack mana value includes X");
		replay(table, initial);
	}
});
