/** A resolution ordinal belongs to the completed ability, not its trigger or controller. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { editWork } from "../src/core/work-tools.ts";
import { printedCast } from "../src/core/procedures.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { amount, happened, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import type { Procedure, Registration } from "../src/core/language.ts";
import { announce, establish, finish, main, pack, passBoth, place, step } from "./play.ts";

test("completed ability resolutions keep one ordinal through their program, reset by turn and incarnation, and replay", () => {
	const card = "Belladonna Took", registers = pack(card), watch = registers[0]!;
	assert.equal(watch.kind, "watch"); if (watch.kind !== "watch") assert.fail();
	const setup = () => start(standard, [{ deck: alpha(deck("Boros Tokens")) }, { deck: deck("Mono-Green Landfall") }], "counted-resolutions");
	const hop: Procedure = { claim: "Hop to It", basis: "Create three 1/1 white Rabbit creature tokens.", source: { card: "Hop to It", zones: ["hand"] },
		timing: "spell", cost: { mana: "{2}{W}" }, instructions: [{ do: "token", count: 3,
			spec: { name: "Rabbit", types: ["creature"], subtypes: ["Rabbit"], colors: ["W"], power: 1, toughness: 1 } }] };
	const putAll = (table: Table) => {
		while (table.waiting.length) {
			const before = structuredClone(table), decision = nextDecision(table)!;
			assert.equal(decision.situation, "trigger-order"); assert.deepEqual(table, before);
			apply(table, decision.options[0]!.id, "model", "chosen");
		}
	};
	const completed = (table: Table) => happened(table).filter(one => one.kind === "resolved");
	const table = setup(), [belladonna] = place(table, 0, "hand", card);
	place(table, 0, "hand", "Hop to It", "Hop to It");
	editWork(table, 0, [{ do: "package.put", package: { card, printedCast: true, registers } }], "prepare-belladonna");
	main(table, 0); commit(table, [{ do: "add-mana", who: 0, colors: Array(8).fill("W") }], "game-setup");
	const initial = structuredClone(table), from = table.ledger.length;
	announce(table, printedCast(card, table.printed[card]!)); passBoth(table); finish(table);
	announce(table, hop); passBoth(table); finish(table);
	assert.equal(table.waiting.length, 3); putAll(table);
	assert.equal(completed(table).length, 0, "putting all three abilities on the stack completes none");
	const hand = cardsIn(table, "hand", 0).length, life = table.seats[0]!.life;
	passBoth(table); step(table); // First instruction gains life; the ability is still resolving.
	assert.equal(table.seats[0]!.life, life + 1); assert.equal(completed(table).length, 0);
	const middle = structuredClone(table), at = table.ledger.length;
	finish(table); assert.equal(cardsIn(table, "hand", 0).length, hand, "the second instruction does not advance to resolution two");
	assert.equal(completed(table).length, 1);
	passBoth(table); finish(table); assert.equal(cardsIn(table, "hand", 0).length, hand + 1);
	passBoth(table); finish(table); assert.equal(belladonna!.counters["+1/+1"], 1);
	assert.ok(cardsIn(table, "battlefield", 0).filter(one => one.token).every(one => one.counters["+1/+1"] === 1));
	announce(table, hop); passBoth(table); finish(table); putAll(table);
	const afterHopHand = cardsIn(table, "hand", 0).length;
	for (let i = 0; i < 3; i++) { passBoth(table); finish(table); }
	assert.equal(completed(table).length, 6, "resolutions with every condition false still complete");
	assert.equal(table.seats[0]!.life, life + 1); assert.equal(cardsIn(table, "hand", 0).length, afterHopHand);
	assert.equal(belladonna!.counters["+1/+1"], 1);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	assert.deepEqual(relive(middle, table.ledger.slice(at)), table, "cloning between instructions preserves the current ordinal");
	const identity = { source: { id: belladonna!.id, incarnation: belladonna!.incarnation }, basis: watch.basis };
	const read = (controller: number, resolving = identity) => amount({ world: viewWorld(project(table, controller)), controller, resolving }, { resolution: true });
	assert.equal(read(0), 7); assert.equal(read(1), 7, "controller changes do not give the same ability a new count");
	assert.equal(read(0, { ...identity, source: { ...identity.source, incarnation: identity.source.incarnation + 1 } }), 1);
	assert.equal(read(0, { ...identity, basis: "Another ability" }), 1);
	assert.equal(read(0, { ...identity, source: { ...identity.source, id: "another-source" } }), 1);
	assert.equal(amount({ world: tableWorld(table), controller: 0 }, { resolution: true }), 0, "outside resolution there is no ordinal");
	main(table, 1, 2); assert.equal(read(0), 1, "each turn starts its own history");

	// Isolated resolution positions exercise the abort paths. They are mechanics
	// variants of the watch, not additional claimed interpretations of Belladonna.
	const pending = (registration: Registration = watch) => {
		const table = setup(), source = establish(table, 0, card, [registration]);
		const [target] = place(table, 1, "battlefield", "Forest"); main(table, 0);
		commit(table, [{ do: "token", id: "rabbit", controller: 0, spec: { name: "Rabbit", types: ["creature"], colors: ["W"], power: 1, toughness: 1 } }], "resolve");
		putAll(table); return { table, source, target: target! };
	};
	const countered = pending();
	commit(countered.table, [{ do: "cease", what: cardsIn(countered.table, "stack")[0]!.id }], "counter");
	assert.equal(completed(countered.table).length, 0);
	const declined = pending({ ...watch, may: true }); passBoth(declined.table); step(declined.table, label => label.startsWith("Decline"));
	assert.equal(completed(declined.table).length, 1, "declining an optional ability still resolves it");
	const intervening = pending({ ...watch, if: { amount: { life: "you" }, atLeast: 20 } });
	commit(intervening.table, [{ do: "change-life", who: 0, amount: -1, reason: "resolve" }], "resolve");
	passBoth(intervening.table); finish(intervening.table); assert.equal(completed(intervening.table).length, 0);
	const illegal = pending({ ...watch, effect: { ...watch.effect, targets: [{ object: { types: ["land"], controller: "opponent" } }] } });
	commit(illegal.table, [{ do: "move", what: illegal.target.id, to: "graveyard", reason: "destroy" }], "destroy");
	passBoth(illegal.table); finish(illegal.table); assert.equal(completed(illegal.table).length, 0);
	const departed = pending(), incarnation = departed.source.incarnation;
	commit(departed.table, [{ do: "move", what: departed.source.id, to: "graveyard", reason: "destroy" }], "destroy");
	passBoth(departed.table); finish(departed.table);
	assert.equal(completed(departed.table)[0]!.source.incarnation, incarnation, "a departed source keeps the original ability's identity");
});
