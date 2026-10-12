/** One occurrence of target selects distinct recipients and keeps a single instruction simultaneous. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { relive } from "../src/core/journal.ts";
import { apply, advance, nextDecision } from "../src/core/decisions.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { announcementOffers } from "../src/core/announcement-options.ts";
import { beginAnnouncement } from "../src/core/announcing.ts";
import { project } from "../src/core/view.ts";
import { tableWorld, targetKey } from "../src/core/selectors.ts";
import { validTargetControllers } from "../src/core/targeting.ts";
import { begin } from "../src/core/resolution.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { activationChanges, checkProcedure } from "../src/core/procedures.ts";
import { announce, example, finish, main, offered, passBoth, place, step } from "./play.ts";

test("one target slot enforces its range and uniqueness while resolving all surviving members together", () => {
	const damage = example("Prismari Charm deals 1 to each of one or two targets");
	for (const invalid of [{ count: 2, atLeast: 3 }, { count: 2, atLeast: 1, upTo: true }])
		assert.throws(() => checkProcedure({ ...damage, targets: [{ ...damage.targets![0], ...invalid }] }), /target minimum/);
	for (const lost of [false, true]) {
		const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("4c Control") }], `bounded-targets-${lost}`);
		main(table, 0); place(table, 0, "hand", "Prismari Charm");
		const [crab] = place(table, 0, "battlefield", "Eddymurk Crab");
		commit(table, [{ do: "add-mana", who: 0, colors: ["U", "R"] }], "game-setup");
		const choices = offered(table, damage), targets = choices.map((one) => one.activation.targets[0]!);
		assert.deepEqual(new Set(targets.map((one) => one.length)), new Set([1, 2]));
		assert.ok(targets.every((set) => new Set(set.map((one) => JSON.stringify(one))).size === set.length));
		const mixed = choices.find((one) => one.activation.targets[0]?.some((one) => "id" in one && one.id === crab!.id) &&
			one.activation.targets[0]?.some((one) => "player" in one && one.player === 1))!;
		for (const bad of [[], [mixed.activation.targets[0]![0]!, mixed.activation.targets[0]![0]!], [...mixed.activation.targets[0]!, { player: 0 }]]) {
			const before = structuredClone(table);
			assert.throws(() => activationChanges(table, { ...mixed.activation, targets: [bad] }), /target slot/);
			assert.deepEqual(table, before, "a bad declared target count or duplicate moves nothing");
		}
		const initial = structuredClone(table), at = table.ledger.length;
		announce(table, damage, (one) => one.option.id === mixed.option.id);
		if (lost) commit(table, [{ do: "move", what: crab!.id, to: "graveyard", reason: "destroy" }], "destroy");
		passBoth(table);
		const partial = structuredClone(table), from = table.ledger.length;
		step(table);
		const dealt = table.log.at(-1)!.changes.filter((one) => one.do === "damage");
		assert.equal(dealt.length, lost ? 1 : 2, "every surviving target takes damage in one group");
		assert.equal(table.seats[1]!.life, 19); assert.equal(crab!.damage, lost ? 0 : 1);
		finish(table);
		assert.deepEqual(relive(partial, table.ledger.slice(from)), table);
		if (!lost) assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
	const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("4c Control") }], "bounded-returns");
	main(table, 0); place(table, 0, "hand", "Get Out");
	const [crab, hearth] = place(table, 0, "graveyard", "Eddymurk Crab", "Hearth Elemental // Stoke Genius");
	commit(table, [{ do: "move", what: crab!.id, to: "battlefield", controller: 1, reason: "resolve" },
		{ do: "move", what: hearth!.id, to: "battlefield", reason: "resolve" }, { do: "add-mana", who: 0, colors: ["U", "U"] }], "game-setup");
	const initial = structuredClone(table), at = table.ledger.length;
	announce(table, example("Get Out returns one or two creatures or enchantments you own"), (one) => one.activation.targets[0]?.length === 2);
	passBoth(table); step(table);
	const returned = table.log.at(-1)!.changes.filter((one) => one.do === "move" && one.to === "hand");
	assert.equal(returned.length, 2); assert.equal(crab!.zone, "hand"); assert.equal(hearth!.zone, "hand");
	finish(table); assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	controllerTargets();
});

/** One generic target group retains the player named by each choice. */
function controllerTargets() {
	const procedure = example("Activate The Theorist's -2 with up to one target per opponent");
	assert.throws(() => checkProcedure({ ...procedure, targets: [{ ...procedure.targets![0], player: "any" }] }), /objects only/);
	const pick = (table: Table, id: string) => { assert.ok(nextDecision(table)!.options.some(one => one.id === id), id); apply(table, id, "model", "chosen"); };
	for (const opponents of [1, 2]) for (const choose of [false, true]) {
		const table = start({ ...standard, seats: { min: 2, max: 3 } }, [{ deck: deck("Azorius Control") },
			...Array.from({ length: opponents }, () => ({ deck: deck("Izzet Spellementals") }))], `controller-targets-${opponents}-${choose}`, undefined, { announcementsFrom: 0 });
		const [jace] = place(table, 0, "battlefield", "The Theorist, Jace Beleren");
		const pairs = Array.from({ length: opponents }, (_, at) => place(table, at + 1, "battlefield", "Eddymurk Crab", "Eddymurk Crab"));
		main(table, 0);
		const initial = structuredClone(table), version = table.ledger.length;
		const choices = offered(table, procedure);
		assert.equal(choices.length, 3 ** opponents, "zero or either creature from each controller, without same-controller pairs");
		const complete = choices.find(one => one.activation.targets[0]!.length === opponents)!;
		const duplicated = structuredClone(complete.activation);
		duplicated.targets[0] = pairs[0]!.map(one => ({ id: one.id, incarnation: one.incarnation, controller: 1 }));
		assert.throws(() => activationChanges(table, duplicated), /per-controller/);
		const missingController = structuredClone(complete.activation); delete missingController.targets[0]![0]!.controller;
		assert.throws(() => activationChanges(table, missingController), /per-controller/);
		const ref = complete.activation.targets[0]![0]!;
		const changed = { ...tableWorld(table), objects: tableWorld(table).objects.map(one => one.id === ("id" in ref ? ref.id : "") ? { ...one, controller: 0 } : one) };
		assert.equal(validTargetControllers(procedure.targets![0]!, [ref], { world: changed, controller: 0 }), false);
		const entry = announcementOffers(procedure, workFrame(table, 0), "procedure")[0]!;
		beginAnnouncement(table, entry.announcement, { picked: entry.option.id, offered: [entry.option.id], by: "model", why: "declared" });
		if (choose) for (const pair of pairs) {
			pick(table, `announce:target:${targetKey(pair[0]!)}`);
			assert.ok(!nextDecision(table)!.options.some(one => one.id === `announce:target:${targetKey(pair[1]!)}`));
		}
		const middle = structuredClone(table), from = table.ledger.length;
		nextDecision(table); assert.deepEqual(table, middle, "discovery is pure mid-selection");
		assert.equal(project(table, 1).announcement, undefined);
		pick(table, "announce:targets-done"); pick(table, "announce:cost:0");
		assert.equal(jace!.counters.loyalty, 3, "selection spends no loyalty");
		pick(table, nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!.id);
		assert.equal(jace!.counters.loyalty, 1);
		assert.deepEqual(relive(structuredClone(middle), table.ledger.slice(from)), table);
		const ability = cardsIn(table, "stack")[0]!;
		if (choose) {
			// A hypothetical later control change makes only that player's target illegal.
			const altered = structuredClone(table); altered.things.get(pairs[0]![0]!.id)!.controller = opponents;
			if (opponents > 1) assert.deepEqual((begin(altered, altered.things.get(ability.id)!) as { illegal: string[] }).illegal, [targetKey(pairs[0]![0]!)]);
		}
		for (let at = 0; at <= opponents; at++) { while (!nextDecision(table)) advance(table); pick(table, "pass"); }
		step(table);
		const returned = table.log.at(-1)!.changes.filter(one => one.do === "move" && one.to === "hand");
		assert.equal(returned.length, choose ? opponents : 0, "legal chosen targets return in one group");
		for (const pair of pairs) { assert.equal(pair[0]!.zone, choose ? "hand" : "battlefield"); assert.equal(pair[1]!.zone, "battlefield"); }
		finish(table); assert.deepEqual(relive(initial, table.ledger.slice(version)), table);
	}
}
