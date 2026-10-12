/** A manifested identity stays private while its creature participates in ordinary play.
 * Past 150 lines to keep entry, combat, departure, special payment and saved continuation in one invariant. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { project, describe } from "../src/core/view.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { matches, tableWorld, viewWorld, happened } from "../src/core/selectors.ts";
import { preparation } from "../src/core/readiness.ts";
import { unlocks } from "../src/core/rooms.ts";
import { faceUpUses } from "../src/core/manifest.ts";
import { activationChanges, checkProcedure } from "../src/core/procedures.ts";
import { tokenCopy } from "../src/core/copies.ts";
import { fork, open, replay, relive, save, type Header } from "../src/core/journal.ts";
import { load } from "../src/core/cards.ts";
import type { Registration } from "../src/core/language.ts";
import { quiet, main, establish, place, pack, announce, passBoth, step, finish, offered } from "./play.ts";

const ship = "Unidentified Hovership", hidden = "Nova Hellkite";
const nova: Registration[] = [
	{ kind: "continuous", basis: "Flying, haste", affects: { is: "this" }, change: { words: ["flying", "haste"] } },
	{ kind: "watch", basis: "When this creature enters, it deals 1 damage to target creature an opponent controls.", event: { on: "enters", of: { is: "this" } },
		effect: { targets: [{ object: { types: ["creature"], controller: "opponent" } }], instructions: [{ do: "damage", to: "target:0", amount: 1 }] } },
];
function position() {
	const table = start(standard, [{ deck: alpha(deck("Jeskai Artifacts")) }, { deck: alpha(deck("Mono-Red Aggro")) }], "manifest", undefined, { announcementsFrom: 0 });
	place(table, 1, "exile", hidden, "Mountain");
	establish(table, 0, ship);
	editWork(table, 1, [{ do: "package.put", package: { card: hidden, registers: nova } }], "manifest-inventory");
	return table;
}
function resolveDread(table: Table, who: 0 | 1, selected: string) {
	const permanent = cardsIn(table, "battlefield", 0).find(one => one.card === ship)!;
	// A fixture exposes the shared operation and its bound result; the printed route is checked below.
	const procedure = checkProcedure({ source: { zones: ["battlefield"], controller: "self", refs: [{ id: permanent.id, incarnation: permanent.incarnation }] },
		claim: "Manifest fixture", basis: "Fixture for manifest dread and its bound result", timing: "stack", cost: {}, instructions: [
			{ do: "keyword", name: "manifest-dread", who: who ? "opponent" : "you", as: "made" },
			{ do: "counters", on: "bound:made", kind: "+1/+1", amount: 1 },
		] });
	announce(table, procedure); passBoth(table); step(table); step(table);
	const beforeChoice = structuredClone(table), fromChoice = table.ledger.length;
	const choice = nextDecision(table)!; assert.equal(choice.seat, who);
	assert.ok(!choice.options.some(one => one.id.endsWith(":done")), "one card must be selected when one exists");
	for (const viewer of [0, 1, "spectator"] as const) for (const object of table.resolution!.bound[Object.keys(table.resolution!.bound).find(one => one.startsWith("keyword-looked"))!]!.objects)
		assert.equal(project(table, viewer).objects!.some(one => one.id === object.id), viewer === who);
	apply(table, choice.options.find(one => one.id.endsWith(`:${selected}`))!.id, "model", "chosen");
	step(table);
	assert.equal(table.waiting.length, 0);
	assert.equal(table.log.some(receipt => receipt.changes.some(change => change.do === "keyword")), false, "the remainder has not moved yet");
	const middle = structuredClone(table), at = table.ledger.length;
	step(table); assert.equal(table.log.filter(receipt => receipt.changes.some(change => change.do === "keyword")).length, 1);
	assert.equal(table.resolution!.bound.made!.objects[0]!.incarnation, table.things.get(selected)!.incarnation);
	finish(table);
	assert.deepEqual(relive(beforeChoice, table.ledger.slice(fromChoice)), table);
	assert.deepEqual(relive(middle, table.ledger.slice(at)), table);
}

test("manifest preserves public creature rules and private identity through selection, special payment, combat, copying and replay", () => {
	const table = position(); main(table, 0);
	const [creature, land] = cardsIn(table, "exile", 1).sort((a, b) => Number(a.card === "Mountain") - Number(b.card === "Mountain"));
	commit(table, [{ do: "move", what: land!.id, to: "library", reason: "game-setup" }, { do: "move", what: creature!.id, to: "library", reason: "game-setup" }], "game-setup");
	resolveDread(table, 1, creature!.id);
	assert.equal(land!.zone, "graveyard"); assert.equal(creature!.zone, "battlefield"); assert.equal(creature!.faceDown, true); assert.equal(creature!.manifested, true);
	assert.equal(creature!.registrations, undefined); assert.equal(creature!.counters["+1/+1"], 1);
	const body = characteristics(table, creature!)!;
	assert.equal(body.name, ""); assert.deepEqual(body.colors, []); assert.deepEqual(body.types, ["creature"]); assert.deepEqual(body.subtypes, []);
	assert.equal(body.power, 3); assert.equal(body.toughness, 3); assert.equal(body.manaValue, 0); assert.deepEqual(body.words, []);
	const movement = table.log.find(receipt => receipt.changes.some(change => change.do === "move" && change.faceDown === "manifest"))!;
	for (const viewer of [0, 1, "spectator"] as const) {
		const view = project(table, viewer, 0), object = view.objects!.find(one => one.id === creature!.id)!;
		assert.equal(object.card, viewer === 1 ? hidden : undefined); assert.deepEqual(object.traits, body); assert.equal(object.summoningSick, true);
		assert.equal(matches({ world: viewWorld(view), controller: 0 }, object, { types: ["creature"], toughness: { atMost: 5 } }), true);
		assert.equal(matches({ world: viewWorld(view), controller: 0 }, object, { name: hidden }), false);
		if (viewer !== 1) { assert.ok(!JSON.stringify(object).includes(hidden)); assert.ok(!describe(table, movement, viewer).includes(hidden)); }
	}
	assert.equal(preparation(workFrame(table, 1)).length, 0);
	const copied = tokenCopy(table, creature!); assert.ok("spec" in copied);
	assert.deepEqual(copied.spec, { name: "", types: ["creature"], colors: [], power: 2, toughness: 2 });
	commit(table, [{ do: "token", id: "manifest-copy", controller: 0, spec: copied.spec }], "resolve");
	assert.equal(table.things.get("manifest-copy")!.faceDown, false); assert.equal(faceUpUses(workFrame(table, 0)).length, 0);
	const shipObject = cardsIn(table, "battlefield", 0).find(one => one.card === ship)!;
	const faceDownShip = structuredClone(table);
	commit(faceDownShip, [{ do: "move", what: shipObject.id, to: "exile", reason: "game-setup" }, { do: "move", what: shipObject.id, to: "battlefield", faceDown: "manifest", reason: "game-setup" }], "game-setup");
	assert.equal(faceUpUses(workFrame(faceDownShip, 0)).length, 0); assert.equal(characteristics(faceDownShip, faceDownShip.things.get(shipObject.id)!)!.words.length, 0);
	const bounced = structuredClone(table);
	commit(bounced, [{ do: "move", what: creature!.id, to: "hand", reason: "bounce" }], "bounce");
	assert.ok(describe(bounced, bounced.log.at(-1)!, "spectator").includes(hidden));
	assert.ok(!describe(bounced, movement, "spectator").includes(hidden));
	assert.equal(bounced.things.get(creature!.id)!.manifested, undefined);
	const ended = structuredClone(table); commit(ended, [{ do: "end-game", who: 0, result: "win" }], "state-based-action");
	assert.ok(describe(ended, ended.log.at(-1)!, "spectator").includes(hidden));
	main(table, 1, 2, "begin-combat");
	for (let guard = 0; guard < 20; guard++) {
		const decision = nextDecision(table);
		if (table.cursor.steps[0] === "declare-attackers" && decision?.situation === "turn-based") break;
		if (decision) apply(table, quiet(decision.options).id, "model", "chosen"); else advance(table);
	}
	const attackers = nextDecision(table)!;
	assert.equal(attackers.situation, "turn-based");
	assert.ok(!JSON.stringify(attackers.options).includes(hidden), "combat menus identify the public creature");
	apply(table, attackers.options.find(one => one.objects?.some(ref => ref.id === creature!.id))!.id, "model", "chosen");
	apply(table, "attack:done", "model", "chosen");
	const combatHistory = project(table, 0).history!.find(one => one.kind === "attacked")!;
	assert.ok(!JSON.stringify(combatHistory).includes(hidden));
	main(table, 1, 2, "postcombat-main");
	assert.equal(table.seats[0]!.life, 17, "the manifested 3/3 deals combat damage");
	commit(table, [{ do: "add-mana", who: 1, colors: ["R", "R", "C", "C", "C"] }], "game-setup");
	const special = faceUpUses(workFrame(table, 1))[0]!.procedure;
	const incarnation = creature!.incarnation, entered = creature!.entered, tapped = creature!.tapped;
	const cast = offered(table, special)[0]!; assert.ok(cast);
	const wrong = structuredClone(cast.activation); wrong.cost.generic--;
	assert.throws(() => activationChanges(table, wrong), /exact printed mana cost|payment/);
	const pending = structuredClone(table), at = table.ledger.length;
	const begin = nextDecision(table)!.options.find(one => one.announcement?.procedure.special === "turn-face-up")!;
	assert.ok(begin); apply(table, begin.id, "model", "chosen");
	assert.equal(project(table, 0).announcement, undefined);
	const beforeCancel = structuredClone(table.things);
	apply(table, "announce:cancel", "model", "chosen"); assert.deepEqual(table.things, beforeCancel);
	apply(table, nextDecision(table)!.options.find(one => one.announcement?.procedure.special === "turn-face-up")!.id, "model", "chosen");
	apply(table, "announce:cost:0", "model", "chosen");
	const paying = structuredClone(table), payingAt = table.ledger.length;
	apply(table, nextDecision(table)!.options.find(one => one.use)!.id, "model", "chosen");
	assert.equal(creature!.faceDown, false); assert.equal(creature!.manifested, undefined); assert.equal(creature!.incarnation, incarnation);
	assert.equal(creature!.entered, entered); assert.equal(creature!.tapped, tapped); assert.equal(creature!.counters["+1/+1"], 1);
	assert.equal(table.waiting.length, 0, "turning face up does not repeat Hellkite's entry ability");
	assert.ok(characteristics(table, creature!)!.words.includes("haste"));
	assert.equal(cardsIn(table, "stack").length, 0); assert.equal(happened(table).filter(one => one.kind === "cast").length, 0);
	assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
	assert.deepEqual(relive(paying, table.ledger.slice(payingAt)), table);
	assert.ok(!JSON.stringify(project(table, 0).history!.find(one => one.kind === "attacked")).includes(hidden), "a later reveal cannot rename the earlier face-down attacker");
	edges();
	linkedCounts();
	linkedRoute();
});

function linkedPosition() {
	const table = start(standard, [{ deck: alpha(deck("Jeskai Artifacts")) }, { deck: alpha(deck("Mono-Red Aggro")) }], "linked-manifest", undefined, { announcementsFrom: 0 });
	place(table, 0, "hand", ship); place(table, 0, "battlefield", "Plains", "Plains", "Plains");
	establish(table, 1, "Hired Claw", []);
	const library = cardsIn(table, "library", 1), creature = library.find(one => one.card === hidden)!, land = library.find(one => one.card === "Mountain")!;
	const rest = library.filter(one => one !== creature && one !== land);
	commit(table, [{ do: "order", who: 1, whose: 1, position: "top", cards: [...rest.slice(0, 7), creature, land, ...rest.slice(7)].map(one => ({ id: one.id, incarnation: one.incarnation })) }], "game-setup");
	editWork(table, 0, [{ do: "package.put", package: { card: ship, assessed: true, printedCast: true, registers: pack(ship) } }], "hovership-standing");
	editWork(table, 1, [{ do: "package.put", package: { card: hidden, registers: nova } }], "hellkite-standing");
	return table;
}

// Each fixture below extends the same invariant with Hovership's actual linked source and a saved private choice.
function linkedRoute() {
	const table = linkedPosition(); main(table, 0);
	const permanent = cardsIn(table, "hand", 0).find(one => one.card === ship)!;
	const target = cardsIn(table, "battlefield", 1)[0]!;
	const cast = checkProcedure({ claim: "Cast Unidentified Hovership", basis: "Flying", source: { card: ship, zones: ["hand"], controller: "self" }, timing: "spell", instructions: [] });
	announce(table, cast); passBoth(table); finish(table);
	const entry = nextDecision(table)!; assert.equal(entry.situation, "trigger-order");
	assert.ok(entry.options.some(one => !one.objects?.some(ref => ref.id === target.id)), "the printed entry target is optional");
	apply(table, entry.options.find(one => one.objects?.some(ref => ref.id === target.id))!.id, "model", "chosen");
	passBoth(table); finish(table); assert.equal(target.zone, "exile");
	const depart = checkProcedure({ claim: "Sacrifice the fixture Vehicle", basis: "Fixture sacrifice to exercise its printed leaves trigger", source: { zones: ["battlefield"], controller: "self", refs: [{ id: permanent.id, incarnation: permanent.incarnation }] },
		timing: "stack", cost: { sacrifice: "this" }, instructions: [] });
	announce(table, depart); assert.equal(permanent.zone, "graveyard");
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
	step(table); step(table); step(table); // Iterate linked exile, begin dread, inspect two.
	const pending = structuredClone(table), at = table.ledger.length;
	const choice = nextDecision(table)!; assert.equal(choice.seat, target.owner);
	const selected = choice.options.find(one => one.label.includes(hidden))!; assert.ok(selected);
	assert.ok(!project(table, 0).objects!.some(one => one.zone === "library" && one.card === hidden));
	apply(table, selected.id, "model", "chosen"); step(table); finish(table);
	assert.equal(target.zone, "exile", "Hovership never returns the exiled card");
	const creature = cardsIn(table, "battlefield", 1).find(one => one.manifested)!;
	assert.equal(creature.card, hidden); assert.equal(cardsIn(table, "graveyard", 1).filter(one => one.card === "Mountain").length, 1);
	passBoth(table); finish(table); // The fixture's empty activation was below the leaves trigger.
	assert.deepEqual(relive(structuredClone(pending), table.ledger.slice(at)), table);
	const dir = mkdtempSync(join(tmpdir(), "manifest-"));
	try {
		const universe = load("cards/standard.tsv");
		const header: Header = { id: "manifest", seed: table.rng.seed, format: "standard", announcementsFrom: 0,
			seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: universe.path, generated: universe.generated, names: universe.names, faces: universe.faces },
			rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
		const journal = open(join(dir, "game.jsonl"), header); save(journal, table);
		assert.deepEqual(replay(journal.path, linkedPosition).table, table);
		const path = join(dir, "clone.jsonl"); fork(journal.path, at, "manifest-clone", path);
		const clone = replay(path, linkedPosition).table; assert.deepEqual(clone.resolution, pending.resolution);
		assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
	} finally { rmSync(dir, { recursive: true, force: true }); }
	// The physical creature is selectable by the opponent's rules reader despite its hidden identity.
	assert.equal(matches({ world: tableWorld(table), controller: 0 }, creature, { types: ["creature"], controller: "opponent" }), true);
}

function edges() {
	for (const size of [0, 1, 2]) for (const chosen of size === 2 ? [0, 1] : [0]) {
		const table = position(); main(table, 0);
		const library = cardsIn(table, "library", 0), kept = library.slice(0, size), vessel = cardsIn(table, "battlefield", 0)[0]!;
		commit(table, library.filter(one => !kept.includes(one)).map(one => ({ do: "move" as const, what: one.id, to: "outside" as const, reason: "game-setup" as const })), "game-setup");
		const before = structuredClone(table), at = table.ledger.length;
		const procedure = checkProcedure({ claim: "Manifest a short library", basis: "Fixture for bounded library completion", timing: "stack", source: { zones: ["battlefield"], controller: "self", refs: [{ id: vessel.id, incarnation: vessel.incarnation }] }, cost: {},
			instructions: [{ do: "keyword", name: "manifest-dread", who: "you" }] });
		announce(table, procedure); passBoth(table);
		while (table.resolution) {
			const pending = nextDecision(table)!;
			if (pending.options.length > 1) apply(table, pending.options.find(one => one.id.endsWith(`:${kept[chosen]!.id}`))!.id, "model", "chosen");
			else step(table);
		}
		finish(table);
		assert.equal(cardsIn(table, "battlefield", 0).filter(one => one.manifested).length, size ? 1 : 0);
		assert.equal(cardsIn(table, "graveyard", 0).length, Math.max(0, size - 1));
		assert.equal(table.seats[0]!.marks["drew-from-empty"], undefined); assert.equal(table.outcome, null);
		assert.equal(table.log.filter(receipt => receipt.changes.some(change => change.do === "keyword" && change.name === "manifest-dread")).length, 1);
		assert.deepEqual(relive(before, table.ledger.slice(at)), table);
	}
	const room = start(standard, [{ deck: alpha(deck("4c Control")) }, { deck: alpha(deck("Mono-Red Aggro")) }], "manifested-room");
	const roomCard = cardsIn(room, "library", 0).find(one => one.card === "Unholy Annex // Ritual Chamber")!;
	commit(room, [{ do: "move", what: roomCard.id, to: "battlefield", faceDown: "manifest", reason: "game-setup" }], "game-setup");
	main(room, 0); commit(room, [{ do: "add-mana", who: 0, colors: ["B", "B", "B", "B", "B", "B"] }], "game-setup");
	assert.equal(unlocks(room, workFrame(room, 0)).length, 0, "a face-down Room has no door abilities");
	assert.equal(roomCard.doors, undefined); assert.equal(faceUpUses(workFrame(room, 0)).length, 0);
	const table = position(); main(table, 0);
	const creature = cardsIn(table, "exile", 1).find(one => one.card === hidden)!, vessel = cardsIn(table, "battlefield", 0)[0]!;
	commit(table, [{ do: "move", what: creature.id, to: "battlefield", faceDown: "manifest", reason: "resolve" },
		{ do: "add-mana", who: 1, colors: ["C", "C", "C", "R", "R"] }], "game-setup");
	const procedure = checkProcedure({ claim: "Hold a fixture ability on the stack", basis: "Fixture for responding with a special action", timing: "stack", cost: {},
		source: { zones: ["battlefield"], controller: "self", refs: [{ id: vessel.id, incarnation: vessel.incarnation }] }, instructions: [] });
	announce(table, procedure); apply(table, "pass", "model", "chosen");
	assert.equal(table.cursor.active, 0); assert.equal(table.cursor.priority, 1); assert.equal(cardsIn(table, "stack").length, 1);
	const before = structuredClone(table), at = table.ledger.length;
	const action = nextDecision(table)!.options.find(one => one.announcement?.procedure.special === "turn-face-up")!; assert.ok(action);
	apply(table, action.id, "model", "chosen"); apply(table, "announce:cost:0", "model", "chosen");
	apply(table, nextDecision(table)!.options.find(one => one.use)!.id, "model", "chosen");
	assert.equal(creature.faceDown, false); assert.equal(table.waiting.length, 0); assert.equal(cardsIn(table, "stack").length, 1);
	assert.equal(table.cursor.priority, 1); assert.deepEqual(relive(before, table.ledger.slice(at)), table);
}

function linkedCounts() {
	for (const count of [0, 2]) {
		const table = position(); main(table, 0); const vessel = cardsIn(table, "battlefield", 0)[0]!;
		const linked = count ? [...place(table, 0, "exile", "Plains"), ...place(table, 1, "exile", "Hired Claw")] : [];
		for (const object of linked) commit(table, [{ do: "note", note: { kind: "link", by: 0, until: "indefinite", on: { id: object.id, incarnation: object.incarnation }, source: { id: vessel.id, incarnation: vessel.incarnation } } }], "game-setup");
		commit(table, [{ do: "move", what: vessel.id, to: "graveyard", reason: "destroy" }], "destroy");
		const before = structuredClone(table), at = table.ledger.length;
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
		while (table.resolution) apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
		finish(table);
		const events = table.log.flatMap(receipt => receipt.changes.flatMap(change => change.do === "keyword" && change.name === "manifest-dread" ? [change] : []));
		assert.equal(events.length, count);
		if (count) assert.deepEqual(events.map(one => one.who).sort(), [0, 1]);
		assert.ok(linked.every(one => one.zone === "exile"));
		assert.deepEqual(relive(before, table.ledger.slice(at)), table);
	}
}
