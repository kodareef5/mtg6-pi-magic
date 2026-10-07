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
import { combatExchange } from "../src/core/combat-facts.ts";
import { withdrawnChoices } from "../src/core/combat.ts";
import { combatLookup } from "../src/context/strategy-combat.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { dossier } from "../src/context/dossier.ts";
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
	assert.ok(!dossier({ frame }).split("\n").find((line) => line.startsWith(`| ${claws[0]!.id}@`))!.includes("summoning-sick"), "the dossier row shows the same readiness");
	assert.deepEqual(table, before, "projecting readiness and watch matches moves nothing and stores no derived value");
	label(table, kellan, "vigilance until end of turn", ["vigilance"]);
	pick(table, `attack:${claws[0]!.id}`);
	assert.equal(table.things.get(claws[0]!.id)!.tapped, false, "a pick moves nothing");
	assert.equal(table.waiting.length, 0, "and triggers nothing");
	assert.match(project(table, 0).table.join("\n"), /Declaring an attacker: Hired Claw/);
	const pending = structuredClone(table), offered = nextDecision(table)!.options;
	assert.match(offered.at(-1)!.id, /^unattack:/, "withdrawals follow the unchanged physical choices");
	assert.deepEqual(table, pending, "listing withdrawals is pure");
	pick(table, `unattack:${claws[0]!.id}`);
	assert.deepEqual(table.combat!.choosing, []);
	assert.equal(table.things.get(claws[0]!.id)!.tapped, false);
	assert.equal(table.waiting.length, 0, "withdrawing triggers nothing");
	assert.ok(option(table, `attack:${claws[0]!.id}`), "withdrawal does not forbid reselecting the creature");
	pick(table, `attack:${claws[0]!.id}`);
	const retainedChoice = table.ledger.at(-1)!.seq;
	pick(table, `attack:${claws[1]!.id}`);
	pick(table, `attack:${kellan.id}`);
	pick(table, "attack:done");
	assert.ok(!nextDecision(table)!.options.some((one) => one.id.startsWith("unattack:")), "a finished declaration cannot be withdrawn");
	assert.deepEqual([...claws, kellan].map((one) => table.things.get(one.id)!.tapped), [true, true, false]);
	assert.equal(table.waiting.length, 2, "each Claw's watch triggers once for the whole attack");
	assert.ok(matches({ world: tableWorld(table), controller: 1 }, table.things.get(kellan.id)!, { attacking: true }));
	assert.equal(nextDecision(table)!.situation, "trigger-order");
	reach(table, "declare-attackers", 4);
	pick(table, `attack:${claws[0]!.id}`);
	const nextChoice = table.ledger.at(-1)!.seq;
	pick(table, `unattack:${claws[0]!.id}`);
	assert.ok(withdrawnChoices(table.ledger).has(nextChoice));
	assert.ok(!withdrawnChoices(table.ledger).has(retainedChoice), "a later combat cannot withdraw the earlier finished attack");
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
	const revision = structuredClone(table);
	nextDecision(table); assert.deepEqual(table, revision, "listing block withdrawals is pure");
	pick(table, `unblock:${chocobo.id}:${zhao.id}`);
	assert.deepEqual(table.combat!.choosing, []);
	assert.equal(option(table, "block:done")!.shows, undefined);
	assert.ok(option(table, `block:${chocobo.id}:${zhao.id}`), "the same block can be selected again");
	assert.ok(option(table, `block:${chocobo.id}:${nova.id}`), "the withdrawn blocker can instead block another attacker");
	const nothing = structuredClone(table); pick(nothing, "block:done");
	assert.deepEqual(nothing.combat!.blockers, [], "finishing uses the revised declaration");
	assert.ok(!nextDecision(nothing)?.options.some((one) => one.id.startsWith("unblock:")));
	pick(table, `block:${chocobo.id}:${zhao.id}`);
	assert.equal(option(table, `block:${elves.id}:${zhao.id}`)!.shows, undefined, "a second blocker satisfies menace");
	pick(table, `block:${elves.id}:${zhao.id}`);
	assert.equal(option(table, "block:done")!.shows, undefined);
	pick(table, `unblock:${chocobo.id}:${zhao.id}`);
	assert.equal(table.combat!.choosing.length, 1, "withdrawing one pick preserves the others");
	assert.match(option(table, "block:done")!.shows!, /conflicts with menace/);
	pick(table, `block:${chocobo.id}:${zhao.id}`);
	pick(table, "block:done");
	assert.deepEqual(table.combat!.blocked.map((one) => one.id), [zhao.id]);
	assert.deepEqual(project(table, 1).blockDeclaration!.conflicts, [], "the complete menace pair has no provisional one-blocker warning");

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
		assert.match(described, /Emberheart Challenger deals 2 to Mossborn Hydra and 0 to the defending player; Mossborn Hydra deals 1 back/);
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
	// Damage already marked on an indestructible blocker can satisfy all lethal assignment.
	const marked = matchup("marked-deathtouch"), trampler = establish(marked, 0, "Mossborn Hydra");
	const wall = establish(marked, 1, "Hired Claw", []);
	reach(marked, "declare-attackers", 3); label(marked, trampler, "Fixture grants deathtouch.", ["deathtouch"]);
	label(marked, wall, "Fixture grants indestructible.", ["indestructible"]);
	commit(marked, [{ do: "damage", source: trampler.id, target: { id: wall.id, incarnation: wall.incarnation }, amount: 2 }], "game-setup");
	pick(marked, `attack:${trampler.id}`); pick(marked, "attack:done");
	reach(marked, "declare-blockers", 3); pick(marked, `block:${wall.id}:${trampler.id}`); pick(marked, "block:done");
	const divisions = reach(marked, "combat-damage", 3);
	assert.ok(divisions.options.some((one) => one.id === `assign:${trampler.id}:0-1`), "deathtouch does not demand one more damage when marked damage is already lethal");
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
	const before = workFrame(table, 1), attacker = before.view.objects!.find((one) => one.id === kellan.id)!, blocker = before.view.objects!.find((one) => one.id === elves.id)!;
	const forecast = combatExchange(attacker, blocker)!;
	assert.equal(forecast.toPlayer, 0, "a double striker stays blocked after killing its blocker unless it tramples");
	assert.equal(forecast.blockerDestroyed, true);
	assert.deepEqual(forecast.steps.map((one) => one.toAttacker), [0, 0]);
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
	for (const trample of [false, true]) {
		const game = matchup(`forecast-strike-${trample}`), striker = establish(game, 1, "Kellan, Planar Trailblazer", []);
		const wall = establish(game, 0, trample ? "Llanowar Elves" : "Icetill Explorer", []);
		if (!trample) commit(game, [{ do: "counters", what: striker.id, kind: "+1/+1", amount: 1 }, { do: "counters", what: wall.id, kind: "+1/+1", amount: 6 }], "game-setup");
		reach(game, "declare-attackers", 2);
		label(game, striker, "Fixture grants strike keywords.", ["double strike", ...(trample ? ["trample"] : [])]);
		const frame = workFrame(game, 1), original = structuredClone(game);
		const read = combatExchange(frame.view.objects!.find((one) => one.id === striker.id)!, frame.view.objects!.find((one) => one.id === wall.id)!)!;
		assert.equal(read.toPlayer, trample ? 3 : 0);
		assert.equal(read.attackerDestroyed, !trample);
		assert.equal(read.blockerDestroyed, trample);
		assert.equal(JSON.parse(combatLookup(frame).answer({ attacker: striker.id, blocker: wall.id })).exchange.toPlayer, read.toPlayer);
		assert.ok(!dossier({ frame }).includes("toPlayer"), "pair arithmetic remains available by lookup, not repeated in every plan request");
		const unblocked = JSON.parse(combatLookup(frame).answer({ attacker: striker.id }));
		assert.equal(unblocked.exchange.toPlayer, trample ? 4 : 6);
		assert.deepEqual(game, original, "arithmetic applies no hypothetical damage or state-based action");
		pick(game, `attack:${striker.id}`); pick(game, "attack:done");
		reach(game, "declare-blockers", 2); pick(game, `block:${wall.id}:${striker.id}`); pick(game, "block:done");
		const life = game.seats.map((one) => one.life);
		for (let damageStep = 0; damageStep < 2; damageStep++) {
			reach(game, "combat-damage", 2);
			const assignment = nextDecision(game)!.options[0]!;
			if (assignment.id.startsWith("assign:")) pick(game, assignment.id);
			pick(game, "damage");
		}
		finish(game);
		assert.equal(game.seats[0]!.life, life[0]! - read.toPlayer);
		assert.equal(game.seats[1]!.life, life[1]);
		assert.equal(game.things.get(striker.id)!.zone === "graveyard", read.attackerDestroyed);
		assert.equal(game.things.get(wall.id)!.zone === "graveyard", read.blockerDestroyed);
	}
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
