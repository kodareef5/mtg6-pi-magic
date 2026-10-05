/** Assessed before play: accepted model terms supply card behavior without a turn-plan declaration.
 * Past 150 lines because refusal, entry, response windows and journal reuse share the same card assessment.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessCard } from "../src/context/assess.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { ASSESSMENT_CEILING, tally } from "../src/context/spend.ts";
import { actions, changedPlan } from "../src/context/plan-edit.ts";
import { registrationProblems } from "../src/context/strategy.ts";
import { seat } from "../src/context/sit.ts";
import { assessmentProblems } from "../src/core/assessment.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import type { Package, Procedure } from "../src/core/language.ts";
import { editWork, planProblems, workFrame } from "../src/core/work-tools.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { sick } from "../src/core/funding.ts";
import { project } from "../src/core/view.ts";
import { fork, open, replay, save, type Header } from "../src/core/journal.ts";
import { main, place, quiet, passBoth, finish, example } from "./play.ts";
import { matchTable, universe } from "../tools/matchup-fixture.ts";

const normal = (card: string, basis: string): Procedure => ({ source: { card, zones: ["hand", "graveyard", "exile"], controller: "any" }, claim: `Cast ${card}`, basis, timing: "spell", instructions: [] });
function hellkite(): Package {
	const [words, enters, warp] = universe.cards.get("Nova Hellkite")!.oracle.split("\n") as [string, string, string];
	return { card: "Nova Hellkite", assessed: true, registers: [
		{ kind: "continuous", basis: words, affects: { is: "this" }, change: { words: ["flying", "haste"] } },
		{ kind: "watch", basis: enters, event: { on: "enters", of: { is: "this" } },
			effect: { targets: [{ object: { zones: ["battlefield"], types: ["creature"], controller: "opponent" } }], instructions: [{ do: "damage", to: "target:0", amount: 1 }] } },
	], procedures: [normal("Nova Hellkite", words), {
		source: { card: "Nova Hellkite", zones: ["hand"], controller: "self" }, claim: "Warp Nova Hellkite", basis: warp, timing: "spell", cost: { mana: "{2}{R}" },
		instructions: [{ do: "delay", event: { on: "step", step: "end", whose: "any" }, effect: { instructions: [
			{ do: "move", what: "this", to: "exile", reason: "exile", as: "warped" },
			{ do: "permit", what: "bound:warped", who: "you", from: "next-turn", until: "indefinite" },
		] } }],
	}] };
}

test("assessment covers the whole card before play, and accepted terms supply entry, responses and replay", async () => {
	const table = matchTable("assessment-0"), pack = hellkite();
	const clock = table.cursor.clock;
	const printed = table.printed[pack.card]!;
	assert.deepEqual(assessmentProblems(printed, pack), []);
	const kellan = example("Kellan becomes a Detective");
	assert.doesNotThrow(() => checkProcedure(kellan), "a granted trigger binds and uses its own card");
	assert.throws(() => checkProcedure({ ...kellan, instructions: [...kellan.instructions, { do: "move", what: "bound:card", to: "hand", reason: "bounce" }] }), /bound:card is used before/,
		"a future trigger's local binding does not escape into the granting ability");
	const unbound = structuredClone(kellan);
	const granting = unbound.instructions[0]!;
	if (granting.do !== "modify" || granting.change.registers?.[0]?.kind !== "watch") assert.fail("Expected the granted watch");
	granting.change.registers[0].effect.instructions.shift();
	assert.throws(() => checkProcedure(unbound), /bound:card is used before/, "the nested trigger is checked within its own scope");
	const abrade = table.printed.Abrade!;
	const modes: Package = { card: "Abrade", registers: [], procedures: [
		{ ...normal("Abrade", "Choose one — ... Abrade deals 3 damage to target creature."), targets: [{ object: { types: ["creature"] } }], instructions: [{ do: "damage", to: "target:0", amount: 3 }] },
		{ ...normal("Abrade", "Destroy target artifact."), targets: [{ object: { types: ["artifact"] } }], instructions: [{ do: "destroy", what: "target:0" }] },
	] };
	assert.deepEqual(assessmentProblems(abrade, modes), [], "mode bullets are typography, not missing card meaning");
	assert.match(assessmentProblems(abrade, { ...modes, procedures: modes.procedures!.slice(0, 1) }).join("; "), /Unassessed text.*destroy target artifact/);
	assert.match(assessmentProblems(abrade, { ...modes, procedures: [{ ...modes.procedures![0]!, basis: "Choose one — ... Draw two cards." }] }).join("; "), /is not on Abrade/);
	assert.match(registrationProblems([{ card: "Rockface Village", registers: [{ kind: "continuous", basis: universe.cards.get("Rockface Village")!.oracle.split("\n").at(-1)!,
		affects: { types: ["creature"], controller: "you" }, change: { power: 1, words: ["haste"] } }] }]).join("; "), /activated ability/,
		"the same interpreter lint refuses activated effects registered as free static bonuses");
	const lizard: Package = { card: "Magebane Lizard", registers: [{ kind: "watch", basis: universe.cards.get("Magebane Lizard")!.oracle,
		event: { on: "cast", of: { not: { types: ["creature"] } }, by: "any" },
		effect: { instructions: [{ do: "damage", to: "event:player", amount: { history: "cast", by: "event:player", of: { not: { types: ["creature"] } } } }] } }] };
	assert.equal(registrationProblems([lizard]).length, 2, "both the watch and the history count must match stack objects");
	const corrected = JSON.parse(JSON.stringify(lizard).replaceAll('"of":{"not"', '"of":{"zones":["stack"],"not"')) as Package;
	assert.deepEqual(registrationProblems([corrected]), [], "the model can correct the selectors without core interpreting prose");
	assert.match(assessmentProblems(printed, { ...pack, registers: [], procedures: [normal(pack.card, printed.oracle)] }).join("; "), /Unassessed text.*flying/,
		"a bare cast quoting the whole card cannot stand in for its abilities");
	let rounds = 0;
	const counted = tally();
	const stream: Stream = (_model, request, options) => {
		rounds++;
		assert.equal(options!.maxTokens, ASSESSMENT_CEILING);
		assert.ok(JSON.stringify(request.messages).includes("Flying, haste"));
		assert.doesNotMatch(JSON.stringify(request.tools!.find((one) => one.name === "submit")!.parameters), /\$ref|\$defs/);
		if (rounds === 2) assert.match(JSON.stringify(request.messages), /Unassessed text.*flying/);
		return { result: async () => ({ stopReason: "toolUse", content: [{ type: "toolCall", id: `a${rounds}`, name: "submit", arguments: {
			registers: rounds === 1 ? pack.registers.slice(1) : pack.registers, procedures: pack.procedures, unsupported: [],
		} }] }) };
	};
	const accepted = await assessCard(pack.card, printed, reasoner({ role: "pregame", stream, model: { id: "fixture", provider: "offline" } as never, tally: counted }), universe);
	assert.equal(rounds, 2);
	assert.deepEqual(accepted, pack);
	editWork(table, 1, [{ do: "package.put", package: accepted }], "prepared-hellkite");
	const before = structuredClone(table);
	assert.throws(() => editWork(table, 1, [{ do: "package.put", package: { card: pack.card, registers: [] } }], "erase-abilities"), /Unassessed text/);
	assert.deepEqual(table, before, "an incomplete correction changes neither equipment nor physical state");
	assert.equal(table.ledger.length, 0);
	assert.equal(table.cursor.clock, clock);

	const header: Header = { id: "assessed", format: table.format.name, seed: table.rng.seed,
		seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: "cards/standard.tsv", generated: universe.generated }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
	const dir = mkdtempSync(join(tmpdir(), "magic-assessed-")), journal = open(join(dir, "parent.jsonl"), header);
	save(journal, table);
	fork(journal.path, 0, "clone", join(dir, "clone.jsonl"));
	const { table: clone } = replay(join(dir, "clone.jsonl"), () => matchTable(table.rng.seed));
	assert.deepEqual(clone.work, table.work);
	assert.equal(clone.ledger.length, 0, "version zero owns accepted meaning, with no opening decisions");

	// An established position tests card mechanics; the journal test below uses ordinary dealing.
	const [nova] = place(table, 1, "hand", "Nova Hellkite");
	place(table, 1, "battlefield", ...Array(5).fill("Mountain"));
	const [ground] = place(table, 0, "battlefield", "Icetill Explorer");
	main(table, 1);
	const offered = nextDecision(table)!.options.filter((one) => one.objects?.[0]?.id === nova!.id);
	assert.equal(offered.length, 2, "normal and warp casts come from preparation, with no bare duplicate");
	const frame = workFrame(table, 1), available = actions(frame);
	assert.deepEqual(available["prepared:0"]!.action, { procedure: pack.procedures![0] });
	const plan = changedPlan({ objective: "Attack in the air.", guidance: "Cast before combat.", steps: [] }, {
		steps: [{ label: "Cast Nova", when: {}, action: { reuse: "prepared:0" } }],
	}, available);
	assert.deepEqual(plan.steps[0]!.action, available["prepared:0"]!.action);
	apply(table, offered.find((one) => one.label.startsWith("Cast Nova"))!.id, "model", "chosen");
	passBoth(table); finish(table);
	assert.deepEqual(characteristics(table, nova!)!.words.sort(), ["flying", "haste"]);
	assert.equal(sick(workFrame(table, 1), project(table, 1).objects!.find((one) => one.id === nova!.id)!), false, "prepared haste permits attacking on entry");
	assert.equal(nextDecision(table)!.situation, "trigger-order", "the enters ability did not depend on a turn-plan edit");
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
	passBoth(table); finish(table);
	assert.equal(ground!.damage, 1);
	for (let guard = 0; guard < 100; guard++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		if (decision.options.some((one) => one.id === "attack:done")) {
			apply(table, decision.options.find((one) => one.id !== "attack:done")!.id, "model", "chosen");
			apply(table, "attack:done", "model", "chosen"); break;
		}
		apply(table, quiet(decision.options).id, "model", "chosen");
	}
	for (let guard = 0; guard < 100; guard++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		if (decision.options.some((one) => one.id === "block:done")) break;
		apply(table, quiet(decision.options).id, "model", "chosen");
	}
	assert.match(nextDecision(table)!.options.find((one) => one.id.startsWith("block:") && one.id !== "block:done")!.shows!, /flying/i);

	const shock: Package = { card: "Shock", assessed: true, registers: [], procedures: [{ ...normal("Shock", universe.cards.get("Shock")!.oracle),
		targets: [{ object: { zones: ["battlefield"], types: ["creature", "planeswalker", "battle"] }, player: "any" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] }] };
	const response = matchTable("prepared-response");
	editWork(response, 1, [{ do: "package.put", package: shock }], "prepared-shock");
	place(response, 1, "hand", "Shock"); place(response, 1, "battlefield", "Mountain");
	main(response, 0); apply(response, "pass", "model", "chosen");
	assert.ok(nextDecision(response)!.options.some((one) => one.label.startsWith("Cast Shock")), "a nonactive seat has its prepared instant without a strategy call");
	assert.deepEqual(planProblems(workFrame(response, 1), { objective: "Answer the threat.", guidance: "Use the prepared instant.", steps: [], may: [
		{ label: "Shock", when: { active: "opponent" }, action: { prefix: "cast:", objects: { card: "Shock" } } },
	] }), [], "cast prefixes include instants and flash spells on the opponent's turn");

	// Same terms, ordinary opening and lands, stopping as soon as the cast enters.
	for (let guard = 0; guard < 1000; guard++) {
		const decision = nextDecision(clone);
		if (!decision) { advance(clone); continue; }
		const discard = decision.options.find((one) => one.label.startsWith("Discard ") && !/Nova Hellkite|Mountain/.test(one.label));
		const choice = decision.options.find((one) => one.label.startsWith("Cast Nova Hellkite")) ?? decision.options.find((one) => one.label === "Play Mountain") ?? discard ?? quiet(decision.options);
		apply(clone, decision.situation === "pregame" ? "keep" : choice.id, "model", "chosen");
		if ([...clone.things.values()].some((one) => one.card === pack.card && one.zone === "battlefield")) break;
	}
	assert.ok(clone.ledger.some((row) => row.activation?.claim === "Cast Nova Hellkite"));
	const child = open(join(dir, "played.jsonl"), { ...header, id: "played" }); save(child, clone);
	const { table: again } = replay(child.path, () => matchTable(clone.rng.seed));
	assert.deepEqual(again.work, clone.work);
	assert.deepEqual(again.ledger, clone.ledger);
	assert.deepEqual(again.things, clone.things);

	const unready = matchTable("assessment-missing-model");
	await assert.rejects(seat(unready, async () => [{ role: "decide", pattern: "fixture", model: { id: "fixture", type: "classifier" } as never }, { role: "pregame", pattern: "off", off: true }],
		{ classify: async () => assert.fail("No gameplay before assessment"), stream: () => assert.fail("No model substitution") }, universe, { format: "standard" }), /needs a pregame model/);
	assert.equal(unready.ledger.length, 0);
	assert.equal(unready.cursor.clock, clock);
	await assert.rejects(assessCard(pack.card, printed, { work: async (_about, _prompt, tools) => {
		assert.equal(tools.submit.check({ registers: [], procedures: [], unsupported: ["Warp: fixture reports an unsupported operation."] }), null); return {};
	} }, universe), /is not ready: Warp/);

	let running = 0, peak = 0, calls = 0;
	const unsupported: Stream = (_model, request) => {
		const card = JSON.parse((request.messages[0] as { content: string }).content).card;
		calls++; peak = Math.max(peak, ++running);
		return { result: async () => {
			await new Promise((resolve) => setImmediate(resolve)); running--;
			return { stopReason: "toolUse", content: [{ type: "toolCall", id: "assessment", name: "submit", arguments: card === pack.card
				? { registers: pack.registers, procedures: pack.procedures, unsupported: [] }
				: { registers: [], procedures: [], unsupported: ["Fixture reports a missing operation."] } }] };
		} };
	};
	const partial = open(join(dir, "partial.jsonl"), { ...header, id: "partial", seed: unready.rng.seed });
	const attempt = () => seat(unready, async () => [{ role: "decide", pattern: "fixture", model: { id: "fixture", type: "classifier" } as never },
		{ role: "pregame", pattern: "fixture", model: { id: "fixture", type: "chat", provider: "offline" } as never }],
		{ classify: async () => assert.fail("No gameplay before assessment"), stream: unsupported }, universe, { format: "standard", journal: partial });
	await assert.rejects(attempt(), (error: unknown) => {
		assert.match(String(error), /Card assessment is incomplete/);
		assert.equal((error as { spends: unknown[] }).spends.length, calls, "failed preparation keeps the bill"); return true;
	});
	assert.equal(calls, 2 * Object.values(unready.printed).filter((one) => one.text).length);
	assert.equal(peak, 4, "card assessment concurrency is bounded across seats");
	assert.equal(unready.ledger.length, 0);
	assert.equal(unready.cursor.clock, clock);
	assert.deepEqual(unready.work[0]!.packages, [pack]);
	assert.deepEqual(unready.work[1]!.packages, [pack]);
	assert.deepEqual(replay(partial.path, (header) => matchTable(header.seed)).table.work, unready.work, "accepted assessments are durable even when setup fails");
	const initialCalls = calls;
	await assert.rejects(attempt(), /Card assessment is incomplete/);
	assert.equal(calls - initialCalls, initialCalls - 2, "retry does not reassess either seat's accepted card");
});
