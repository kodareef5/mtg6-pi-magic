/** A copied spell owns its announced decisions but is never another cast.
 * Past 150 lines to exercise stack lifetime, copied costs, entry and combat with saved continuations. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { printedCast } from "../src/core/procedures.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { casting } from "../src/core/casting.ts";
import { amount, holds, tableWorld } from "../src/core/selectors.ts";
import { editWork } from "../src/core/work-tools.ts";
import { copySpell } from "../src/core/copies.ts";
import { relive } from "../src/core/journal.ts";
import { describe, project } from "../src/core/view.ts";
import type { Package, Procedure } from "../src/core/language.ts";
import { announce, example, finish, main, pack, passBoth, step } from "./play.ts";

const sage = "Sage of the Skies", drum = "Springleaf Drum", hydra = "Guiding Hydra", charts = "Consult the Star Charts";
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const stored = (slug: string): Package => JSON.parse(readFileSync(new URL(`../prepared/packages/2026-10-10/${slug}.json`, import.meta.url), "utf8")).package;
const position = () => start(standard, [{ deck: alpha(deck("Azorius Momo")) }, { deck: alpha(deck("4c Control")) }], "spell-copies");
function prepare(table: Table, who: number, card: string, registers = pack(card)) {
	editWork(table, who, [{ do: "package.put", package: { card, printedCast: true, assessed: true, registers, procedures: [], deferred: [] } }], `prepare-${who}-${card}`);
}
function put(table: Table, card: string, zone: "hand" | "battlefield", who = 0) {
	const one = [...cardsIn(table, "library", who), ...cardsIn(table, "hand", who)].find(one => one.card === card)!; assert.ok(one, card);
	if (one.zone !== zone) commit(table, [{ do: "move", what: one.id, to: zone, reason: "game-setup", ...(zone === "battlefield" && card === sage ? { registers: pack(sage) } : {}) }], "game-setup"); return one;
}
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
const copies = (table: Table) => cardsIn(table, "stack").filter(one => one.spellCopy);
const countCasts = (table: Table, who = 0) => amount({ world: tableWorld(table), controller: who }, { history: "cast", by: "you" });
function copyUse(table: Table, name: string, controller = 0) {
	const use: Procedure = { claim: "Copy an announced spell fixture", basis: "When you cast this spell, if you've cast another spell this turn, copy this spell. (The copy becomes a token.)",
		source: { card: sage, zones: ["battlefield"], controller: "self" }, timing: "stack", targets: [{ object: { zones: ["stack"], name } }], instructions: [{ do: "copy-spell", what: "target:0" }] };
	assert.equal(table.cursor.priority, controller); announce(table, use); passBoth(table); step(table);
	const copy = copies(table)[0]!; assert.ok(copy); finish(table); return copy;
}

test("spell copies preserve choices without casting or paying again, resolve independently and become token permanents only on resolution", () => {
	for (const variant of ["first", "ordinary", "original-countered", "copy-countered", "prior-countered"] as const) {
		const table = position(); main(table, 0); prepare(table, 0, sage); prepare(table, 0, drum);
		put(table, sage, "hand"); put(table, drum, "hand");
		commit(table, [{ do: "add-mana", who: 0, colors: ["W", "W", "W", "W"] }], "game-setup");
		if (variant !== "first") {
			const first = announce(table, printedCast(drum, table.printed[drum]!));
			if (variant === "prior-countered") commit(table, [{ do: "move", what: first.activation.source.id, to: "graveyard", reason: "counter" }], "counter");
			else { passBoth(table); finish(table); }
		}
		const before = structuredClone(table);
		const announced = announce(table, printedCast(sage, table.printed[sage]!)), original = table.things.get(announced.activation.source.id)!;
		if (variant === "first") {
			assert.equal(table.waiting.length, 0); passBoth(table); finish(table);
			assert.equal(cardsIn(table, "battlefield").filter(one => one.token?.name === sage).length, 0); replay(table, before); continue;
		}
		assert.equal(table.waiting.length, 1); apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
		if (variant === "original-countered") commit(table, [{ do: "move", what: original.id, to: "graveyard", reason: "counter" }], "counter");
		const pending = structuredClone(table); passBoth(table); step(table);
		const copy = copies(table)[0]!; assert.ok(copy); assert.equal(copy.token, undefined); assert.equal(copy.owner, 0);
		assert.equal(table.waiting.length, 0, "the copy does not cast itself or trigger Sage again"); assert.equal(countCasts(table), 2);
		assert.equal(characteristics(table, copy)!.manaValue, 3); assert.equal(characteristics(table, copy)!.power, 2);
		assert.deepEqual(characteristics(table, copy)!.words.slice().sort(), ["flying", "lifelink"]);
		assert.deepEqual(casting(table, copy), { copied: true, mana: [] });
		assert.equal(holds({ world: tableWorld(table), controller: 0, source: copy }, { cast: "this" }), false);
		assert.equal(cardsIn(table, "stack")[0]!.id, copy.id); assert.equal(table.resolution, null, "the copy instruction also finishes its trigger");
		const fork = structuredClone(table); nextDecision(table); nextDecision(table); assert.deepEqual(table, fork, "listing a copied spell is pure"); finish(table);
		for (const viewer of [0, 1, "spectator"] as const) assert.equal(project(table, viewer).objects!.find(one => one.id === copy.id)!.traits!.name, sage);
		if (variant === "copy-countered") {
			put(table, "Dispelling Exhale", "hand", 1); commit(table, [{ do: "add-mana", who: 1, colors: ["U", "U"] }], "game-setup");
			const counterBefore = structuredClone(table); apply(table, "pass", "model", "chosen");
			const exhale = example("Dispelling Exhale with a beheld Dragon"); delete exhale.cost; exhale.claim = "Dispelling Exhale without a beheld Dragon";
			exhale.instructions = [{ do: "counter", what: "target:0", unless: { who: "controller:target:0", pays: { mana: "{2}" } } }];
			announce(table, exhale, one => one.activation.targets[0]!.some(target => "id" in target && target.id === copy.id));
			passBoth(table); step(table, label => label.startsWith("Do not pay"));
			assert.equal(copy.zone, "graveyard", "countering first moves a spell copy out of the stack");
			const countered = structuredClone(table); finish(table); assert.equal(table.things.has(copy.id), false); replay(table, countered); replay(table, counterBefore);
			passBoth(table); finish(table); assert.equal(original.zone, "battlefield"); continue;
		}
		passBoth(table); finish(table); assert.equal(copy.zone, "battlefield"); assert.equal(copy.spellCopy, undefined); assert.equal(copy.token!.name, sage);
		assert.equal(copy.ability, undefined); assert.equal(copy.card, undefined); assert.equal(copy.copied, undefined);
		assert.ok(!table.log.flatMap(one => one.changes).some(one => one.do === "token" && one.id === copy.id), "becoming a token is not token creation");
		assert.equal(characteristics(table, copy)!.power, 2); assert.equal(characteristics(table, copy)!.toughness, 3);
		if (variant !== "original-countered") { passBoth(table); finish(table); assert.equal(original.zone, "battlefield"); }
		else assert.equal(original.zone, "graveyard");
		replay(table, fork); replay(table, pending); if (variant !== "original-countered") replay(table, before);
		const life = table.seats[0]!.life;
		commit(table, [{ do: "damage", source: ref(copy), target: { player: 1 }, amount: 2, combat: true }], "combat");
		assert.equal(table.seats[0]!.life, life + 2, "the token retains lifelink");
		commit(table, [{ do: "move", what: copy.id, to: "graveyard", reason: "destroy" }], "destroy");
		const dying = structuredClone(table); finish(table); assert.equal(table.things.has(copy.id), false); replay(table, dying);
	}
	// X and entry counters belong to the copied announcement, while spent mana remains zero.
	const x = position(); main(x, 0); prepare(x, 0, sage); put(x, sage, "battlefield"); put(x, hydra, "hand");
	const hp = stored("guiding-hydra"); editWork(x, 0, [{ do: "package.put", package: hp }], "prepare-hydra");
	commit(x, [{ do: "add-mana", who: 0, colors: ["W", "W", "W"] }], "game-setup");
	announce(x, { claim: "Cast Guiding Hydra", basis: "This creature enters with X +1/+1 counters on it.", source: { card: hydra, zones: ["hand"], controller: "self" }, timing: "spell", cost: { mana: "{X}{W}" }, instructions: [] }, one => one.activation.x === 2);
	const xBefore = structuredClone(x), duplicate = copyUse(x, hydra);
	assert.equal(characteristics(x, duplicate)!.manaValue, 3); assert.equal(casting(x, duplicate)!.x, 2); assert.equal(casting(x, duplicate)!.mana.length, 0);
	passBoth(x); finish(x); assert.equal(duplicate.counters["+1/+1"], 2); assert.equal(characteristics(x, duplicate)!.power, 3);
	assert.equal(characteristics(x, duplicate)!.manaValue, 1); assert.equal(casting(x, duplicate)!.x, 2);
	replay(x, xBefore);
	// Entry replacement choices are made afresh; a copied Mockingbird spent no mana.
	const entry = position(); main(entry, 0); prepare(entry, 0, sage); put(entry, sage, "battlefield"); put(entry, "Mockingbird", "hand");
	editWork(entry, 0, [{ do: "package.put", package: stored("mockingbird") }], "prepare-mockingbird");
	commit(entry, [{ do: "token", id: "soldier", controller: 0, spec: { name: "Soldier", types: ["creature"], subtypes: ["Soldier"], colors: ["W"], power: 1, toughness: 1 } },
		{ do: "add-mana", who: 0, colors: ["U", "U", "U"] }], "game-setup");
	announce(entry, example("Cast Mockingbird for XU"), one => one.activation.x === 2);
	const entryBefore = structuredClone(entry), birdCopy = copyUse(entry, "Mockingbird"); passBoth(entry); step(entry);
	const choosing = structuredClone(entry), choices = nextDecision(entry)!;
	assert.equal(choices.situation, "replacement-order"); assert.equal(choices.options.length, 2);
	assert.ok(choices.options.every(one => !one.objects?.length || one.objects[0]!.id === "soldier"), "zero spent mana excludes the three-mana Sage");
	apply(entry, choices.options.find(one => one.objects?.[0]?.id === "soldier")!.id, "model", "chosen");
	assert.equal(nextDecision(entry)!.options[0]!.id, "entry:finish"); apply(entry, "entry:finish", "engine", "forced"); finish(entry);
	assert.equal(characteristics(entry, birdCopy)!.name, "Soldier"); assert.ok(characteristics(entry, birdCopy)!.subtypes.includes("Bird"));
	assert.ok(characteristics(entry, birdCopy)!.words.includes("flying")); replay(entry, choosing); replay(entry, entryBefore);
	// A copied kicked instant uses its new controller's library and preserves the chosen kicker.
	const kicked = position(); main(kicked, 1); prepare(kicked, 0, sage); put(kicked, sage, "battlefield"); put(kicked, charts, "hand", 1);
	for (const name of ["Plains", "Hallowed Fountain", "Floodfarm Verge"]) put(kicked, name, "battlefield");
	for (const name of ["Island", "Swamp", "Mountain"]) put(kicked, name, "battlefield", 1);
	editWork(kicked, 1, [{ do: "package.put", package: stored("consult-the-star-charts") }], "prepare-charts");
	commit(kicked, [{ do: "add-mana", who: 1, colors: ["U", "U", "U", "U"] }], "game-setup");
	const consult = example("Consult the Star Charts with kicker"); consult.cost = { mana: "{1}{U}", additional: [{ name: "kicker", mana: "{1}{U}" }] };
	const cast = announce(kicked, consult); apply(kicked, "pass", "model", "chosen");
	const kickedBefore = structuredClone(kicked), copied = copyUse(kicked, charts), hand0 = cardsIn(kicked, "hand", 0).length, hand1 = cardsIn(kicked, "hand", 1).length;
	assert.equal(copied.owner, 0); assert.equal(copied.ability!.controller, 0); assert.deepEqual(copied.ability!.cost.additional, ["kicker"]);
	assert.equal(holds({ world: tableWorld(kicked), controller: 0, source: copied }, { cast: "this", paid: "kicker" }), true);
	assert.equal(holds({ world: tableWorld(kicked), controller: 0, source: copied }, { cast: "this", from: "hand" }), false);
	assert.equal(countCasts(kicked, 0), 0); assert.equal(countCasts(kicked, 1), 1);
	assert.equal(casting(kicked, copied)!.mana.length, 0); assert.equal(casting(kicked, kicked.things.get(cast.activation.source.id)!)!.mana.length, 4);
	passBoth(kicked); step(kicked);
	const looking = structuredClone(kicked); assert.ok(kicked.resolution?.looked?.[0]?.length);
	for (const viewer of [1, "spectator"] as const) {
		const view = project(kicked, viewer); assert.deepEqual(view.resolution!.bound.looked!.objects, []);
		assert.equal(view.objects!.filter(one => one.zone === "library").length, 0);
	}
	while (kicked.resolution) { const next = nextDecision(kicked)!; apply(kicked, next.options[0]!.id, "model", "chosen"); }
	finish(kicked); assert.equal(cardsIn(kicked, "hand", 0).length, hand0 + 2); assert.equal(cardsIn(kicked, "hand", 1).length, hand1);
	assert.equal(kicked.things.has(copied.id), false); replay(kicked, looking); replay(kicked, kickedBefore);
	const receipt = kicked.log.find(one => one.changes.some(one => one.do === "copy-spell"))!;
	assert.match(describe(kicked, receipt), /copied Consult the Star Charts onto the stack/);
	// Unsupported characteristics leave a copy instruction pending rather than approximating them.
	const original = tableSpell(kicked, cast.activation.source.id), special = structuredClone(original); special.ability!.words = ["can't be countered"];
	assert.match((copySpell(kicked, special) as { blocked: string }).blocked, /copiable provenance/);
	// Targets stay fixed. Becoming a target happens again, but copying commits no crime.
	const aimed = position(); main(aimed, 1); prepare(aimed, 1, sage); const copier = put(aimed, sage, "hand");
	commit(aimed, [{ do: "move", what: copier.id, to: "battlefield", controller: 1, reason: "game-setup", registers: pack(sage) }], "game-setup");
	const victim = put(aimed, hydra, "battlefield"), sheriff = "Shoot the Sheriff"; put(aimed, sheriff, "hand", 1);
	editWork(aimed, 1, [{ do: "package.put", package: stored("shoot-the-sheriff") }], "prepare-sheriff");
	commit(aimed, [{ do: "counters", what: victim.id, kind: "+1/+1", amount: 1 }, { do: "add-mana", who: 1, colors: ["B", "B"] }], "game-setup");
	const shot = announce(aimed, { claim: "Shoot the Sheriff", basis: stored("shoot-the-sheriff").deferred![0]!.basis,
		source: { card: sheriff, zones: ["hand"], controller: "self" }, timing: "spell", cost: { mana: "{1}{B}" },
		targets: [{ object: { zones: ["battlefield"], types: ["creature"], not: { subtypes: ["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"] } } }], instructions: [{ do: "move", what: "target:0", to: "graveyard", reason: "destroy" }] }, one => one.activation.targets[0]!.some(target => "id" in target && target.id === victim.id));
	commit(aimed, [{ do: "note", note: { kind: "label", on: ref(victim), by: 0, text: "Target and crime observation fixture", until: "indefinite", change: { registers: [
		{ kind: "watch", basis: "Target observation fixture", event: { on: "targeted", of: { is: "this" } }, effect: { instructions: [] } },
		{ kind: "watch", basis: "Crime observation fixture", event: { on: "crime", by: "opponent" }, effect: { instructions: [] } }
	] } } }], "game-setup");
	const targetBefore = structuredClone(aimed), mirror = copyUse(aimed, sheriff, 1);
	assert.deepEqual(mirror.ability!.targets, shot.activation.targets); assert.equal(aimed.waiting.length, 1);
	assert.equal(aimed.waiting[0]!.basis, "Target observation fixture");
	apply(aimed, nextDecision(aimed)!.options[0]!.id, "model", "chosen"); passBoth(aimed); finish(aimed);
	passBoth(aimed); finish(aimed); assert.equal(victim.zone, "graveyard"); assert.equal(aimed.things.has(mirror.id), false);
	passBoth(aimed); finish(aimed); assert.equal(aimed.things.get(shot.activation.source.id)!.zone, "graveyard", "the original no longer has a legal target");
	replay(aimed, targetBefore);
});
function tableSpell(table: Table, id: string) { const one = table.things.get(id)!; assert.equal(one.zone, "stack"); return one; }
