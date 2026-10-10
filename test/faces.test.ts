/** A face changes available characteristics, never the number or identity of cards.
 * Past 150 lines when needed to keep face selection, resolution and journal parity in one invariant. */
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
import { printedCast } from "../src/core/procedures.ts";
import { relive, open, save, replay, fork, type Header } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { preparation } from "../src/core/readiness.ts";
import { workFrame } from "../src/core/work-tools.ts";
import type { Procedure, Package } from "../src/core/language.ts";
import { main, place, announce, offered, passBoth, finish } from "./play.ts";

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
		assert.equal(table.notes.some((note) => note.kind === "permit" && note.on.id === object.id), !lost);
		if (lost) continue;
		const rebuilt = relive(original, table.ledger.slice(before));
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
		announce(table, cast);
		if (lost) commit(table, [{ do: "move", what: target.id, to: "graveyard", reason: "destroy" }], "destroy");
		passBoth(table); finish(table);
		assert.equal(object.zone, lost ? "graveyard" : "library", "an Omen shuffles only after successful resolution");
		if (!lost) {
			const rebuilt = relive(original, table.ledger.slice(before));
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
