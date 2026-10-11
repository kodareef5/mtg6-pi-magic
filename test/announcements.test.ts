/** A cast's pending choices belong to the table and survive a saved prefix.
 * The transaction, plan and journal checks share this position past 150 lines. */
import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commit, start } from "../src/core/commit.ts";
import { load } from "../src/core/cards.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { execution, planState } from "../src/core/planning.ts";
import { activationChanges, activate } from "../src/core/procedures.ts";
import { fork, open, replay, save, relive, type Header } from "../src/core/journal.ts";
import { focus } from "../src/context/packet.ts";
import { question } from "../src/context/seat.ts";
import { startingIntent } from "../src/context/plan.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import { announcementOffers } from "../src/core/announcement-options.ts";
import { beginAnnouncement } from "../src/core/announcing.ts";
import type { Procedure } from "../src/core/language.ts";
import { main, establish, place, passBoth, finish, offered, example } from "./play.ts";

function position() {
	const table = start(standard, [{ deck: alpha(deck("Boros Tokens")) }, { deck: deck("Mono-Red Aggro") }], "staged-announcement", undefined, { announcementsFrom: 0 });
	place(table, 0, "battlefield", "Mountain", "Mountain", "Mountain", "Mountain", "Plains");
	place(table, 0, "hand", "Song of Totentanz", "Frontline Rush");
	establish(table, 0, "Voice of Victory", []);
	return table;
}

test("announcements preserve private choices, costs, plan intent and every saved continuation until confirmed", async () => {
	const table = position(); main(table, 0);
	const song: Procedure = { source: { card: "Song of Totentanz", zones: ["hand"], controller: "self" }, timing: "spell",
		claim: "Cast Song of Totentanz", basis: table.printed["Song of Totentanz"]!.oracle,
		instructions: [{ do: "token", count: { x: true }, spec: { name: "Rat", types: ["creature"], subtypes: ["Rat"], colors: ["B"], power: 1, toughness: 1, words: ["can't block"] } },
			{ do: "modify", every: { types: ["creature"], controller: "you" }, change: { words: ["haste"] }, until: "end-of-turn" }] };
	const rush: Procedure = { source: { card: "Frontline Rush", zones: ["hand"], controller: "self" }, timing: "spell",
		claim: "Cast Frontline Rush to strengthen a creature", basis: table.printed["Frontline Rush"]!.oracle,
		targets: [{ object: { types: ["creature"] } }], instructions: [{ do: "modify", what: "target:0", until: "end-of-turn",
			change: { power: { count: { types: ["creature"], controller: "you" } }, toughness: { count: { types: ["creature"], controller: "you" } } } }] };
	editWork(table, 0, [song, rush].map((procedure) => ({ do: "package.put" as const,
		package: { card: procedure.source.card!, registers: [], assessed: true, procedures: [procedure] } })), "uses");
	const snapshots: { version: number; table: Table }[] = [];
	const checkpoint = () => snapshots.push({ version: table.ledger.length, table: structuredClone(table) });
	const pick = (id: string) => {
		const before = structuredClone(table), decision = nextDecision(table)!;
		assert.deepEqual(table, before, "listing the next announcement part is pure");
		assert.ok(decision.options.some((one) => one.id === id), id);
		apply(table, id, "model", "chosen", planState(workFrame(table, 0)) ? execution(planState(workFrame(table, 0))!, id) : undefined);
	};
	const begin = (card: string) => nextDecision(table)!.options.find((one) => one.announcement?.procedure.source.card === card)!;
	const cast = begin("Song of Totentanz"), physical = structuredClone([...table.things]), log = table.log.length, priority = table.cursor.priority;
	assert.equal(nextDecision(table)!.options.filter((one) => one.announcement?.procedure.source.card === "Song of Totentanz").length, 1);
	pick(cast.id); checkpoint();
	assert.equal(table.log.length, log, "draft choices are ledger rows, not game events");
	assert.deepEqual([...table.things], physical); assert.equal(table.cursor.priority, priority);
	assert.equal(project(table, 1).announcement, undefined); assert.equal(project(table, "spectator").announcement, undefined);
	assert.equal(project(table, 0).announcement!.procedure.claim, song.claim);
	assert.throws(() => advance(table), /pending/);
	assert.throws(() => apply(table, "pass", "model", "chosen"), /No option pass/);
	pick("announce:x:2"); checkpoint(); pick("announce:cost:0");
	const pay = () => nextDecision(table)!.options.find((one) => one.id.startsWith("announce:pay:") && one.label.includes("Mountain"))!;
	pick(pay().id); checkpoint();
	const partial = focus(workFrame(table, 0), startingIntent(0));
	assert.deepEqual(partial.preparing, { stage: "mana", selected: [nextDecision(table)!.options.find((one) => one.id.startsWith("announce:unpay:"))!.label.replace("Undo selection: ", "")], remainingMana: 2, missingColors: [], ready: false });
	assert.match(question(partial, false).instructions, /Add to payment keeps those sources and selects one more/);
	assert.deepEqual([...table.things], physical, "partial mana selection has not tapped a land or moved the spell");
	assert.ok(!nextDecision(table)!.options.some((one) => one.id === "announce:confirm"));
	pick("announce:cancel");
	assert.equal(table.announcement, undefined); assert.deepEqual([...table.things], physical);
	assert.equal(table.cursor.priority, priority); assert.ok(begin("Song of Totentanz"));
	pick(begin("Song of Totentanz").id); pick("announce:x:2"); pick("announce:cost:0");
	for (let n = 0; n < 3; n++) pick(pay().id);
	checkpoint();
	const ready = nextDecision(table)!.options.find((one) => one.id === "announce:confirm")!.use!;
	assert.doesNotThrow(() => activationChanges(table, ready));
	assert.throws(() => activate(table, { ...ready, x: 3 }, { picked: "forged", offered: ["forged"], by: "model", why: "declared" }), /Finish or cancel/);
	pick("announce:confirm"); checkpoint();
	assert.equal(table.announcement, undefined); assert.equal(cardsIn(table, "stack")[0]!.ability!.x, 2);
	assert.equal(cardsIn(table, "battlefield").filter((one) => one.tapped).length, 3);
	passBoth(table); finish(table);
	assert.equal(cardsIn(table, "battlefield").filter((one) => one.token?.name === "Rat").length, 2);
	const voice = cardsIn(table, "battlefield").find((one) => one.card === "Voice of Victory")!;
	const when = { active: "self" as const, step: "precombat-main" as const, fromTurn: 1, throughTurn: 1 };
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "Strengthen Voice", guidance: "Keep the target explicit.", throughTurn: 1,
		steps: [{ label: "Strengthen Voice", when, action: { procedure: rush }, purpose: "Target Voice of Victory; use the remaining Mountain and Plains." }],
		phases: [{ when, guidance: "Strengthen Voice of Victory, then attack." }] } }], "rush-plan");
	const state = planState(workFrame(table, 0))!, revision = state.revision;
	assert.equal(state.announcements?.length ?? 0, 0, "the native use and matching plan recipe share one initial choice");
	pick(begin("Frontline Rush").id); checkpoint();
	assert.equal(table.ledger.at(-1)!.execution, undefined); assert.equal(table.ledger.at(-1)!.preparing!.plan, revision);
	assert.deepEqual(project(table, 0).done, [], "selecting a use has not executed the step");
	assert.match(JSON.stringify(focus(workFrame(table, 0), startingIntent(0)).plan), /Target Voice of Victory/);
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "Changed plan", guidance: "New future work.", steps: [], throughTurn: 1 } }], "later-plan");
	assert.match(JSON.stringify(focus(workFrame(table, 0), startingIntent(0)).plan), /Target Voice of Victory/, "the selected use retains its original execution policy");
	pick(`announce:target:${voice.id}@${voice.incarnation}`); checkpoint();
	pick("announce:cost:0");
	while (!nextDecision(table)!.options.some((one) => one.id === "announce:confirm")) {
		pick(nextDecision(table)!.options.find((one) => one.id.startsWith("announce:pay:"))!.id);
		const state = planState(workFrame(table, 0))!;
		assert.ok(state.due[0]!.candidates.every((one) => !one.id.startsWith("announce:unpay:")), "undoing a partial choice is not forward execution of the step");
		const packet = focus(workFrame(table, 0), startingIntent(0));
		assert.ok(packet.options.every((one) => !(one.notes ?? []).some((note) => note.includes("Target Voice of Victory"))), "the shared execution policy stays in the plan instead of repeating on every mana source");
	}
	pick("announce:confirm");
	assert.equal(table.ledger.at(-1)!.execution!.plan, revision);
	assert.equal(table.ledger.at(-1)!.execution!.step, 0);
	assert.deepEqual(project(table, 0).done, [], "the old use does not complete a step in the new plan");
	passBoth(table); finish(table);
	assert.equal(project(table, 0).objects!.find((one) => one.id === voice.id)!.traits!.power, 4);
	assert.equal(table.gaps.length, 0); assert.ok(table.ledger.every((one) => one.why !== "fallback"));
	const directory = mkdtempSync(join(tmpdir(), "staged-announcements-"));
	try {
		const universe = load("cards/standard.tsv");
		const header: Header = { id: "staged", seed: table.rng.seed, format: "standard", announcementsFrom: 0,
			seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: universe.path, generated: universe.generated, names: universe.names, faces: universe.faces },
			rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
		const journal = open(join(directory, "game.jsonl"), header); save(journal, table);
		assert.deepEqual(replay(journal.path, position).table, table);
		for (const [at, snapshot] of snapshots.entries()) {
			const path = join(directory, `clone-${at}.jsonl`); fork(journal.path, snapshot.version, `clone-${at}`, path);
			const clone = replay(path, position).table;
			assert.deepEqual(clone.announcement, snapshot.table.announcement);
			relive(clone, table.ledger.slice(snapshot.version), table.workLog.slice(clone.workLog.length));
			assert.deepEqual(clone, table, `continuation from announcement version ${snapshot.version}`);
		}
	} finally { rmSync(directory, { recursive: true, force: true }); }

	// The real loop also offers a use known only through a plan, asks the seat for
	// every part, and preserves old flat-menu decisions before its protocol boundary.
	const mixed = position(); delete mixed.announcementsFrom; main(mixed, 0);
	mixed.announcementsFrom = mixed.ledger.length;
	const boundary = structuredClone(mixed), version = mixed.ledger.length;
	editWork(mixed, 0, [{ do: "plan.put", plan: { objective: "Make two Rats", guidance: "Choose X = 2 and three Mountains.", throughTurn: 1,
		steps: [{ label: "Make two Rats", when, action: { procedure: song }, purpose: "Choose X = 2 and three Mountains." }] } }], "song-plan");
	const frames: string[] = [], stop = new Error("Cast reached the stack");
	const pilot: Player = { name: "staged pilot", observe(frame) { assert.equal(frame.view.announcement, undefined); }, close() {}, async answer(frame) {
		const options = frame.decision!.options;
		const option = options.find((one) => one.announcement?.prefix.startsWith("plan:")) ?? options.find((one) => one.id === "announce:x:2") ??
			options.find((one) => one.id === "announce:cost:0") ?? options.find((one) => one.id === "announce:confirm") ??
			options.find((one) => one.id.startsWith("announce:pay:") && one.label.includes("Mountain"));
		assert.ok(option, frame.decision!.question); frames.push(option.id);
		return { kind: "pick", option: option.id, actionId: `part-${frames.length}` };
	} };
	await assert.rejects(play(mixed, { 0: pilot, 1: pilot }, {}, { checkpoint() { if (cardsIn(mixed, "stack").length) throw stop; } }), (error) => error === stop);
	assert.equal(frames.length, 7); assert.equal(mixed.ledger.length - version, frames.length);
	assert.ok(mixed.ledger.slice(version).every((one) => one.by === "model" && one.why === "chosen"));
	assert.deepEqual(project(mixed, 0).done, [0]); assert.equal(mixed.gaps.length, 0);
	assert.deepEqual(relive(boundary, mixed.ledger.slice(version), mixed.workLog), mixed);
	const initial = position(); initial.announcementsFrom = version;
	assert.deepEqual(relive(initial, mixed.ledger, mixed.workLog), mixed, "a legacy prefix switches menus only at its recorded boundary");

	// Graveyard selection follows the selected targets and mana without spending
	// either. Only its final confirmation performs the accepted operation.
	const evidence = start(standard, [{ deck: deck("4c Control") }, { deck: deck("Mono-Red Aggro") }], "staged-evidence", undefined, { announcementsFrom: 0 });
	place(evidence, 0, "hand", "Deadly Cover-Up");
	const [large] = place(evidence, 0, "graveyard", "Jeskai Revelation");
	main(evidence, 0);
	commit(evidence, [{ do: "add-mana", who: 0, colors: ["B", "B", "C", "C", "C"] }], "game-setup");
	const procedure: Procedure = { source: { card: "Deadly Cover-Up", zones: ["hand"] }, timing: "spell", claim: "Collect evidence before the sweep",
		basis: "As an additional cost to cast this spell, you may collect evidence 6. ... Destroy all creatures.",
		cost: { exile: { graveyard: {}, totalManaValue: 6 } }, instructions: [{ do: "destroy", every: { types: ["creature"] } }] };
	editWork(evidence, 0, [{ do: "plan.put", plan: { objective: "Sweep", guidance: "Collect evidence first.", throughTurn: 1,
		steps: [{ label: "Sweep", when, action: { procedure }, purpose: "Exile Jeskai Revelation for the evidence payment." }] } }], "evidence-plan");
	const evidenceExecution = { plan: evidence.work[0]!.planned!, step: 0 };
	const before = structuredClone(evidence), from = evidence.ledger.length, use = announcementOffers(procedure, workFrame(evidence, 0), "evidence")[0]!;
	beginAnnouncement(evidence, use.announcement, { picked: use.option.id, offered: [use.option.id], by: "model", why: "declared", execution: evidenceExecution });
	apply(evidence, "announce:cost:0", "model", "chosen");
	while (!nextDecision(evidence)!.options.some((one) => one.id === "announce:confirm"))
		apply(evidence, nextDecision(evidence)!.options.find((one) => one.id.startsWith("announce:pay:"))!.id, "model", "chosen");
	apply(evidence, "announce:confirm", "model", "chosen");
	assert.ok(evidence.announcement); assert.ok(evidence.payment);
	assert.equal(planState(workFrame(evidence, 0))!.announcements?.length ?? 0, 0, "a graveyard subchoice cannot start another planned cast");
	assert.match(JSON.stringify(focus(workFrame(evidence, 0), startingIntent(0)).plan), /Exile Jeskai Revelation/);
	assert.deepEqual(evidence.things, before.things); assert.deepEqual(evidence.seats, before.seats);
	assert.equal(evidence.ledger.at(-1)!.execution, undefined);
	const pending = structuredClone(evidence), pendingAt = evidence.ledger.length;
	const cancelled = structuredClone(pending); apply(cancelled, "payment:cancel", "model", "chosen");
	assert.equal(cancelled.announcement, undefined); assert.equal(cancelled.payment, undefined);
	assert.deepEqual(cancelled.things, before.things); assert.deepEqual(cancelled.seats, before.seats);
	apply(evidence, `payment:pick:${large!.id}`, "model", "chosen");
	apply(evidence, "payment:done", "model", "chosen");
	assert.equal(evidence.announcement, undefined);
	assert.equal(large!.zone, "exile"); assert.equal(evidence.seats[0]!.pool.length, 0);
	assert.deepEqual(evidence.ledger.at(-1)!.execution, evidenceExecution);
	assert.deepEqual(relive(before, evidence.ledger.slice(from)), evidence);
	assert.deepEqual(relive(pending, evidence.ledger.slice(pendingAt)), evidence);

	// Optional targets are selected in the scope of the earlier group. Going back
	// discards later bindings, including an Equipment attached to the old target.
	const targets = start(standard, [{ deck: deck("Mono-Red Aggro") }, { deck: deck("Mono-Green Landfall") }], "staged-targets", undefined, { announcementsFrom: 0 });
	place(targets, 0, "hand", "Fiery Annihilation"); place(targets, 0, "battlefield", "Mountain", "Mountain", "Mountain");
	const elves = place(targets, 1, "battlefield", "Llanowar Elves", "Llanowar Elves");
	commit(targets, [{ do: "token", id: "equipment", controller: 1, spec: { name: "Equipment", types: ["artifact"], subtypes: ["Equipment"], colors: [] } },
		{ do: "attach", what: "equipment", to: { id: elves[0]!.id, incarnation: elves[0]!.incarnation } }], "game-setup");
	main(targets, 0);
	const fire: Procedure = { source: { card: "Fiery Annihilation", zones: ["hand"] }, timing: "spell", claim: "Fiery Annihilation's target selection",
		basis: targets.printed["Fiery Annihilation"]!.oracle,
		targets: [{ object: { types: ["creature"] } }, { object: { subtypes: ["Equipment"], attachedTo: "target:0" }, upTo: true }],
		instructions: [{ do: "damage", to: "target:0", amount: 5 }, { do: "move", what: "target:1", to: "exile", reason: "exile" }] };
	const variants = offered(targets, fire), draft = announcementOffers(fire, workFrame(targets, 0), "fire")[0]!;
	const previous = structuredClone(targets), first = targets.ledger.length;
	beginAnnouncement(targets, draft.announcement, { picked: draft.option.id, offered: [draft.option.id], by: "model", why: "declared" });
	const take = (id: string) => apply(targets, id, "model", "chosen");
	take(`announce:target:${elves[0]!.id}@${elves[0]!.incarnation}`);
	assert.ok(nextDecision(targets)!.options.some((one) => one.id === "announce:target:equipment@0"));
	assert.ok(nextDecision(targets)!.options.some((one) => one.id === "announce:targets-done"));
	take("announce:back"); take("announce:remove-target:0");
	take(`announce:target:${elves[1]!.id}@${elves[1]!.incarnation}`);
	assert.ok(!nextDecision(targets)!.options.some((one) => one.id.startsWith("announce:target:")));
	take("announce:targets-done"); take("announce:cost:0");
	for (let n = 0; n < 3; n++) take(nextDecision(targets)!.options.find((one) => one.id.startsWith("announce:pay:"))!.id);
	const complete = nextDecision(targets)!.options.find((one) => one.id === "announce:confirm")!.use!;
	assert.ok(variants.some((one) => isDeepStrictEqual(one.activation, complete)), "a staged dependent-target use preserves the complete accepted operation");
	take("announce:confirm"); assert.deepEqual(relive(previous, targets.ledger.slice(first)), targets);

	// A permission's alternative price and selected face remain part of the use.
	const permissions = start(standard, [{ deck: deck("Izzet Aggro") }, { deck: deck("Mono-Red Aggro") }], "staged-faces", undefined, { announcementsFrom: 0 });
	const card = "Scalding Viper // Steam Clean", [viper] = place(permissions, 0, "exile", card);
	place(permissions, 0, "battlefield", "Mountain", "Mountain");
	const creature = establish(permissions, 1, "Hired Claw", []);
	main(permissions, 0);
	for (const mana of ["{1}", "{2}"]) commit(permissions, [{ do: "note", note: { kind: "permit", by: 0, who: 0, fromTurn: 0, until: "indefinite",
		on: { id: viper!.id, incarnation: viper!.incarnation }, mana, leavesStack: "exile" } }], "game-setup");
	const adventure: Procedure = { source: { card, zones: ["exile"] }, face: 1, timing: "spell", claim: "Cast Steam Clean", basis: permissions.printed[card]!.faces![1]!.oracle,
		targets: [{ object: { zones: ["battlefield"], not: { types: ["land"] } } }], instructions: [{ do: "move", what: "target:0", to: "hand", reason: "bounce" }] };
	const choices = announcementOffers(adventure, workFrame(permissions, 0), "adventure"), legacy = offered(permissions, adventure);
	assert.equal(choices.length, 2); assert.ok(choices.every((one) => one.option.label.includes("Steam Clean") && one.option.shows!.includes("instead of the mana cost")));
	const original = structuredClone(permissions), began = permissions.ledger.length;
	beginAnnouncement(permissions, choices[0]!.announcement, { picked: choices[0]!.option.id, offered: choices.map((one) => one.option.id), by: "model", why: "declared" });
	apply(permissions, `announce:target:${creature.id}@${creature.incarnation}`, "model", "chosen");
	apply(permissions, "announce:cost:0", "model", "chosen");
	apply(permissions, nextDecision(permissions)!.options.find((one) => one.id.startsWith("announce:pay:"))!.id, "model", "chosen");
	const accepted = nextDecision(permissions)!.options.find((one) => one.id === "announce:confirm")!.use!;
	assert.ok(legacy.some((one) => isDeepStrictEqual(one.activation, accepted)));
	apply(permissions, "announce:confirm", "model", "chosen");
	assert.equal(viper!.face, 1); assert.equal(viper!.ability!.leavesStack, "exile");
	assert.deepEqual(relive(original, permissions.ledger.slice(began)), permissions);

	const abilities = start(standard, [{ deck: deck("Mono-Red Aggro") }, { deck: deck("Mono-Green Landfall") }], "staged-activation", undefined, { announcementsFrom: 0 });
	const grow = example("Grow Hired Claw");
	const claw = establish(abilities, 0, "Hired Claw", [{ kind: "activated", basis: grow.basis, cost: grow.cost!, if: grow.if, limit: grow.limit, effect: { instructions: grow.instructions } }]);
	place(abilities, 0, "battlefield", "Mountain", "Mountain"); main(abilities, 0);
	assert.ok(!nextDecision(abilities)!.options.some((one) => one.announcement?.procedure.source.registered === grow.basis));
	commit(abilities, [{ do: "change-life", who: 1, amount: -1, reason: "resolve" }], "resolve");
	const registered = nextDecision(abilities)!.options.find((one) => one.announcement?.procedure.source.registered === grow.basis)!;
	assert.ok(registered);
	const old = structuredClone(abilities), at = abilities.ledger.length;
	apply(abilities, registered.id, "model", "chosen"); apply(abilities, "announce:cost:0", "model", "chosen");
	for (let n = 0; n < 2; n++) apply(abilities, nextDecision(abilities)!.options.find((one) => one.id.startsWith("announce:pay:"))!.id, "model", "chosen");
	apply(abilities, "announce:confirm", "model", "chosen");
	passBoth(abilities); finish(abilities); assert.equal(claw.counters["+1/+1"], 1);
	assert.ok(!nextDecision(abilities)!.options.some((one) => one.announcement?.procedure.source.registered === grow.basis));
	assert.deepEqual(relive(old, abilities.ledger.slice(at)), abilities);
});
