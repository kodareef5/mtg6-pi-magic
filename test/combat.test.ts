/**
 * Fought. Attacks and blocks are declared one creature at a time and finished as
 * one group; conflicts with registered words are marked, never removed; damage is
 * divided as its controller chooses, trample only past lethal, and all of it is
 * dealt at once; first and double strike add a damage step; an empty attack
 * skips the rest. Positions come from the pinned lists.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { commit } from "../src/core/commit.ts";
import { project } from "../src/core/view.ts";
import { matches, tableWorld } from "../src/core/selectors.ts";
import type { Table, Thing } from "../src/core/table.ts";
import type { Decision } from "../src/core/types.ts";
import type { Registration } from "../src/core/language.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { activeWatches } from "../src/core/triggers.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { facts } from "../src/context/strategy-facts.ts";
import { establish, finish, matchup, pack, quiet } from "./play.ts";

/** Answer quietly until the table asks this step's turn-based question on this turn. */
function reach(table: Table, step: string, turn: number): Decision {
	for (let guard = 0; guard < 3000; guard++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		if (decision.situation === "turn-based" && table.cursor.steps[0] === step && table.cursor.turn === turn) return decision;
		apply(table, decision.situation === "pregame" ? "keep" : quiet(decision.options).id, "engine", "forced");
	}
	throw new Error(`Never reached ${step} on turn ${turn}.`);
}
const pick = (table: Table, id: string) => {
	const decision = nextDecision(table)!;
	assert.ok(decision.options.some((option) => option.id === id), `${id} among ${decision.options.map((option) => option.id).join(", ")}`);
	apply(table, id, "model", "chosen");
};
const option = (table: Table, id: string) => nextDecision(table)!.options.find((one) => one.id === id);
const label = (table: Table, on: Thing, text: string, words: string[]) =>
	commit(table, [{ do: "note", note: { kind: "label", by: on.controller, until: "end-of-turn", on: { id: on.id, incarnation: on.incarnation }, text, change: { words } } }], "game-setup");
const CLAW: Registration = { basis: "Whenever you attack with one or more Lizards, this creature deals 1 damage to target opponent.", kind: "watch",
	event: { on: "attacked-with", of: { subtypes: ["Lizard"], controller: "you" } },
	effect: { targets: [{ player: "opponent" }], instructions: [{ do: "damage", to: "target:0", amount: 1, from: "this" }] } };

test("attackers are declared one at a time, nothing moves until done, vigilance stays untapped, and a batch watch triggers once", () => {
	const table = matchup("attack");
	const claws = [establish(table, 1, "Hired Claw", [CLAW]), establish(table, 1, "Hired Claw", [CLAW])];
	const kellan = establish(table, 1, "Kellan, Planar Trailblazer", []);
	for (const viewer of [0, 1] as const) assert.equal(project(table, viewer).objects!.find((one) => one.id === claws[0]!.id)!.summoningSick, true);
	reach(table, "declare-attackers", 2);
	const before = structuredClone(table), frame = workFrame(table, 1);
	for (const viewer of [0, 1] as const) {
		assert.equal(project(table, viewer).objects!.find((one) => one.id === claws[0]!.id)!.summoningSick, false, "both seats read sickness against the creature's controller, not the viewer's turn");
		const watches = activeWatches(workFrame(table, viewer));
		assert.deepEqual(watches[0]!.matchingNow!.map((one) => one.id).sort(), claws.map((one) => one.id).sort(), "the Claws match their own Lizard watch, Kellan does not");
	}
	const pilot = focus(frame, startingIntent(1)).objects.find((one) => one.id === claws[0]!.id)!;
	assert.equal(pilot.summoningSick, false); assert.ok(pilot.subtypes!.includes("Lizard"));
	assert.equal(JSON.parse(facts(frame, {})).objects.find((one: { id: string }) => one.id === claws[0]!.id).summoningSick, false);
	assert.deepEqual(table, before, "projecting readiness and watch matches moves nothing and stores no derived value");
	label(table, kellan, "vigilance until end of turn", ["vigilance"]);
	pick(table, `attack:${claws[0]!.id}`);
	assert.equal(table.things.get(claws[0]!.id)!.tapped, false, "a pick moves nothing");
	assert.equal(table.waiting.length, 0, "and triggers nothing");
	assert.match(project(table, 0).table.join("\n"), /Declaring an attacker: Hired Claw/);
	pick(table, `attack:${claws[1]!.id}`);
	pick(table, `attack:${kellan.id}`);
	pick(table, "attack:done");
	assert.deepEqual([...claws, kellan].map((one) => table.things.get(one.id)!.tapped), [true, true, false]);
	assert.equal(table.waiting.length, 2, "each Claw's watch triggers once for the whole attack");
	assert.ok(matches({ world: tableWorld(table), controller: 1 }, table.things.get(kellan.id)!, { attacking: true }));
	assert.equal(nextDecision(table)!.situation, "trigger-order");
});

test("blocks a word forbids are listed and marked, and menace is checked at done", () => {
	const table = matchup("block");
	const zhao = establish(table, 1, "Zhao, the Moon Slayer");
	const nova = establish(table, 1, "Nova Hellkite", [{ basis: "Flying, haste", kind: "continuous", affects: { is: "this" }, change: { words: ["flying", "haste"] } }]);
	const chocobo = establish(table, 0, "Sazh's Chocobo", []);
	const elves = establish(table, 0, "Llanowar Elves", pack("Llanowar Elves"));
	reach(table, "declare-attackers", 2);
	pick(table, `attack:${zhao.id}`);
	pick(table, `attack:${nova.id}`);
	pick(table, "attack:done");
	reach(table, "declare-blockers", 2);
	assert.equal(nextDecision(table)!.seat, 0, "the defending player declares");
	assert.match(option(table, `block:${chocobo.id}:${nova.id}`)!.shows!, /Conflicts with flying/);
	assert.match(option(table, `block:${chocobo.id}:${zhao.id}`)!.shows!, /Conflicts with menace unless another creature also blocks it/);
	pick(table, `block:${chocobo.id}:${zhao.id}`);
	assert.match(option(table, "block:done")!.shows!, /Zhao, the Moon Slayer conflicts with menace/);
	assert.equal(option(table, `block:${elves.id}:${zhao.id}`)!.shows, undefined, "a second blocker satisfies menace");
	pick(table, `block:${elves.id}:${zhao.id}`);
	assert.equal(option(table, "block:done")!.shows, undefined);
	pick(table, "block:done");
	assert.deepEqual(table.combat!.blocked.map((one) => one.id), [zhao.id]);

	// Two blockers: Zhao's controller divides its 2 damage as it likes (510.1c), with no lethal-first order.
	const divide = reach(table, "combat-damage", 2);
	assert.deepEqual(divide.options.map((one) => one.id), [`assign:${zhao.id}:0-2`, `assign:${zhao.id}:1-1`, `assign:${zhao.id}:2-0`]);
	assert.equal(divide.seat, 1);
	pick(table, `assign:${zhao.id}:1-1`);
	pick(table, "damage");
	const dealt = table.log.at(-1)!.changes.filter((change) => change.do === "damage");
	assert.equal(dealt.length, 4, "Zhao twice, Nova to the player, the Elves back: one group");
	assert.equal(table.seats[0]!.life, 16);
	finish(table);
	assert.deepEqual([chocobo, elves].map((one) => table.things.get(one.id)!.zone), ["graveyard", "graveyard"]);
	for (const keyword of [undefined, "indestructible", "deathtouch"]) {
		const position = matchup(`exchange-${keyword ?? "ordinary"}`);
		const hydra = establish(position, 0, "Mossborn Hydra");
		const challenger = establish(position, 1, "Emberheart Challenger", []);
		reach(position, "declare-attackers", 2);
		pick(position, `attack:${challenger.id}`); pick(position, "attack:done");
		reach(position, "declare-blockers", 2);
		if (keyword) label(position, hydra, `Fixture grants ${keyword}.`, [keyword]);
		const described = option(position, `block:${hydra.id}:${challenger.id}`)!.shows!;
		assert.match(described, /Emberheart Challenger deals 2 to Mossborn Hydra; Mossborn Hydra deals 1 back/);
		assert.ok(described.includes(`Mossborn Hydra ${keyword === "indestructible" ? "survives this damage" : "would be destroyed by this damage"}`));
		assert.ok(described.includes(`Emberheart Challenger ${keyword === "deathtouch" ? "would be destroyed by this damage" : "survives this damage"}`));
		pick(position, `block:${hydra.id}:${challenger.id}`); pick(position, "block:done");
		reach(position, "combat-damage", 2); pick(position, "damage"); finish(position);
		assert.equal(position.things.get(hydra.id)!.zone, keyword === "indestructible" ? "battlefield" : "graveyard");
		assert.equal(position.things.get(challenger.id)!.zone, keyword === "deathtouch" ? "graveyard" : "battlefield");
	}
});

test("trample assigns lethal to the blocker before the player, counting marked damage", () => {
	const table = matchup("trample");
	const hydra = establish(table, 0, "Mossborn Hydra");
	commit(table, [{ do: "counters", what: hydra.id, kind: "+1/+1", amount: 3 }], "game-setup");
	const claw = establish(table, 1, "Hired Claw", []);
	reach(table, "declare-attackers", 3);
	pick(table, `attack:${hydra.id}`);
	pick(table, "attack:done");
	reach(table, "declare-blockers", 3);
	pick(table, `block:${claw.id}:${hydra.id}`);
	pick(table, "block:done");
	commit(table, [{ do: "damage", source: hydra.id, target: { id: claw.id, incarnation: claw.incarnation }, amount: 1 }], "game-setup");
	const divide = reach(table, "combat-damage", 3);
	assert.deepEqual(divide.options.map((one) => one.id), [`assign:${hydra.id}:1-3`, `assign:${hydra.id}:2-2`, `assign:${hydra.id}:3-1`, `assign:${hydra.id}:4-0`],
		"the Claw has 1 damage marked, so 1 is lethal; less than that reaches nobody past it");
	pick(table, `assign:${hydra.id}:1-3`);
	pick(table, "damage");
	assert.equal(table.seats[1]!.life, 17);
});

test("double strike deals damage in both steps, and a creature killed by first strike deals none", () => {
	const table = matchup("strike");
	const kellan = establish(table, 1, "Kellan, Planar Trailblazer", []);
	const claw = establish(table, 1, "Hired Claw", []);
	const elves = establish(table, 0, "Llanowar Elves", []);
	reach(table, "declare-attackers", 2);
	label(table, kellan, "a Rogue with double strike", ["double strike"]);
	pick(table, `attack:${kellan.id}`);
	pick(table, `attack:${claw.id}`);
	pick(table, "attack:done");
	reach(table, "declare-blockers", 2);
	pick(table, `block:${elves.id}:${kellan.id}`);
	pick(table, "block:done");
	const first = reach(table, "combat-damage", 2);
	assert.equal(first.options[0]!.label, "Deal combat damage: Kellan, Planar Trailblazer deals 2 to Llanowar Elves", "only double strike deals damage first");
	pick(table, "damage");
	assert.deepEqual(table.cursor.steps.slice(0, 2), ["combat-damage", "combat-damage"], "a second damage step follows (510.4)");
	const second = reach(table, "combat-damage", 2);
	assert.equal(table.things.get(elves.id)!.zone, "graveyard", "the first step's damage killed the Elves before the second");
	assert.equal(second.options[0]!.label, "Deal combat damage: Hired Claw deals 1 to seat 0",
		"the dead Elves deal nothing, and Kellan stays blocked with nothing to hit (509.1h)");
	pick(table, "damage");
	assert.equal(table.seats[0]!.life, 19);
	assert.equal(table.things.get(kellan.id)!.damage, 0);
});

test("attacking with nothing skips blockers and damage, and combat ends after the end of combat step", () => {
	const table = matchup("empty");
	establish(table, 1, "Hired Claw", []);
	reach(table, "declare-attackers", 2);
	pick(table, "attack:done");
	assert.ok(!table.cursor.steps.includes("declare-blockers") && !table.cursor.steps.includes("combat-damage"));
	for (let decision = nextDecision(table); table.cursor.steps[0] !== "postcombat-main"; decision = nextDecision(table)) {
		if (!decision) advance(table);
		else apply(table, quiet(decision.options).id, "engine", "forced");
	}
	assert.equal(table.combat, null);
});
