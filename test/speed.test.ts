/** Speed is a player fact; its single source-less trigger follows the ordinary stack and checkpoint rules. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { amount, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { relive } from "../src/core/journal.ts";
import { instructionStep } from "../src/core/instructions.ts";
import { activatedUses } from "../src/core/activated.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { startingSpeed } from "../src/core/speed.ts";
import { describe, project } from "../src/core/view.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { registrationProblems } from "../src/context/strategy.ts";
import { announce, establish, finish, main, offered, pack, passBoth, step } from "./play.ts";

const card = "Perilous Snare", registers = pack(card);
function position() {
	const table = start(standard, [{ deck: alpha(deck("Jeskai Artifacts")) }, { deck: alpha(deck("Mono-Red Aggro")) }], "player-speed");
	// Isolate the static abilities; linked entry exile has its own invariant.
	const engines = [0, 1].map(() => establish(table, 0, card, registers.filter(one => one.kind === "continuous")));
	establish(table, 0, "Unidentified Hovership", []);
	establish(table, 1, "Hired Claw", []);
	return { table, engines };
}
const lost = (table: Table, who = 1) => commit(table, [{ do: "change-life", who, amount: -1, reason: "cost-payment" }], "cost-payment");
const put = (table: Table) => {
	const before = structuredClone(table), pending = nextDecision(table)!;
	assert.equal(pending.situation, "trigger-order"); assert.equal(pending.options.length, 1);
	assert.deepEqual(pending.options[0]!.objects, [], "the inherent trigger names no invented permanent");
	assert.match(pending.options[0]!.shows!, /no source/); assert.deepEqual(table, before);
	apply(table, pending.options[0]!.id, "engine", "forced");
	assert.equal(cardsIn(table, "stack")[0]!.ability!.source, undefined);
};

test("speed starts at a state check and persists through departure, a countered trigger, max speed and replay", () => {
	assert.deepEqual(registrationProblems([{ card, registers }]), [], "a static grant carries a complete paid ability");
	const { table, engines } = position();
	assert.equal(table.seats[0]!.speed, undefined);
	assert.equal(amount({ world: tableWorld(table), controller: 0 }, { speed: "you" }), 0);
	assert.equal(startingSpeed(table).length, 1, "two engines start their controller only once");
	const beforeStart = structuredClone(table), fromStart = table.ledger.length;
	main(table, 0);
	assert.equal(table.seats[0]!.speed, 1); assert.equal(table.seats[1]!.speed, undefined);
	assert.equal(table.ledger.filter(row => row.situation === "state-based").length, 1);
	assert.ok(table.ledger.filter(row => row.situation === "state-based").every(row => row.why === "forced"));
	assert.deepEqual(relive(beforeStart, table.ledger.slice(fromStart)), table);
	assert.equal(activatedUses(workFrame(table, 0)).length, 0, "max speed has granted no activated ability yet");
	const masked = position();
	for (const object of masked.engines) commit(masked.table, [{ do: "note", note: { kind: "label", by: 0, until: "indefinite", text: "Remove the engine ability", on: { id: object.id, incarnation: object.incarnation }, change: { loseAbilities: true } } }], "game-setup");
	main(masked.table, 0); assert.equal(masked.table.seats[0]!.speed, undefined, "the state check reads current abilities");
	lost(table, 0); assert.equal(table.waiting.length, 0, "your own life payment does not trigger speed");
	const source = cardsIn(table, "battlefield", 1)[0]!;
	commit(table, [{ do: "note", note: { kind: "damage-rule", mode: "prevent", by: 0, until: "end-of-turn" } }], "resolve");
	const speed = table.seats[0]!.speed;
	commit(table, [{ do: "damage", source: source.id, target: { player: 1 }, amount: 2 }], "resolve");
	assert.equal(table.waiting.length, 0); assert.equal(table.seats[0]!.speed, speed);

	// A fresh turn isolates simultaneous loss/gain and a source-independent trigger.
	main(table, 0, 3);
	commit(table, engines.map(object => ({ do: "move" as const, what: object.id, to: "graveyard" as const, reason: "destroy" as const })), "destroy");
	assert.equal(table.seats[0]!.speed, speed, "leaving the battlefield cannot remove player speed");
	commit(table, [{ do: "change-life", who: 1, amount: -2, reason: "resolve" }, { do: "change-life", who: 1, amount: 4, reason: "resolve" },
		{ do: "change-life", who: 1, amount: -1, reason: "resolve" }], "resolve");
	assert.equal(table.waiting.length, 1, "one or more losses make one trigger even with a net gain");
	assert.equal(table.waiting[0]!.source, undefined);
	const initial = structuredClone(table), from = table.ledger.length;
	put(table);
	const stacked = structuredClone(table), at = table.ledger.length;
	passBoth(table); step(table); finish(table);
	assert.equal(table.seats[0]!.speed, speed! + 1);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	assert.deepEqual(relive(stacked, table.ledger.slice(at)), table);
	lost(table); assert.equal(table.waiting.length, 0, "resolving does not allow a second trigger this turn");
	assert.ok(project(table, 1).table.some(line => line.includes(`speed ${speed! + 1}`)));
	assert.equal(amount({ world: viewWorld(project(table, 0)), controller: 0 }, { speed: "you" }), table.seats[0]!.speed);

	const countered = position().table; main(countered, 0); lost(countered); put(countered);
	const ability = cardsIn(countered, "stack")[0]!;
	const counter = instructionStep(countered, { world: tableWorld(countered), controller: 1, targets: [[{ id: ability.id, incarnation: ability.incarnation }]] },
		{ do: "counter", what: "target:0" }, { object: ability.id, program: [], bound: {}, illegal: [], picked: [] }, "Counter the speed trigger");
	commit(countered, counter.choices[0]!.changes, "counter");
	assert.equal(cardsIn(countered, "stack").length, 0); assert.equal(countered.seats[0]!.speed, 1);
	lost(countered); assert.equal(countered.waiting.length, 0, "countering does not refund this turn's trigger");
	main(countered, 1, 2); lost(countered); assert.equal(countered.waiting.length, 0, "opponent-turn losses do not increase your speed");
	main(countered, 0, 3); lost(countered); assert.equal(countered.waiting.length, 1, "a later own turn permits a new trigger");
	put(countered);
	commit(countered, [{ do: "increase-speed", who: 0, amount: 3 }], "resolve");
	const condition = structuredClone(countered), conditionAt = countered.ledger.length;
	passBoth(countered); finish(countered);
	assert.equal(countered.seats[0]!.speed, 4, "the intervening condition is checked again, preventing five");
	assert.deepEqual(relive(condition, countered.ledger.slice(conditionAt)), countered);
	main(countered, 0, 5); lost(countered); assert.equal(countered.waiting.length, 0, "at four the inherent ability no longer triggers");
	const actions = activatedUses(workFrame(countered, 0));
	assert.equal(actions.length, 2, "both engines grant their paid ability at max speed");
	const available = offered(countered, actions[0]!.procedure);
	assert.equal(available.length, 1); assert.equal(available[0]!.activation.targets.flat().length, 1);
	const vehicle = cardsIn(countered, "battlefield").find(one => one.card === "Unidentified Hovership")!;
	const target = available[0]!.activation.targets[0]![0]!;
	assert.ok("id" in target); assert.equal(target.id, vehicle.id, "an uncrewed Vehicle qualifies and opposing creatures do not");
	const activationPrefix = structuredClone(countered), activationAt = countered.ledger.length;
	announce(countered, actions[0]!.procedure); passBoth(countered); finish(countered);
	assert.equal(vehicle.counters["+1/+1"], 1);
	assert.deepEqual(relive(activationPrefix, countered.ledger.slice(activationAt)), countered);
	assert.ok(characteristics(countered, countered.things.get(actions[0]!.procedure.source.refs![0]!.id)!)!.registrations.some(one => one.kind === "activated"));
	assert.match(describe(countered, countered.log.find(receipt => receipt.changes.some(change => change.do === "increase-speed"))!), /increased speed/);
	const damaged = position().table; main(damaged, 0);
	const attacker = cardsIn(damaged, "battlefield", 1)[0]!;
	commit(damaged, [{ do: "damage", source: attacker.id, target: { player: 1 }, amount: 2 }], "resolve");
	assert.equal(damaged.waiting.length, 1, "dealt damage counts even when its source belongs to the opponent");
	const invalid = structuredClone(countered);
	assert.throws(() => commit(countered, [{ do: "tap", what: vehicle.id }, { do: "increase-speed", who: 0, amount: -1 }], "resolve"), /positive integer/);
	assert.deepEqual(countered, invalid, "an invalid speed change cannot partially mutate its group");
});
