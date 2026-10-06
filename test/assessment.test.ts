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
import { quotes } from "../src/core/printed.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { commit } from "../src/core/commit.ts";
import type { Package, Procedure } from "../src/core/language.ts";
import { editWork, planProblems, workFrame } from "../src/core/work-tools.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { sick } from "../src/core/funding.ts";
import { project } from "../src/core/view.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { facts as strategyFacts } from "../src/context/strategy-facts.ts";
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
	assert.equal(quotes(table.printed["Rockface Village"], "{T}"), false, "a mana symbol is not a complete source statement");
	assert.equal(quotes(table.printed.Shock, "target ... a"), false, "ellipsis cannot join arbitrary word fragments");
	assert.equal(quotes(table.printed.Shock, "target"), false, "a whole word inside a sentence is still not the source statement");
	assert.equal(quotes(printed, "Flying, haste"), true, "short complete keyword lines remain valid without a word-count rule");
	assert.equal(quotes(printed, printed.oracle.split("\n").reverse().join(" ... ")), false, "joined statements preserve printed order");
	const modal = table.printed["Origin of Metalbending"]!;
	assert.equal(quotes(modal, modal.oracle), true, "a full multiline quotation keeps every printed bullet line");
	assert.deepEqual(assessmentProblems(printed, pack), []);
	const shared: Package = { ...pack, printedCast: true, procedures: pack.procedures!.slice(1) };
	assert.deepEqual(assessmentProblems(printed, shared), [], "the shared cast needs no empty per-card program");
	assert.match(assessmentProblems(printed, { ...shared, registers: [] }).join("; "), /Unassessed text.*flying/,
		"selecting a shared cast does not supply the permanent's abilities");
	assert.match(assessmentProblems(table.printed.Shock!, { card: "Shock", registers: [], printedCast: true }).join("; "), /targetless permanent/);
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
	const restricted: Package = { card: "Rockface Village", registers: [{ kind: "mana", basis: "{T}: Add {R}. Spend this mana only to cast a creature spell.", cost: { tap: true }, colors: ["R"], spendOnly: { types: ["creature"] } }] };
	assert.match(registrationProblems([restricted]).join("; "), /spendOnly needs explicit zones/);
	if (restricted.registers[0]!.kind !== "mana") assert.fail();
	restricted.registers[0]!.spendOnly!.zones = ["stack"];
	assert.deepEqual(registrationProblems([restricted]), [], "the interpreter checks explicit scope, not the meaning of card prose");
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
	const sharedAssessment = await assessCard(pack.card, printed, { work: async (_about, _prompt, tools) => {
		assert.equal(tools.submit.check({ registers: shared.registers, procedures: shared.procedures, printedCast: true, unsupported: [] }), null);
		return {};
	} }, universe);
	assert.deepEqual(sharedAssessment, shared);
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
	const sharedParent = structuredClone(table);
	editWork(sharedParent, 1, [{ do: "package.put", package: shared }], "shared-cast");
	const correctedCast = structuredClone(sharedParent);
	editWork(correctedCast, 1, [{ do: "package.put", package: { ...pack, printedCast: false } }], "replace-shared-cast");
	assert.equal(correctedCast.work[1]!.packages![0]!.printedCast, false, "a correction can withdraw the shared casting claim");
	const sharedJournal = open(join(dir, "shared-parent.jsonl"), { ...header, id: "shared-parent" });
	save(sharedJournal, sharedParent);
	fork(sharedJournal.path, 0, "shared-clone", join(dir, "shared-clone.jsonl"));
	const { table: sharedClone } = replay(join(dir, "shared-clone.jsonl"), () => matchTable(table.rng.seed));
	assert.deepEqual(sharedClone.work, sharedParent.work);
	assert.ok(actions(workFrame(sharedClone, 1))[`printed:${pack.card}`], "strategy reuses the same shared mechanic");
	for (const zone of ["hand", "graveyard", "exile"] as const) {
		const position = matchTable(`shared-${zone}`);
		editWork(position, 1, [{ do: "package.put", package: shared }], "shared-cast");
		const [card] = place(position, 1, zone, pack.card);
		place(position, 1, "battlefield", ...Array(5).fill("Mountain"));
		main(position, 1);
		const casts = () => nextDecision(position)!.options.filter((one) => one.use?.source.id === card!.id);
		if (zone !== "hand") {
			assert.equal(casts().length, 0, "a shared cast does not grant permission to play another zone");
			commit(position, [{ do: "note", note: { kind: "permit", by: 1, until: "indefinite",
				on: { id: card!.id, incarnation: card!.incarnation }, who: 1, fromTurn: position.cursor.turn } }], "game-setup");
		}
		assert.equal(casts().length, zone === "hand" ? 2 : 1, "one shared normal cast, plus warp only from hand");
		const ordinary = casts().find((one) => !one.use!.instructions.length)!;
		assert.ok(ordinary);
		apply(position, ordinary.id, "model", "chosen"); passBoth(position); finish(position);
		assert.equal(card!.zone, "battlefield");
		assert.deepEqual(characteristics(position, card!)!.words.sort(), ["flying", "haste"]);
	}
	// Older assessments expressed the ordinary cast as an empty hand procedure.
	// Its presence must not suppress that same cast in a separately permitted zone.
	const legacy = structuredClone(pack);
	legacy.procedures![0]!.source.zones = ["hand"];
	for (const zone of ["graveyard", "exile"] as const) {
		const position = matchTable(`legacy-${zone}`);
		editWork(position, 1, [{ do: "package.put", package: legacy }], "legacy-cast");
		const card = place(position, 1, zone, pack.card)[0]!;
		place(position, 1, "battlefield", ...Array(5).fill("Mountain")); main(position, 1);
		const casts = () => nextDecision(position)!.options.filter((one) => one.use?.source.id === card.id);
		assert.equal(casts().length, 0, "the old empty procedure grants no extra zone permission");
		commit(position, [{ do: "note", note: { kind: "permit", by: 1, until: "indefinite",
			on: { id: card.id, incarnation: card.incarnation }, who: 1, fromTurn: position.cursor.turn } }], "game-setup");
		assert.equal(casts().length, 1, "an accepted ordinary hand cast also supplies the shared cast where permission is earned");
		const accepted = structuredClone(position);
		for (const changed of [
			{ ...legacy, printedCast: false },
			{ ...legacy, procedures: legacy.procedures!.map((one, at) => at ? one : { ...one, cost: { mana: "{6}{R}" } }) },
		]) {
			const corrected = structuredClone(accepted);
			editWork(corrected, 1, [{ do: "package.put", package: changed }], "correction");
			assert.equal(nextDecision(corrected)!.options.filter((one) => one.use?.source.id === card.id).length, 0,
				"an explicit withdrawal or nonstandard casting cost cannot gain an unchecked default");
		}
		const ordinary = nextDecision(accepted)!.options.find((one) => one.use?.source.id === card.id)!;
		assert.equal(ordinary.use!.instructions.length, 0, "warp's delayed exile is not copied onto the normal cast");
		apply(accepted, ordinary.id, "model", "chosen"); passBoth(accepted); finish(accepted);
		assert.equal(accepted.things.get(card.id)!.zone, "battlefield");
	}

	// An established position tests card mechanics; the journal test below uses ordinary dealing.
	const [nova] = place(table, 1, "hand", "Nova Hellkite");
	place(table, 1, "battlefield", ...Array(5).fill("Mountain"));
	const [ground] = place(table, 0, "battlefield", "Icetill Explorer");
	main(table, 1);
	const offered = nextDecision(table)!.options.filter((one) => one.objects?.[0]?.id === nova!.id);
	assert.equal(offered.length, 2, "normal and warp casts come from preparation, with no bare duplicate");
	const frame = workFrame(table, 1), available = actions(frame);
	assert.equal(focus(frame, startingIntent(1)).watches.some((one) => one.source.name === pack.card), false, "a prepared card still in hand supplies no active watch");
	assert.equal(JSON.parse(strategyFacts(frame, {})).watches.some((one: { source: { name: string } }) => one.source.name === pack.card), false, "the writer reads the same battlefield facts");
	const preparedKey = `prepared:0 ${pack.procedures![0]!.claim}`;
	assert.deepEqual(available[preparedKey]!.action, { procedure: pack.procedures![0] });
	const plan = changedPlan({ objective: "Attack in the air.", guidance: "Cast before combat.", steps: [] }, {
		steps: [{ label: "Cast Nova", when: {}, action: { reuse: preparedKey } }],
	}, available);
	assert.deepEqual(plan.steps[0]!.action, available[preparedKey]!.action);
	apply(table, offered.find((one) => one.label.startsWith("Cast Nova"))!.id, "model", "chosen");
	passBoth(table); finish(table);
	assert.deepEqual(characteristics(table, nova!)!.words.sort(), ["flying", "haste"]);
	assert.ok(focus(workFrame(table, 1), startingIntent(1)).watches.some((one) => one.source.name === pack.card && one.event.on === "enters"), "entry activates the accepted watch without a strategy edit");
	assert.equal(sick(workFrame(table, 1), project(table, 1).objects!.find((one) => one.id === nova!.id)!), false, "prepared haste permits attacking on entry");
	for (const viewer of [0, 1] as const) assert.equal(project(table, viewer).objects!.find((one) => one.id === nova!.id)!.summoningSick, false, "both seats see the current effect of haste");
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

	// Both old programs and the shared mechanic survive an ordinary opening,
	// casting, and replay without asking a model to reinterpret the card.
	for (const [index, played] of [clone, sharedClone].entries()) {
		for (let guard = 0; guard < 1000; guard++) {
			const decision = nextDecision(played);
			if (!decision) { advance(played); continue; }
			const discard = decision.options.find((one) => one.label.startsWith("Discard ") && !/Nova Hellkite|Mountain/.test(one.label));
			const cast = decision.options.find((one) => one.use && played.things.get(one.use.source.id)?.card === pack.card && !one.use.instructions.length);
			const choice = cast ?? decision.options.find((one) => one.label === "Play Mountain") ?? discard ?? quiet(decision.options);
			apply(played, decision.situation === "pregame" ? "keep" : choice.id, "model", "chosen");
			if ([...played.things.values()].some((one) => one.card === pack.card && one.zone === "battlefield")) break;
		}
		assert.ok([...played.things.values()].some((one) => one.card === pack.card && one.zone === "battlefield"));
		const child = open(join(dir, `played-${index}.jsonl`), { ...header, id: `played-${index}` }); save(child, played);
		const { table: again } = replay(child.path, () => matchTable(played.rng.seed));
		assert.deepEqual(again.work, played.work);
		assert.deepEqual(again.ledger, played.ledger);
		assert.deepEqual(again.things, played.things);
	}

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
