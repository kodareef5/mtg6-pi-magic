/**
 * Lands the wider pool plays: a shock land's optional entry payment, a Town's own-turn count, and a Verge's
 * conditional mana ability. Each is a registration shape the October 10 pool audit found missing.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { check, PackageSchema, type Package, type Registration } from "../src/core/language.ts";
import { fundings, produces } from "../src/core/funding.ts";
import { amount, holds, tableWorld, turnsTaken } from "../src/core/selectors.ts";
import { seat } from "../src/core/table.ts";
import { main, matchup, place, establish, pack } from "./play.ts";
import { characteristics, intrinsic } from "../src/core/characteristics.ts";
import { describe, project } from "../src/core/view.ts";
import { start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { beforeEntry } from "../src/core/entry-payments.ts";
import { relive } from "../src/core/journal.ts";
import { standard } from "../src/core/format.ts";
import { activate, activationChanges, printedCast, procedureOptions } from "../src/core/procedures.ts";
import { commit } from "../src/core/commit.ts";

/** Two pool lists that register the lands under test: Steam Vents for seat 0, Starting Town for seat 1. */
const pool = (seed: string) => start(standard, [{ name: "Izzet", deck: deck("Izzet Spellementals") }, { name: "Jund", deck: deck("Jund Sacrifice") }], seed);

const shock: Package = { card: "Steam Vents", assessed: true, registers: [
	{ basis: "As this land enters, you may pay 2 life. If you don't, it enters tapped.", kind: "enters", tapped: true, unlessPay: { life: 2 } },
] };
const town: Package = { card: "Starting Town", assessed: true, registers: [
	{ basis: "This land enters tapped unless it's your first, second, or third turn of the game.", kind: "enters", tapped: true,
		if: { any: [{ not: { turn: "self" } }, { amount: { turns: "self" }, atLeast: 4 }] } },
	{ basis: "{T}: Add {C}.", kind: "mana", cost: { tap: true }, colors: ["C"] },
	{ basis: "{T}, Pay 1 life: Add one mana of any color.", kind: "mana", cost: { tap: true, life: 1 }, any: 1 },
] };
const verge: Registration = { basis: "{T}: Add {B}. Activate only if you control an Island or a Swamp.", kind: "mana", cost: { tap: true }, colors: ["B"],
	if: { amount: { count: { zones: ["battlefield"], controller: "self", subtypes: ["Island", "Swamp"] } }, atLeast: 1 } };

test("the new registration shapes are accepted by the package schema", () => {
	for (const pack of [shock, town, { card: "Gloomlake Verge", assessed: true, registers: [verge] } satisfies Package]) assert.doesNotThrow(() => check(PackageSchema, pack, pack.card));
});

test("turns taken count from who started, and the turn condition reads whose turn it is", () => {
	assert.deepEqual(turnsTaken(0, [0, 1], 1), { 0: 1, 1: 0 });
	assert.deepEqual(turnsTaken(0, [0, 1], 2), { 0: 1, 1: 1 });
	assert.deepEqual(turnsTaken(0, [0, 1], 5), { 0: 3, 1: 2 });
	assert.deepEqual(turnsTaken(1, [0, 1], 2), { 1: 1, 0: 1 });
	const table = matchup("turns");
	main(table, 0, 3);
	const world = tableWorld(table);
	assert.deepEqual(world.turn, { active: 0, taken: { 0: 2, 1: 1 }, began: table.cursor.began[0], step: "precombat-main", stepDone: true });
	assert.equal(amount({ world, controller: 0 }, { turns: "self" }), 2);
	assert.equal(amount({ world, controller: 1 }, { turns: "self" }), 1);
	assert.equal(amount({ world, controller: 1 }, { turns: "opponent" }), 2);
	assert.equal(holds({ world, controller: 0 }, { turn: "self" }), true);
	assert.equal(holds({ world, controller: 1 }, { turn: "self" }), false);
	assert.equal(holds({ world, controller: 1 }, { turn: "opponent" }), true);
});

test("a Town enters untapped through its controller's third turn and tapped from the fourth", () => {
	// Seat 1 is on the draw: its third turn is the game's sixth, its fourth the eighth.
	for (const [turn, tapped] of [[6, false], [8, true]] as const) {
		const table = pool(`town-${turn}`);
		main(table, 1, turn);
		editWork(table, 1, [{ do: "package.put", package: town }], "town-package");
		const [land] = place(table, 1, "hand", "Starting Town");
		apply(table, `land:${land!.id}`, "model", "chosen");
		assert.equal(table.things.get(land!.id)!.tapped, tapped, `own turn ${turn / 2}: ${tapped ? "tapped" : "untapped"}`);
	}
});

test("a conditional mana ability produces only while its condition holds", () => {
	const table = pool("conditional-production");
	assert.deepEqual(produces(verge, { world: tableWorld(table), controller: 0 }), []);
	place(table, 0, "battlefield", "Island");
	assert.equal(produces(verge, { world: tableWorld(table), controller: 0 }).length, 1);
});


test("mana funding pays life once, reserves other costs, and rechecks conditional abilities", () => {
	const table = pool("life-funding");
	main(table, 1);
	const land = establish(table, 1, "Starting Town", town.registers);
	const [card] = place(table, 1, "hand", "Greedy Freebooter");
	const procedure = printedCast(card!.card!, table.printed[card!.card!]!);
	const choices = () => procedureOptions(procedure, workFrame(table, 1), "cast");
	const choice = choices().find((one) => one.activation.source.id === card!.id)!;
	assert.ok(choice, "a life-cost mana ability funds a colored spell");
	assert.equal(choice.activation.funding![0]!.life, 1);
	assert.match(choice.option.shows!, /pay 1 life/);
	const forged = structuredClone(choice.activation);
	delete forged.funding![0]!.life;
	assert.throws(() => activationChanges(table, forged), /no registered mana ability/);
	const broke = structuredClone(table);
	commit(broke, [{ do: "change-life", who: 1, amount: -19, reason: "game-setup" }], "game-setup");
	assert.equal(fundings(workFrame(broke, 1), { generic: 0, colors: ["B"], life: 1 }).length, 0, "spell and mana ability cannot spend the same life");
	activate(table, choice.activation, { picked: choice.option.id, offered: choices().map((one) => one.option.id), by: "model", why: "chosen" });
	assert.equal(seat(table, 1).life, 19);
	assert.equal(land.tapped, true);
	assert.equal(card!.zone, "stack");

	const conditional = pool("conditional-payment");
	main(conditional, 1);
	establish(conditional, 1, "Starting Town", [verge]);
	const [spell] = place(conditional, 1, "hand", "Greedy Freebooter");
	const borrowed = structuredClone(choice.activation);
	borrowed.source = { id: spell!.id, incarnation: spell!.incarnation };
	const source = [...conditional.things.values()].find((one) => one.card === "Starting Town" && one.zone === "battlefield")!;
	borrowed.funding = [{ source: { id: source.id, incarnation: source.incarnation }, colors: ["B"], claim: verge.basis }];
	assert.throws(() => activationChanges(conditional, borrowed), /no registered mana ability/, "the commit path checks the condition too");
});


test("entry payments wait for every controller and preserve the simultaneous group through replay", () => {
	const table = pool("entry-group"); main(table, 0);
	const [vents] = place(table, 0, "graveyard", "Steam Vents");
	const [crypt] = place(table, 1, "graveyard", "Blood Crypt");
	commit(table, beforeEntry(table, [
		{ do: "move", what: vents!.id, to: "battlefield", reason: "resolve", registers: shock.registers },
		{ do: "move", what: crypt!.id, to: "battlefield", reason: "resolve", tapped: true, registers: shock.registers },
	], "resolve"), "resolve");
	const pending = structuredClone(table), version = table.ledger.length;
	assert.equal(nextDecision(table)!.seat, 0);
	assert.deepEqual(table, pending, "listing changes nothing");
	apply(table, "entry:0:pay", "model", "chosen");
	assert.equal(vents!.zone, "graveyard", "the group waits for the other controller");
	assert.equal(seat(table, 0).life, 20, "no part of the group has happened");
	assert.equal(nextDecision(table)!.seat, 1);
	apply(table, "entry:1:pay", "model", "chosen");
	assert.equal(vents!.zone, "battlefield"); assert.equal(vents!.tapped, false);
	assert.equal(crypt!.zone, "battlefield"); assert.equal(crypt!.tapped, true, "paying cannot override a separate tapped instruction");
	assert.equal(seat(table, 0).life, 18); assert.equal(seat(table, 1).life, 18);
	assert.equal(table.entry, undefined);
	assert.deepEqual(relive(pending, table.ledger.slice(version)), table, "a clone in the pending payment replays the same group");

	for (const [answer, life, tapped] of [["pay", 18, false], ["decline", 20, true]] as const) {
		const played = pool(`played-entry-${answer}`); main(played, 0);
		editWork(played, 0, [{ do: "package.put", package: shock }], "shock-package");
		const [land] = place(played, 0, "hand", "Steam Vents");
		assert.equal(nextDecision(played)!.options.filter((one) => one.id.startsWith(`land:${land!.id}`)).length, 1);
		const prefix = structuredClone(played), from = played.ledger.length;
		apply(played, `land:${land!.id}`, "model", "chosen");
		assert.equal(land!.zone, "hand", "the land play waits for the generic entry choice");
		assert.equal(seat(played, 0).landsPlayed, 0, "bookkeeping stays with the physical group");
		apply(played, `entry:0:${answer}`, "model", "chosen");
		assert.equal(land!.zone, "battlefield"); assert.equal(land!.tapped, tapped);
		assert.equal(seat(played, 0).life, life); assert.equal(seat(played, 0).landsPlayed, 1);
		assert.deepEqual(relive(prefix, played.ledger.slice(from)), played);
	}

});

test("entry choices precede payment and derive types for only the entering incarnation", () => {
	for (const pay of [false, true]) {
		const table = pool(`chosen-type-${pay}`); main(table, 0);
		const registers = pack("Multiversal Passage");
		editWork(table, 0, [{ do: "package.put", package: { card: "Multiversal Passage", assessed: true, registers } }], "passage-package");
		const [land] = place(table, 0, "hand", "Multiversal Passage");
		const initial = structuredClone(table), from = table.ledger.length;
		apply(table, `land:${land!.id}`, "model", "chosen");
		const choosing = structuredClone(table);
		assert.equal(nextDecision(table)!.options.length, 5);
		assert.deepEqual(table, choosing, "listing types moves nothing");
		apply(table, "entry:0:choose:landType:Island", "model", "chosen");
		assert.equal(land!.zone, "hand"); assert.equal(land!.choices, undefined);
		assert.equal(seat(table, 0).life, 20); assert.equal(seat(table, 0).landsPlayed, 0);
		const clone = structuredClone(table), at = table.ledger.length;
		apply(table, `entry:0:${pay ? "pay" : "decline"}`, "model", "chosen");
		assert.equal(land!.tapped, !pay); assert.equal(seat(table, 0).life, pay ? 18 : 20);
		assert.deepEqual(land!.choices, { landType: "Island" });
		const traits = characteristics(table, land!)!;
		assert.deepEqual(traits.subtypes, ["Island"]); assert.deepEqual(intrinsic(traits), ["U"]);
		assert.ok(!traits.supertypes.includes("basic")); assert.equal(traits.registrations.length, 0);
		assert.ok(project(table, "spectator").table.some((line) => line.includes("landType: Island")));
		assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		commit(table, [{ do: "move", what: land!.id, to: "graveyard", reason: "destroy" }], "destroy");
		assert.equal(land!.choices, undefined);
		assert.deepEqual(characteristics(table, land!)!.subtypes, []);
		// A fetched or returned land takes the same path, including an independent tapped instruction.
		commit(table, beforeEntry(table, [{ do: "move", what: land!.id, to: "battlefield", reason: "resolve", registers, tapped: true }], "resolve"), "resolve");
		apply(table, "entry:0:choose:landType:Forest", "model", "chosen");
		apply(table, "entry:0:pay", "model", "chosen");
		assert.equal(land!.tapped, true); assert.deepEqual(intrinsic(characteristics(table, land!)), ["G"]);
	}
});

test("beholding for entry reveals only a chosen hand card and waits for the entire group", () => {
	for (const location of ["hand", "battlefield", "decline", "unavailable"] as const) {
		const table = start(standard, [{ deck: deck("Azorius Control") }, { deck: deck("Azorius Control") }], `entry-behold-${location}`);
		main(table, 0);
		const registers = pack("Theorist's Sanctum"), jace = "The Theorist, Jace Beleren";
		const [own] = place(table, 0, location === "battlefield" ? "battlefield" : "hand", jace);
		place(table, 1, "hand", jace); place(table, 1, "battlefield", jace);
		if (location === "unavailable") commit(table, [...table.things.values()].filter((one) => one.owner === 0 && one.card === jace)
			.map((one) => ({ do: "move", what: one.id, to: "outside", reason: "game-setup" })), "game-setup");
		const lands = [...table.things.values()].filter((one) => one.owner === 0 && one.card === "Theorist's Sanctum").slice(0, 2);
		const clock = table.cursor.clock;
		commit(table, beforeEntry(table, [
			...lands.map((one, index) => ({ do: "move" as const, what: one.id, to: "battlefield" as const, reason: "resolve" as const, registers, ...(index ? { tapped: true as const } : {}) })),
			{ do: "add-mana", who: 0, colors: ["U"] },
			{ do: "spend-mana", who: 0, ids: [`mana-${clock + 1}-2-0`] },
		], "resolve"), "resolve");
		const initial = structuredClone(table), from = table.ledger.length, decision = nextDecision(table)!;
		assert.deepEqual(table, initial, "listing entry payments reveals and spends nothing");
		assert.equal(decision.seat, 0);
		if (location === "unavailable") assert.equal(decision.options.length, 1, "another seat's Jace cannot pay");
		const choosing = location === "hand" || location === "battlefield";
		const pick = (index: number) => {
			const options = nextDecision(table)!.options;
			const option = options.find((one) => choosing ? one.label.includes(jace) && one.label.includes(`(${location})`) : one.id === `entry:${index}:decline`)!;
			assert.ok(option); apply(table, option.id, "model", "chosen");
		};
		pick(0);
		assert.ok(lands.every((one) => one.zone !== "battlefield"), "neither land enters until the second choice");
		if (location !== "battlefield") assert.ok(!project(table, 1).objects!.some((one) => one.id === own!.id), "a pending reveal is still private");
		const partial = structuredClone(table), at = table.ledger.length;
		pick(1);
		assert.ok(lands.every((one) => one.zone === "battlefield"));
		assert.equal(lands[0]!.tapped, !choosing); assert.equal(lands[1]!.tapped, true, "another tapped entry instruction still applies");
		assert.equal(seat(table, 0).pool.length, 0, "inserting a reveal keeps same-group mana ids aligned");
		const reveal = table.log.at(-1)!.changes.filter((one) => one.do === "reveal");
		assert.equal(reveal.length, location === "hand" ? 1 : 0, "the same card may be beheld twice without being spent");
		if (location === "hand") assert.match(describe(table, table.log.at(-1)!, 1), /revealed The Theorist, Jace Beleren from hand/);
		assert.deepEqual(relive(partial, table.ledger.slice(at)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	}
});
