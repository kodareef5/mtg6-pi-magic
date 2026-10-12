/** A face changes available characteristics, never the number or identity of cards.
 * Past 150 lines to keep face selection, resolution and journal parity in one invariant. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { shipped, facts } from "../src/core/printed.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { assessmentProblems } from "../src/core/assessment.ts";
import { printedCast, checkProcedure } from "../src/core/procedures.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { relive, open, save, replay, fork, type Header } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { preparation } from "../src/core/readiness.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import type { Procedure, Package } from "../src/core/language.ts";
import { main, place, announce, offered, passBoth, finish, step, example } from "./play.ts";

const viper = "Scalding Viper // Steam Clean", dragon = "Twinmaw Stormbrood // Charring Bite", hero = "Jennifer Walters // The Sensational She-Hulk";
const build = (name: string) => start(standard, [{ name: "Faces", deck: deck(name) }, { name: "Red", deck: deck("Mono-Red Aggro") }], "faces-0");
const spell = (table: ReturnType<typeof build>, card: string): Procedure => ({ face: 1, source: { card, zones: ["hand", "exile", "graveyard"], controller: "any" },
	claim: `Cast ${table.printed[card]!.faces![1]!.name}`, basis: table.printed[card]!.faces![1]!.oracle, timing: "spell",
	targets: [{ object: { zones: ["battlefield"], not: { types: ["land"] } } }],
	instructions: [{ do: "move", what: "target:0", to: "hand", reason: "bounce" }] });

test("a selected face owns casting characteristics, resolution destination and incarnation-scoped permission", () => {
	for (const lost of [false, true]) {
		const table = build("Izzet Aggro");
		const object = place(table, 0, "hand", viper)[0]!;
		place(table, 0, "battlefield", "Steam Vents", "Mountain");
		const target = place(table, 1, "battlefield", "Hired Claw")[0]!;
		main(table, 0);
		const original = structuredClone(table), before = table.ledger.length, cast = spell(table, viper);
		assert.equal(facts(table, object)!.name, "Scalding Viper");
		assert.equal(characteristics(table, object)!.manaValue, 2);
		assert.deepEqual(characteristics(table, object)!.colors, ["R"]);
		assert.ok(offered(table, cast).every((one) => one.activation.cost.colors.join("") === "U"));
		assert.ok(offered(table, cast).every((one) => one.option.label.includes("Steam Clean")));
		announce(table, cast, (one) => !!one.activation.targets[0]?.[0] && "id" in one.activation.targets[0][0] && one.activation.targets[0][0].id === target.id);
		assert.equal(facts(table, object)!.name, "Steam Clean");
		assert.deepEqual(characteristics(table, object)!.types, ["sorcery"]);
		assert.deepEqual(characteristics(table, object)!.colors, ["U"]);
		if (lost) commit(table, [{ do: "move", what: target.id, to: "graveyard", reason: "destroy" }], "destroy");
		passBoth(table); finish(table);
		assert.equal(object.zone, lost ? "graveyard" : "exile");
		assert.equal(object.face, undefined);
		assert.equal(facts(table, object)!.name, "Scalding Viper");
		assert.equal(characteristics(table, object)!.manaValue, 2);
		assert.equal(table.notes.some((note) => note.kind === "permit" && note.on.id === object.id), !lost);
		if (lost) continue;
		const rebuilt = relive(structuredClone(original), table.ledger.slice(before));
		assert.deepEqual(rebuilt.things, table.things);
		assert.deepEqual(rebuilt.notes, table.notes);
		assert.deepEqual(rebuilt.log, table.log);
		assert.equal(offered(table, cast).length, 0, "Adventure permission never permits the Adventure again");
		commit(table, [{ do: "untap", what: [...table.things.values()].find((one) => one.zone === "battlefield" && one.card === "Mountain")!.id }], "game-setup");
		const vent = [...table.things.values()].find((one) => one.zone === "battlefield" && one.card === "Steam Vents")!;
		commit(table, [{ do: "untap", what: vent.id }], "game-setup");
		const normal = printedCast(viper, table.printed[viper]!, 0);
		assert.ok(offered(table, normal).length, "the same card can return as its creature face");
		announce(table, normal); passBoth(table); finish(table);
		assert.equal(object.zone, "battlefield");
		assert.deepEqual(characteristics(table, object)!.types, ["creature"]);
		assert.equal(table.notes.some((note) => note.kind === "permit" && note.on.id === object.id), false);
	}
	for (const lost of [false, true]) {
		const table = build("Boros Dragons"), object = place(table, 0, "hand", dragon)[0]!;
		place(table, 0, "battlefield", "Mountain", "Plains");
		const target = place(table, 1, "battlefield", "Hired Claw")[0]!;
		main(table, 0);
		const cast = { ...spell(table, dragon), targets: [{ object: { types: ["creature"], not: { words: ["flying"] } } }],
			instructions: [{ do: "damage" as const, to: "target:0", amount: 5 }] };
		const original = structuredClone(table), before = table.ledger.length;
		assert.equal(characteristics(table, object)!.manaValue, 6);
		announce(table, cast);
		assert.equal(characteristics(table, object)!.manaValue, 2, "Omen's cost determines the spell's value");
		if (lost) commit(table, [{ do: "move", what: target.id, to: "graveyard", reason: "destroy" }], "destroy");
		passBoth(table); finish(table);
		assert.equal(object.zone, lost ? "graveyard" : "library", "an Omen shuffles only after successful resolution");
		if (!lost) {
			const rebuilt = relive(structuredClone(original), table.ledger.slice(before));
			assert.deepEqual(rebuilt.things, table.things);
			assert.deepEqual(rebuilt.rng, table.rng);
		}
	}
});

test("printed faces are public source data but active faces and accepted claims preserve source and journal scope", () => {
	const table = build("Bant Airbending Combo"), object = place(table, 0, "hand", hero)[0]!;
	place(table, 0, "battlefield", "Plains", "Temple Garden", "Temple Garden", "Temple Garden", "Breeding Pool", "Hallowed Fountain");
	main(table, 0);
	assert.ok(!project(table, 1).objects!.some((one) => one.id === object.id));
	assert.equal(project(table, 1).printed![hero]!.faces!.length, 2, "registered names expose both printed faces, never hidden objects");
	const cast = printedCast(hero, table.printed[hero]!, 1);
	assert.ok(offered(table, cast).length);
	announce(table, cast); passBoth(table); finish(table);
	assert.equal(object.face, 1);
	assert.equal(characteristics(table, object)!.power, 6);
	assert.equal(characteristics(table, object)!.name, "The Sensational She-Hulk");
	commit(table, [{ do: "move", what: object.id, to: "hand", reason: "bounce" }], "bounce");
	assert.equal(characteristics(table, object)!.power, 2);
	const transform = "Aang, Swift Savior // Aang and La, Ocean's Fury";
	assert.throws(() => printedCast(transform, table.printed[transform]!, 1), /needs a prepared/);
	const hidden = place(table, 0, "hand", transform)[0]!;
	table.work[0] = { revision: 0, packages: [{ card: transform, registers: [], deferred: [{ face: 1, claim: "Invalid back cast", basis: "fixture", timing: "spell", source: { card: transform, zones: ["hand"], controller: "any" } }] }] };
	assert.equal(preparation(workFrame(table, 0)).length, 0, "an uncastable back face creates no false readiness obligation");
	assert.equal(hidden.zone, "hand");
	const printed = shipped().cards.get(dragon)!;
	const pack: Package = { card: dragon, printedCast: true, registers: [
		{ face: 0, kind: "continuous", basis: "Flying", affects: { is: "this" }, change: { words: ["flying"] } },
		{ face: 0, kind: "watch", basis: "When this creature enters, you gain 5 life.", event: { on: "enters", of: { is: "this" } }, effect: { instructions: [{ do: "life", who: "you", amount: 5 }] } },
	], deferred: [{ face: 1, claim: "Charring Bite", basis: printed.faces![1]!.oracle, source: { card: dragon, zones: ["hand", "graveyard", "exile"], controller: "any" }, timing: "spell" }] };
	const source = build("Boros Dragons").printed[dragon]!;
	assert.deepEqual(assessmentProblems(source, pack), []);
	assert.ok(assessmentProblems(source, { ...pack, deferred: [] }).some((one) => one.includes("face 1")));
	assert.ok(assessmentProblems(source, { ...pack, registers: pack.registers.map(({ face, ...one }) => one) }).some((one) => one.includes("must name")));
	const dir = mkdtempSync(join(tmpdir(), "magic-faces-"));
	try {
		const original = build("Boros Dragons"), universe = shipped();
		const header: Header = { id: "faces", format: "standard", seed: original.rng.seed, seats: original.seats.map(({ id, name, deck }) => ({ id, name, deck })),
			cards: { path: universe.path, generated: universe.generated, faces: universe.faces }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
		main(original, 0);
		const journal = open(join(dir, "parent.jsonl"), header); save(journal, original);
		fork(journal.path, original.ledger.length, "child", join(dir, "child.jsonl"));
		const again = replay(join(dir, "child.jsonl"), () => build("Boros Dragons"), undefined, { cards: header.cards, rules: header.rules }).table;
		assert.deepEqual(again.things, original.things);
		assert.deepEqual(again.printed, original.printed);
		assert.throws(() => replay(journal.path, () => build("Boros Dragons"), undefined, { cards: { ...header.cards, faces: { path: "fixture", sha256: "changed" } }, rules: header.rules }), /face data differs/);
		const legacy = open(join(dir, "legacy.jsonl"), { ...header, cards: { path: universe.path, generated: universe.generated } });
		assert.equal(replay(legacy.path, () => build("Boros Dragons"), 0).table.printed[dragon]!.faces, undefined);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test("unlocking pays as a special action and only the unlocked Room faces supply abilities", () => {
	const table = build("4c Control"), card = "Unholy Annex // Ritual Chamber";
	const object = place(table, 0, "hand", card)[0]!;
	const chamber = table.printed[card]!.faces![1]!;
	assert.equal(characteristics(table, object)!.manaValue, 8, "both Room costs count in hand");
	const registration = { face: 1 as const, basis: chamber.oracle, kind: "watch" as const, event: { on: "unlocks" as const, face: 1 as const, of: { is: "this" } },
		effect: { instructions: [{ do: "token" as const, count: 1, spec: { name: "Demon Token", types: ["creature" as const], subtypes: ["Demon"], colors: ["B" as const], power: 6, toughness: 6, words: ["flying"] } }] } };
	// An established registration isolates this door's event; it is not a whole-card assessment.
	editWork(table, 0, [{ do: "package.put", package: { card, registers: [registration] } }], "room-face-source");
	main(table, 0); commit(table, [{ do: "add-mana", who: 0, colors: Array(8).fill("B") }], "game-setup");
	const original = structuredClone(table), before = table.ledger.length;
	announce(table, printedCast(card, table.printed[card]!, 0)); passBoth(table); finish(table);
	assert.deepEqual(object.doors, [0]);
	assert.equal(characteristics(table, object)!.manaValue, 3);
	assert.equal(characteristics(table, object)!.registrations.length, 0);
	assert.equal(characteristics(table, object)!.name, "Unholy Annex");
	const decision = nextDecision(table)!;
	const unlock = decision.options.find((one) => one.id.startsWith("unlock:"))!;
	assert.match(unlock.label, /Ritual Chamber/);
	const incarnation = object.incarnation;
	apply(table, unlock.id, "model", "chosen");
	assert.equal(object.incarnation, incarnation);
	assert.deepEqual(object.doors, [0, 1]);
	assert.equal(characteristics(table, object)!.manaValue, 8);
	assert.deepEqual(focus(workFrame(table, 0), startingIntent(0)).objects.find((one) => one.id === object.id)!.doors, [0, 1]);
	assert.equal([...table.things.values()].filter((one) => one.zone === "stack").length, 0);
	assert.equal(table.seats[0]!.pool.length, 0);
	assert.equal(table.waiting.length, 1);
	assert.equal(nextDecision(table)!.situation, "trigger-order");
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table); finish(table);
	assert.equal([...table.things.values()].filter((one) => one.token?.name === "Demon Token").length, 1);
	const rebuilt = relive(structuredClone(original), table.ledger.slice(before));
	assert.deepEqual(rebuilt.things, table.things);
	assert.deepEqual(rebuilt.log, table.log);
	commit(table, [{ do: "move", what: object.id, to: "exile", reason: "exile" }, { do: "move", what: object.id, to: "battlefield", reason: "resolve", registers: [registration] }], "resolve");
	assert.deepEqual(object.doors, [], "a Room entering without a cast has no unlocked door");
	assert.equal(characteristics(table, object)!.name, "");
	assert.equal(characteristics(table, object)!.manaValue, 0, "locked Rooms have no active mana cost");
	assert.deepEqual(characteristics(table, object)!.types, ["enchantment"]);
	assert.deepEqual(characteristics(table, object)!.registrations, []);
	assert.equal(table.waiting.length, 0);
	commit(table, [{ do: "add-mana", who: 0, colors: Array(5).fill("B") }], "game-setup");
	apply(table, "pass", "model", "chosen");
	assert.ok(nextDecision(table)!.options.every((one) => !one.id.startsWith("unlock:")), "opponent cannot unlock the active seat's Room");
	const right = build("4c Control"), fromCast = place(right, 0, "hand", card)[0]!;
	right.work[0] = { revision: 0, packages: [{ card, registers: [registration] }] };
	main(right, 0); commit(right, [{ do: "add-mana", who: 0, colors: Array(5).fill("B") }], "game-setup");
	announce(right, printedCast(card, right.printed[card]!, 1)); passBoth(right); finish(right);
	assert.deepEqual(fromCast.doors, [1]);
	assert.equal(right.waiting.length, 1, "casting the right door triggers its unlock on entry");
});

test("transforming retains the permanent and crafting follows only the source's paid exile incarnation", () => {
	const table = build("Bant Airbending Combo"), object = place(table, 0, "battlefield", hero)[0]!;
	main(table, 0);
	commit(table, [{ do: "counters", what: object.id, kind: "+1/+1", amount: 1 }, { do: "damage", source: object.id, target: { id: object.id, incarnation: object.incarnation }, amount: 1 },
		{ do: "tap", what: object.id }, { do: "add-mana", who: 0, colors: ["G", "W", "W", "C", "C", "C"] }], "game-setup");
	const original = structuredClone(table), before = table.ledger.length, incarnation = object.incarnation;
	const transform: Procedure = { face: 0, source: { card: hero, face: 0, zones: ["battlefield"], controller: "self" }, claim: "Transform Jennifer Walters", basis: table.printed[hero]!.faces![0]!.oracle.split("\n")[1]!,
		timing: "stack", speed: "sorcery", cost: { mana: "{3}{G}{W}{W}" }, instructions: [{ do: "transform", what: "this" }] };
	announce(table, transform); passBoth(table); finish(table);
	assert.equal(object.face, 1);
	assert.equal(object.incarnation, incarnation);
	assert.equal(characteristics(table, object)!.power, 7);
	assert.equal(object.damage, 1);
	assert.equal(object.tapped, true);
	assert.equal(offered(table, transform).length, 0, "an ability from the front is not available on the back");
	const rebuilt = relive(structuredClone(original), table.ledger.slice(before)); assert.deepEqual(rebuilt.things, table.things);
	const interrupted = structuredClone(original);
	announce(interrupted, transform);
	commit(interrupted, [{ do: "transform", what: object.id }], "resolve");
	passBoth(interrupted); finish(interrupted);
	assert.equal(interrupted.things.get(object.id)!.face, 1, "701.27f ignores a source already transformed since its ability was put on the stack");
	for (const zone of ["graveyard", "battlefield"] as const) {
		const table = build("Jeskai Artifacts"), card = "Braided Net // Braided Quipu";
		const object = place(table, 0, "battlefield", card)[0]!, material = place(table, 0, zone, "Candy Trail")[0]!;
		table.work[0] = { revision: 0, packages: [{ card, registers: [{ face: 0, kind: "enters", basis: "This artifact enters with three net counters on it.", counters: { net: 3 } }] }] };
		main(table, 0); commit(table, [{ do: "add-mana", who: 0, colors: ["U", "C"] }], "game-setup");
		const initial = structuredClone(table), before = table.ledger.length, incarnation = object.incarnation;
		const craft: Procedure = { face: 0, source: { card, face: 0, zones: ["battlefield"], controller: "self" }, claim: "Craft Braided Net", basis: "Craft with artifact {1}{U}",
			timing: "stack", speed: "sorcery", cost: { mana: "{1}{U}", exile: { choose: { zones: ["battlefield", "graveyard"], types: ["artifact"] }, count: 1, source: true } },
			instructions: [{ do: "move", what: "bound:cost-source", to: "battlefield", face: 1, reason: "resolve" }] };
		assert.doesNotThrow(() => checkProcedure(craft));
		announce(table, craft);
		assert.equal(object.zone, "exile"); assert.equal(material.zone, "exile");
		passBoth(table); finish(table);
		assert.equal(object.zone, "battlefield"); assert.equal(object.face, 1);
		assert.equal(object.incarnation, incarnation + 2);
		assert.equal(characteristics(table, object)!.name, "Braided Quipu");
		assert.equal(characteristics(table, object)!.manaValue, 3, "a transforming back keeps its front mana value");
		assert.equal(object.counters.net, undefined, "the front face's entry counters do not apply to the crafted back face");
		assert.equal(material.zone, "exile");
		assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(before)).things, table.things);
		const interrupted = structuredClone(initial);
		announce(interrupted, craft);
		commit(interrupted, [{ do: "move", what: object.id, to: "graveyard", reason: "resolve" }, { do: "move", what: object.id, to: "exile", reason: "exile" }], "resolve");
		passBoth(interrupted); finish(interrupted);
		assert.equal(interrupted.things.get(object.id)!.zone, "exile", "craft does not return a later exile incarnation");
	}
});

test("Saga chapters cross lore thresholds, wait through resolution and sacrifice with finality applied", () => {
	const table = build("Selesnya Landfall"), card = "Esper Origins // Summon: Esper Maduin";
	const object = place(table, 0, "graveyard", card)[0]!;
	main(table, 0);
	const text = table.printed[card]!.faces![1]!.oracle.split("\n");
	const registers: Package["registers"] = [
		{ face: 1, kind: "chapter", numbers: [1], basis: text[1]!, effect: { instructions: [] } },
		{ face: 1, kind: "chapter", numbers: [2], basis: text[2]!, effect: { instructions: [{ do: "mana", who: "you", colors: ["G", "G"] }] } },
		{ face: 1, kind: "chapter", numbers: [3], basis: text[3]!, effect: { instructions: [{ do: "modify", every: { types: ["creature"], controller: "you", other: true }, until: "end-of-turn", change: { power: 2, toughness: 2, words: ["trample"] } }] } },
	];
	// Chapter I's card selection is not exercised in this lifecycle fixture.
	commit(table, [{ do: "move", what: object.id, to: "battlefield", face: 1, reason: "resolve", registers, counters: { finality: 1 } }], "resolve");
	assert.equal(object.counters.lore, 1);
	assert.equal(table.waiting[0]!.chapter, 1);
	assert.equal(characteristics(table, object)!.power, 4);
	assert.deepEqual(characteristics(table, object)!.colors, ["G"]);
	const original = structuredClone(table), before = table.ledger.length;
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table); finish(table);
	assert.equal(object.zone, "battlefield");
	assert.deepEqual(relive(structuredClone(original), table.ledger.slice(before)).things, table.things);
	// Reach the next own draw window without crossing the precombat main boundary.
	main(table, 0, 3, "draw");
	assert.equal(object.counters.lore, 1, "the draw step itself adds no lore");
	apply(table, "pass", "model", "chosen"); apply(table, "pass", "model", "chosen");
	while (!nextDecision(table)) advance(table);
	assert.equal(nextDecision(table)!.options[0]!.id, "lore");
	const beforeLore = structuredClone(table);
	assert.deepEqual(nextDecision(table), nextDecision(table)); assert.deepEqual(table, beforeLore, "listing lore is pure");
	apply(table, "lore", "engine", "forced");
	assert.equal(object.counters.lore, 2);
	assert.equal(table.waiting[0]!.chapter, 2);
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
	while (!nextDecision(table)) advance(table);
	passBoth(table); finish(table);
	assert.equal(table.seats[0]!.pool.filter((one) => one.color === "G").length, 2);
	commit(table, [{ do: "counters", what: object.id, kind: "lore", amount: 1 }], "resolve");
	assert.equal(object.zone, "battlefield"); assert.equal(table.waiting[0]!.chapter, 3);
	assert.equal(nextDecision(table)!.situation, "trigger-order", "a waiting chapter prevents final sacrifice");
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
	assert.equal(nextDecision(table)!.situation, "priority", "a chapter on the stack prevents final sacrifice");
	passBoth(table);
	assert.equal(object.zone, "battlefield", "a resolving chapter still owns its source");
	finish(table);
	assert.equal(object.zone, "exile", "finality replaces the final chapter's state-based sacrifice");
	const back = place(table, 0, "graveyard", card)[0]!;
	commit(table, [{ do: "move", what: back.id, to: "battlefield", face: 1, reason: "resolve", registers }], "resolve");
	commit(table, [{ do: "transform", what: back.id }], "resolve");
	assert.equal(back.face, 1, "a Saga cannot transform into its sorcery front (712.10)");
	commit(table, [{ do: "counters", what: back.id, kind: "lore", amount: 2 }], "resolve");
	assert.deepEqual(table.waiting.map((trigger) => trigger.chapter), [1, 2, 3], "a jump across chapters raises every crossed number");
	const tokens = build("Selesnya Landfall");
	commit(tokens, [{ do: "token", id: "saga-token", controller: 0, spec: { name: "Summon: Esper Maduin", types: ["enchantment", "creature"],
		subtypes: ["Saga", "Elemental"], colors: ["G"], power: 4, toughness: 4, registers: registers.map(({ face, ...term }) => term) } }], "resolve");
	assert.equal(tokens.things.get("saga-token")!.counters.lore, 1);
	assert.deepEqual(tokens.waiting.map(one => one.chapter), [1], "a newly created token has no before object, but its entry counter triggers its chapter");
	// The live reverse Landfall/Izzet game repeated the cast condition after exile.
	// Exercise the complete front-face instructions and isolate chapter I here.
	for (const zone of ["hand", "graveyard"] as const) {
		const cast = build("Selesnya Landfall"), [source] = place(cast, 0, zone, card);
		main(cast, 0);
		const use = example("Esper Origins checks its graveyard cast before both moves");
		editWork(cast, 0, [{ do: "package.put", package: { card, registers: [...registers,
			{ face: 0, kind: "permit", basis: "Flashback {3}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
				cast: { from: ["graveyard"], mana: "{3}{G}", leavesStack: "exile" } }], procedures: [use] } }], "esper-conditional-source");
		commit(cast, [{ do: "add-mana", who: 0, colors: ["G", "C", "C", "C"] }], "game-setup");
		const initial = structuredClone(cast), at = cast.ledger.length, life = cast.seats[0]!.life;
		announce(cast, use); passBoth(cast);
		step(cast); step(cast); // Begin surveil, look, then choose both cards for the graveyard.
		step(cast, label => label.startsWith("Choose ")); step(cast, label => label.startsWith("Choose "));
		step(cast); step(cast); step(cast); // Put into graveyard, finish surveil, gain life.
		assert.equal(cast.seats[0]!.life, life + 2);
		step(cast); // Check the one condition for the whole group.
		if (zone === "graveyard") {
			step(cast); // Exile before the return, with a new bound incarnation.
			assert.equal(source!.zone, "exile");
			const exiled = structuredClone(cast), from = cast.ledger.length;
			assert.deepEqual(cast.resolution!.bound.transformed!.objects, [{ id: source!.id, incarnation: source!.incarnation }]);
			finish(cast);
			assert.equal(source!.zone, "battlefield"); assert.equal(source!.face, 1);
			assert.equal(source!.counters.finality, 1); assert.equal(source!.counters.lore, 1);
			assert.deepEqual(cast.waiting.map(one => one.chapter), [1]);
			assert.deepEqual(relive(exiled, cast.ledger.slice(from)), cast, "a clone between moves keeps the accepted branch");
		} else {
			finish(cast); assert.equal(source!.zone, "graveyard"); assert.equal(cast.waiting.length, 0);
		}
		assert.deepEqual(relive(initial, cast.ledger.slice(at)), cast);
	}
});

test("Prepare creates one castable copy, preserves the permanent and expires only the unused copy", () => {
	const table = build("Azorius Control"), card = "Emeritus of Ideation // Ancestral Recall";
	const object = place(table, 0, "hand", card)[0]!;
	main(table, 0);
	const enter = { face: 0 as const, kind: "enters" as const, basis: "This creature enters prepared.", prepared: true as const };
	commit(table, [{ do: "move", what: object.id, to: "battlefield", reason: "resolve", registers: [enter] }, { do: "add-mana", who: 0, colors: ["U"] }], "game-setup");
	const copy = [...table.things.values()].find((one) => one.copy?.source.id === object.id)!;
	assert.ok(object.prepared);
	assert.equal(focus(workFrame(table, 0), startingIntent(0)).objects.find((one) => one.id === object.id)!.prepared, true);
	assert.equal(copy.zone, "exile"); assert.equal(copy.card, card);
	assert.equal(characteristics(table, copy)!.manaValue, 1, "the Prepare copy has its own spell face cost");
	assert.equal(facts(table, copy)!.name, "Ancestral Recall");
	assert.deepEqual(characteristics(table, copy)!.types, ["instant"]);
	const cast: Procedure = { face: 1, source: { card, zones: ["exile"], controller: "any" }, claim: "Cast Ancestral Recall", basis: table.printed[card]!.faces![1]!.oracle,
		timing: "spell", targets: [{ player: "any" }], instructions: [{ do: "draw", who: "target:0", count: 3 }] };
	assert.ok(offered(table, cast).length);
	const normal = printedCast(card, table.printed[card]!, 0);
	assert.equal(offered(table, normal).length, 0, "the copy cannot be cast as the original creature");
	table.work[0] = { revision: 0, packages: [{ card, registers: [enter], deferred: [{ face: 1, source: cast.source, claim: cast.claim, basis: cast.basis, timing: "spell" }] }] };
	assert.equal(preparation(workFrame(table, 0)).length, 1, "a visible castable copy requires its deferred interpretation");
	table.work[0] = { revision: 0 };
	commit(table, [{ do: "prepare", what: object.id, prepared: true }], "resolve");
	assert.equal([...table.things.values()].filter((one) => one.copy?.source.id === object.id).length, 1);
	const original = structuredClone(table), before = table.ledger.length, incarnation = object.incarnation;
	announce(table, cast, (one) => "player" in one.activation.targets[0]![0]! && one.activation.targets[0]![0]!.player === 0);
	assert.equal(object.prepared, undefined);
	assert.equal(object.incarnation, incarnation);
	assert.equal(object.zone, "battlefield");
	assert.equal(copy.zone, "stack");
	const hand = [...table.things.values()].filter((one) => one.zone === "hand" && one.owner === 0).length;
	passBoth(table); finish(table);
	assert.equal([...table.things.values()].filter((one) => one.zone === "hand" && one.owner === 0).length, hand + 3);
	assert.equal(table.things.has(copy.id), false, "the spell copy ceases after resolution");
	const replayed = relive(structuredClone(original), table.ledger.slice(before));
	assert.deepEqual(replayed.things, table.things); assert.deepEqual(replayed.log, table.log);
	const grave = [...table.things.values()].filter((one) => one.owner === 0 && one.zone === "library").slice(0, 8);
	commit(table, grave.map((one) => ({ do: "move", what: one.id, to: "graveyard", reason: "game-setup" })), "game-setup");
	commit(table, [{ do: "trigger", action: "wait", trigger: { id: "prepare-attack", controller: 0, source: { id: object.id, incarnation },
		basis: "Whenever this creature attacks, you may exile eight cards from your graveyard. If you do, this creature becomes prepared.", event: {}, effect: { instructions: [
			{ do: "choose", who: "you", from: { zones: ["graveyard"], owner: "you" }, count: 8, may: true, as: "fuel" },
			{ do: "move", what: "bound:fuel", to: "exile", reason: "exile", if: { bound: "fuel" } },
			{ do: "prepare", what: "this", prepared: true, if: { bound: "fuel" } },
		] } } }], "resolve");
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
	step(table, (label) => label.startsWith("Choose "));
	assert.ok(nextDecision(table)!.options.every((one) => !one.label.startsWith("Stop here")), "an optional exact choice cannot finish with fewer than eight");
	while (table.resolution) step(table, () => true);
	assert.ok(grave.every((one) => one.zone === "exile"));
	assert.ok(object.prepared);
	assert.ok([...table.things.values()].some((one) => one.copy?.source.id === object.id));
	commit(table, [{ do: "move", what: object.id, to: "hand", reason: "bounce" }], "resolve");
	assert.equal(object.prepared, undefined);
	assert.equal(nextDecision(table)!.situation, "state-based");
	apply(table, nextDecision(table)!.options[0]!.id, "engine", "forced");
	assert.ok(![...table.things.values()].some((one) => one.copy?.source.id === object.id));
	const inFlight = structuredClone(original);
	announce(inFlight, cast);
	commit(inFlight, [{ do: "move", what: object.id, to: "graveyard", reason: "destroy" }], "destroy");
	assert.ok(inFlight.things.has(copy.id), "a cast copy survives the loss of its source");
	passBoth(inFlight); finish(inFlight);
	assert.equal(inFlight.things.has(copy.id), false);
});

test("an alternate spell dealt from its registered deck clones while on the stack and continues without new interpretation", () => {
	const table = build("Boros Dragons");
	const [keywords, enter] = table.printed[dragon]!.faces![0]!.oracle.split("\n") as [string, string];
	const pack: Package = { card: dragon, assessed: true, printedCast: true, registers: [
		{ face: 0, kind: "continuous", basis: keywords, affects: { is: "this" }, change: { words: ["flying"] } },
		{ face: 0, kind: "watch", basis: enter, event: { on: "enters", of: { is: "this" } }, effect: { instructions: [{ do: "life", who: "you", amount: 5 }] } },
	], procedures: [{ face: 1, source: { card: dragon, zones: ["hand", "graveyard", "exile"], controller: "any" }, claim: "Cast Charring Bite",
		basis: table.printed[dragon]!.faces![1]!.oracle, timing: "spell", targets: [{ object: { types: ["creature"], not: { words: ["flying"] } } }], instructions: [{ do: "damage", to: "target:0", amount: 5 }] }] };
	editWork(table, 0, [{ do: "package.put", package: pack }], "full-dragon-assessment");
	let cast = false;
	for (let guard = 0; guard < 8000; guard++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		const omen = decision.options.find((one) => one.use?.face === 1 && table.things.get(one.use.source.id)?.card === dragon);
		const claw = decision.seat === 1 ? decision.options.find((one) => one.use?.timing === "spell" && table.things.get(one.use.source.id)?.card === "Hired Claw") : undefined;
		const land = decision.options.find((one) => one.label === "Play Mountain") ?? decision.options.find((one) => one.label === "Play Sacred Foundry") ?? decision.options.find((one) => one.id.startsWith("land:"));
		const quiet = decision.options.find((one) => ["keep", "pass", "attack:done", "block:done"].includes(one.id)) ?? decision.options[0]!;
		apply(table, (omen ?? claw ?? land ?? quiet).id, "model", "chosen");
		if (omen) { cast = true; break; }
	}
	assert.ok(cast, "ordinary dealing reaches the alternate cast");
	const spell = [...table.things.values()].find((one) => one.card === dragon && one.zone === "stack")!;
	assert.equal(facts(table, spell)!.name, "Charring Bite");
	const directory = mkdtempSync(join(tmpdir(), "magic-face-clone-"));
	try {
		const universe = shipped(), header: Header = { id: "parent", format: table.format.name, seed: table.rng.seed,
			seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: universe.path, generated: universe.generated, faces: universe.faces },
			rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
		const journal = open(join(directory, "parent.jsonl"), header); save(journal, table);
		fork(journal.path, table.ledger.length, "child", join(directory, "child.jsonl"));
		const child = replay(join(directory, "child.jsonl"), (header) => start(standard, header.seats, header.seed, universe), undefined, { cards: header.cards, rules: header.rules }).table;
		assert.deepEqual(child.things, table.things); assert.deepEqual(child.work, table.work); assert.deepEqual(child.ledger, table.ledger);
		for (const position of [table, child]) { passBoth(position); finish(position); }
		assert.deepEqual(child.things, table.things); assert.deepEqual(child.log, table.log); assert.deepEqual(child.rng, table.rng);
		assert.equal(table.things.get(spell.id)!.zone, "library");
	} finally { rmSync(directory, { recursive: true, force: true }); }
});
