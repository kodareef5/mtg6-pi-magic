/** Oracle naming is public source data; a remembered name belongs to one incarnation. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardNameChoices } from "../src/core/card-names.ts";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive, open, replay, type Header } from "../src/core/journal.ts";
import { shipped } from "../src/core/printed.ts";
import { project } from "../src/core/view.ts";
import { main, place, pack, passBoth, finish } from "./play.ts";

test("a card name comes from pinned Oracle faces, is public, and affects only its remembered incarnation", () => {
	const table = start(standard, [{ deck: alpha(deck("Azorius Control")) }, { deck: alpha(deck("Mono-Green Landfall")) }], "oracle-name");
	main(table, 0);
	const [land] = place(table, 0, "hand", "Petrified Hamlet"), [forest] = place(table, 1, "battlefield", "Forest");
	editWork(table, 0, [{ do: "package.put", package: { card: "Petrified Hamlet", registers: pack("Petrified Hamlet") } }], "name-terms");
	const initial = structuredClone(table), from = table.ledger.length;
	apply(table, `land:${land!.id}`, "model", "chosen");
	const trigger = nextDecision(table)!;
	assert.equal(trigger.situation, "trigger-order"); apply(table, trigger.options[0]!.id, "model", "chosen");
	passBoth(table);
	const pending = structuredClone(table), at = table.ledger.length, decision = nextDecision(table)!;
	assert.deepEqual(table, pending, "listing names reads no game arrangement and mutates nothing");
	assert.ok(decision.options.some((one) => one.label === "Choose the name Strip Mine"));
	assert.ok(!shipped().cards.has("Strip Mine"), "Oracle naming is not filtered to Standard legality");
	assert.ok(decision.options.some((one) => one.label === "Choose the name Bala Ged Sanctuary"), "a land back face has its own name");
	assert.ok(!decision.options.some((one) => one.label.includes("Bala Ged Recovery //")), "the combined card name is not a face name");
	assert.ok(!decision.options.some((one) => one.label === "Choose the name Llanowar Elves"));
	assert.ok(decision.options.every((one) => !one.objects?.length), "name choices contain no hidden object assignments");
	const colors = () => characteristics(table, forest!)!.registrations.flatMap((one) => one.kind === "mana" ? one.colors ?? [] : []);
	assert.ok(!colors().includes("C"), "an unresolved name matches no land");
	apply(table, decision.options.find((one) => one.label === "Choose the name Forest")!.id, "model", "chosen");
	finish(table);
	assert.equal(land!.choices!.land, "Forest"); assert.ok(colors().includes("C"), "the continuous grant reaches the other seat's land");
	assert.ok(project(table, "spectator").table.some((one) => one.includes("land: Forest")));
	assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(from)), table);
	assert.deepEqual(relive(structuredClone(pending), table.ledger.slice(at)), table);
	commit(table, [{ do: "move", what: land!.id, to: "graveyard", reason: "destroy" }], "destroy");
	assert.equal(land!.choices, undefined); assert.ok(!colors().includes("C"));
	const unavailable = structuredClone(pending); delete unavailable.cardNames;
	assert.match(nextDecision(unavailable)!.blocked!, /pinned Oracle name catalog/);
	assert.deepEqual(nextDecision(unavailable)!.options, []);
});

test("a journal pins the Oracle naming catalog and refuses changed source data", () => {
	const directory = mkdtempSync(join(tmpdir(), "magic-names-")), universe = shipped();
	const build = () => start(standard, [{ deck: alpha(deck("Azorius Control")) }, { deck: alpha(deck("Mono-Green Landfall")) }], "pinned-names");
	const table = build(), header: Header = { id: "names", format: "standard", seed: table.rng.seed, seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })),
		cards: { path: universe.path, generated: universe.generated, faces: universe.faces, names: universe.names }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
	try {
		const journal = open(join(directory, "parent.jsonl"), header);
		assert.deepEqual(replay(journal.path, build, 0, { cards: header.cards, rules: header.rules }).table, relive(table, []));
		assert.throws(() => replay(journal.path, build, 0, { cards: { ...header.cards, names: { path: "fixture", sha256: "changed" } }, rules: header.rules }), /Oracle name data differs/);
		assert.throws(() => replay(journal.path, () => { const changed = build(); changed.cardNames!.sha256 = "changed"; return changed; }), /Oracle name data differs/);
		const path = join(directory, "changed.tsv"); writeFileSync(path, readFileSync(universe.names!.path, "utf8") + "Invented name\tland\n");
		assert.throws(() => cardNameChoices({ path, sha256: universe.names!.sha256 }, ["land"]), /pinned source/);
		const legacy = open(join(directory, "legacy.jsonl"), { ...header, cards: { path: universe.path, generated: universe.generated, faces: universe.faces } });
		assert.equal(replay(legacy.path, build, 0).table.cardNames, undefined);
	} finally { rmSync(directory, { recursive: true, force: true }); }
});
