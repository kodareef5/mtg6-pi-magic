import { load as loadRules } from "../src/core/rules.ts";
import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { focus, type Packet } from "../src/context/packet.ts";
import { advance, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import type { Intent } from "../src/core/intent.ts";
import { play } from "../src/core/loop.ts";
import { PlayerUnavailable, type Player } from "../src/core/player.ts";
import { commit, start } from "../src/core/commit.ts";
import { project, sinceDecision } from "../src/core/view.ts";
import { fork, replay } from "../src/core/journal.ts";
import type { Frame } from "../src/core/types.ts";
import { abilityExercise } from "../tools/ability-fixture.ts";
import { startingIntent } from "../src/context/plan.ts";
import { choices, inspect, type Inspection } from "../src/context/choices.ts";
import { aiSeat, question } from "../src/context/seat.ts";
import { establish, example, main, matchup, offered, place } from "./play.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { annotate, planState } from "../src/core/planning.ts";
import { combatDamage, declareBlockers } from "../src/core/combat.ts";
import { CHOICE_LIMIT, decisionApi, type DecisionApi } from "../src/context/model.ts";
import { tally } from "../src/context/spend.ts";
import { dossier } from "../src/context/dossier.ts";
import { matchTable, universe } from "../tools/matchup-fixture.ts";
import type { Brief } from "../src/context/brief.ts";

test("context preserves the seat's options, shows the plan the seat flies, and carries neither deck lists nor registrations", async () => {
	const table = start(standard, [
		{ name: "A", deck: deck("Green Stompy") },
		{ name: "B", deck: deck("Dimir Control") },
	], "context");
	const intent: Intent = startingIntent(0);
	const frame = () => ({ seat: 0, version: table.log.length, view: project(table, 0), decision: nextDecision(table)! });
	advance(table);
	const opening = frame();
	const before = structuredClone(opening);
	const packet = focus(opening, intent);
	assert.deepEqual(packet.options, opening.decision.options);
	// No rules were handed in, so nothing is advertised. Advertising a route
	// cannot make it answerable. test/dial.test.ts is the dialer's own test.
	assert.deepEqual(packet.routes, []);
	assert.equal(JSON.stringify(packet).includes("Qiqirn Merchant"), false, "no deck lists, so nothing names a card this seat has not seen");
	const hand = opening.view.objects!.filter((one) => one.zone === "hand");
	assert.equal(packet.opening?.hand.cards, 7);
	assert.equal(packet.opening?.hand.lands, hand.filter((one) => table.printed[one.card!]!.type.includes("Land")).length);
	assert.equal(packet.opening?.hand.unknown, 0);
	const masked = focus({ ...opening, view: { ...opening.view, objects: opening.view.objects!.map((one) => ({ ...one, card: undefined })) } }, intent);
	assert.deepEqual(masked.opening?.hand, { cards: 7, lands: 0, unknown: 7, spells: [] }, "registered counts and hidden traits cannot identify an opening card");
	assert.equal(project(table, "spectator").opening, undefined, "the spectator has no private opening hand assessment");
	for (const object of hand) if (object.card) assert.equal(packet.cards[object.card]!.oracle, table.printed[object.card]!.oracle, "the mulligan reads the hand's actual text");
	for (const name of Object.keys(packet.cards)) assert.ok(hand.some((object) => object.card === name), "hidden assignments supply no card facts");
	packet.options[0]!.label = "Changed by a consumer";
	assert.deepEqual(opening, before);
	assert.throws(() => focus(opening, { ...intent, seat: 1 }), /own seat/);

	const exchange = await abilityExercise();
	const paused = exchange.paused[0]!.frame;
	const original = structuredClone(paused);
	const compact = focus(paused, startingIntent(paused.seat));
	assert.deepEqual(compact.options.map((option) => option.id), paused.decision!.options.map((option) => option.id));
	assert.deepEqual(compact.resolution, paused.view.resolution);
	for (const object of compact.objects) assert.ok(paused.view.objects!.some((one) => one.id === object.id && one.incarnation === object.incarnation), "every decision fact comes from the seat's projection");
	for (const option of paused.decision!.options) for (const ref of option.objects ?? [])
		if (paused.view.objects!.some((one) => one.id === ref.id && one.incarnation === ref.incarnation))
			assert.ok(compact.objects.some((one) => one.id === ref.id && one.incarnation === ref.incarnation), "every offered selection keeps its visible object facts");
	assert.equal(JSON.stringify(compact.objects).includes("registrations"), false, "registrations stay with strategy");
	for (const object of compact.objects) if (paused.view.printed?.[object.name])
		assert.deepEqual(compact.cards[object.name], paused.view.printed[object.name], "public permanents and stack objects retain their source text");
	assert.equal(compact.resolving?.objective, undefined, "audit rationale does not instruct resolution");
	assert.equal(compact.plan, undefined, "resolution carries its purpose, not the next phase's casting line");
	const withoutWork = focus({ ...paused, view: { ...paused.view, work: undefined } }, startingIntent(paused.seat));
	assert.equal(withoutWork.plan, undefined);
	assert.deepEqual(withoutWork.objects, compact.objects);
	compact.objects[0]!.name = "Consumer edit";
	Object.values(compact.cards)[0]!.oracle = "Consumer edit";
	assert.deepEqual(paused, original, "the compact packet does not share mutable state");

	const targets = matchup("focused-payments");
	place(targets, 1, "hand", "Shock", "Abrade");
	place(targets, 1, "battlefield", "Mountain", "Mountain");
	place(targets, 0, "battlefield", "Llanowar Elves");
	main(targets, 1, 2);
	const offers = offered(targets, example("Cast Shock"));
	assert.ok(offers.length > 2, "the fixture compares actual target and payment combinations");
	const policy = "Target the opposing Llanowar Elves; pay with an untapped Mountain.";
	editWork(targets, 1, [{ do: "plan.put", plan: { objective: "Audit only", guidance: "Audit rationale only", throughTurn: 3,
		steps: [{ label: "Remove the Elf", purpose: policy, when: { step: "precombat-main" }, action: { procedure: example("Cast Shock") } }] } }], "choices-policy");
	const sourceFrame = workFrame(targets, 1);
	const decision = { ...sourceFrame.decision!, options: [...offers.map((one) => one.option), { id: "pass", label: "Pass priority" }] };
	const choiceFrame = { ...sourceFrame, decision };
	decision.options = annotate(decision.options, planState(choiceFrame)!);
	const originalChoices = structuredClone(choiceFrame), facts = choices(decision.options);
	const paths = new Map<string, string[]>(), visited = new Set<string>();
	const walk = (selected: Inspection, path: string[]) => {
		const key = JSON.stringify(selected);
		if (visited.has(key)) return; visited.add(key);
		const menu = inspect(facts, selected);
		for (const option of menu.options) {
			if (Object.hasOwn(menu.enter, option.id)) walk(menu.enter[option.id]!, [...path, option.id]);
			else if (!paths.has(option.id)) paths.set(option.id, [...path, option.id]);
		}
	};
	walk({}, []);
	assert.deepEqual([...paths.keys()].sort(), decision.options.map((one) => one.id).sort(), "every original move and pass stays reachable");
	for (const offer of offers) {
		const path = ["inspect:use:0", "inspect:back", ...paths.get(offer.option.id)!], physical = structuredClone(targets);
		const pilot = aiSeat({ name: "Inspection", intent: startingIntent(1), onGap: assert.fail, api: { named: "fixture", async ask(request) {
			assert.deepEqual(targets, physical, "inspection never moves the table or edits equipment");
			const packet = request.state as unknown as Packet, choice = path.shift()!;
			assert.match(packet.plan!.due!, /Target the opposing Llanowar Elves; pay with an untapped Mountain/, "choices survive every use, target and payment inspection");
			assert.ok(JSON.stringify([packet.options, packet.uses]).includes(policy), "marked options retain the policy through inspection");
			assert.doesNotMatch(JSON.stringify(packet), /Audit rationale only/);
			const question = request.questions.pick!;
			assert.equal(question.type, "choice");
			if (question.type !== "choice") assert.fail();
			assert.ok(Object.hasOwn(question.criteria, choice));
			const option = packet.options.find((one) => one.id === choice)!;
			assert.ok(packet.cards.Shock);
			assert.equal(packet.cards.Abrade, undefined, "an unrelated card in hand contributes no card text");
			if (!choice.startsWith("inspect:")) {
				assert.deepEqual(option.targets, offer.activation.targets);
				assert.deepEqual(packet.payments[option.payment!]!.paid, offer.activation.paid);
				assert.deepEqual(packet.payments[option.payment!]!.funding?.map((id) => packet.funding[id]), offer.activation.funding);
				for (const tap of offer.activation.funding ?? []) assert.ok(option.label.includes(`tap Mountain (${tap.source.id}@${tap.source.incarnation}) for R`), "payment alternatives name their physical sources directly");
			}
			return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } };
		} } });
		const answer = await pilot.answer(choiceFrame);
		assert.equal(answer.kind, "pick");
		if (answer.kind !== "pick") assert.fail();
		assert.equal(answer.option, offer.option.id);
		assert.equal(path.length, 0, "revisiting an inspected use stays available, and the final payment requires its own answer");
		await pilot.close();
	}
	assert.deepEqual(choiceFrame, originalChoices, "factoring and every inspection leave the original offers intact");

	// Target alternatives must differ in the classifier's descriptions, not only
	// in opaque ids or a separate detail field. No preference is added to a label.
	const triggered = matchup("focused-trigger-targets");
	main(triggered, 1, 2);
	const smaug = establish(triggered, 1, "Smaug the Magnificent");
	place(triggered, 0, "battlefield", "Icetill Explorer");
	commit(triggered, [{ do: "attack", attackers: [{ id: smaug.id, incarnation: smaug.incarnation, defending: 0 }] }], "combat");
	const triggerFrame = workFrame(triggered, 1), unchanged = structuredClone(triggerFrame);
	assert.equal(triggerFrame.decision!.situation, "trigger-order");
	const triggerPacket = focus(triggerFrame, startingIntent(1));
	const targetQuestion = question(triggerPacket, false);
	assert.equal(targetQuestion.type, "choice");
	if (targetQuestion.type !== "choice") assert.fail();
	const descriptions = triggerPacket.options.map((option) => targetQuestion.criteria[option.id]);
	assert.equal(new Set(descriptions).size, descriptions.length, "each target has a distinct readable choice");
	assert.ok(descriptions.some((text) => text!.includes("Target 1: player Green (seat 0, opponent)")));
	assert.ok(descriptions.some((text) => text!.includes("Target 1: Icetill Explorer")));
	assert.ok(triggerPacket.known.some((text) => text.includes("Green, opponent")), "the policy's player name is tied to its seat id");
	assert.deepEqual(triggerPacket.options.map((option) => option.id), triggerFrame.decision!.options.map((option) => option.id));
	assert.deepEqual(triggerFrame, unchanged);
	const entered = inspect(facts, inspect(facts, {}).enter["inspect:use:0"]!);
	assert.deepEqual(inspect(facts, entered.enter["inspect:back"]!).options, inspect(facts, {}).options, "backtracking restores all choices");

	// Reproduce the real partial declaration continuously from before Kellan,
	// then from its saved prefix. Compare full pilot requests, not just the board.
	const dir = mkdtempSync(join(tmpdir(), "magic-context-"));
	try {
		const path = join(dir, "parent.jsonl"), child = join(dir, "child.jsonl");
		writeFileSync(path, gunzipSync(readFileSync(new URL("fixtures/benchmarks/ready-before-help.jsonl.gz", import.meta.url))));
		fork(path, 365, "child", child);
		const saved = replay(path, (header) => matchTable(header.seed));
		const brief = saved.prepared.find((one) => one.seat === 1)!.made as Brief;
		type Request = Parameters<DecisionApi["ask"]>[0];
		const capture = async (source: string, version: number, retry: boolean) => {
			const position = replay(source, (header) => matchTable(header.seed), version).table;
			const requests: Request[] = [], frames: Frame[] = [], strategies: [string, string][] = [];
			const pilot = aiSeat({ name: "Probe", intent: startingIntent(1), onGap: assert.fail,
				chronicle: { briefs: { 1: brief }, recaps: [] },
				plan: async (frame) => {
					const context = { brief, cards: universe };
					strategies.push([dossier({ frame, ...context }), dossier({ frame: workFrame(position, frame.seat), ...context })]);
					return { tools: [{ do: "plan.keep", reason: "Continue the same attacks." }] };
				},
				api: { named: "offline", async ask(request) {
					requests.push(structuredClone(request));
					if (retry && requests.length <= 2) return { pick: { type: "choice", choice: requests.length === 1 ? "ask:help" : "bogus", confidence: 1, probabilities: {} } };
					throw new PlayerUnavailable("Captured the declaration question.");
				} },
			});
			const player: Player = { ...pilot, async answer(frame) {
				if (position.ledger.length === 364) return { kind: "pick", option: saved.table.ledger[364]!.picked, actionId: "Kellan" };
				frames.push(structuredClone(frame));
				return pilot.answer(frame);
			} };
			try { await play(position, { 0: player, 1: player }, {}); } finally { await pilot.close(); }
			return { requests, frames, strategies };
		};
		for (const retry of [false, true]) {
			const live = await capture(path, 364, retry), resumed = await capture(child, 365, retry);
			assert.equal(live.requests.length, retry ? 3 : 1);
			assert.deepEqual(resumed, live, "a clone reaches the same full frames, pilot packets and questions, including help and refusal retry");
			const request = live.requests[0]!.state as unknown as Packet;
			assert.equal(request.known.length, 2, "the real v365 question has no additional receipt history");
			const frame = live.frames[0]!, offline = workFrame(saved.table, 1);
			offline.view = project(saved.table, 1, sinceDecision(saved.table, 1));
			offline.decision = { ...offline.decision!, options: annotate(offline.decision!.options, planState(offline)!) };
			assert.deepEqual(offline, frame, "the benchmark pilot builds the loop's exact frame");
			const context = { brief, cards: universe };
			const expected = dossier({ frame: offline, ...context });
			for (const [loopFacts, savedFacts] of live.strategies) assert.equal(loopFacts, savedFacts, "planning receives the same dossier from loop and saved-position frames");
			assert.equal(dossier({ frame: { ...frame, view: { ...frame.view, since: ["A prior pilot receipt."] } }, ...context }), expected, "pilot receipt slices do not change the dossier");
			if (retry) assert.deepEqual(live.requests.map((one) => (one.state as unknown as Packet).known), [request.known, request.known, request.known]);
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test("inspection preserves every complete choice within provider capacity and never commits a partial action", async () => {
	const table = matchup("large-inspection");
	const hydra = establish(table, 0, "Mossborn Hydra");
	const elf = establish(table, 0, "Llanowar Elves", []);
	const blockers = [establish(table, 1, "Hired Claw", []), establish(table, 1, "Hired Claw", [])];
	main(table, 0, 3, "begin-combat");
	const ref = (one: typeof hydra) => ({ id: one.id, incarnation: one.incarnation });
	commit(table, [
		{ do: "counters", what: hydra.id, kind: "+1/+1", amount: 48 },
		{ do: "counters", what: blockers[1]!.id, kind: "+1/+1", amount: 1 },
		{ do: "attack", attackers: [hydra, elf].map((one) => ({ ...ref(one), defending: 1 })) },
		{ do: "block", blockers: blockers.map((one) => ({ ...ref(one), blocking: [ref(hydra)] })) },
	], "game-setup");
	const { moves, ...pending } = combatDamage(table)!;
	const decision = { ...pending, options: moves.map((one) => one.option) };
	assert.equal(decision.options.length, 1040, "the same size as the stopped game's damage decision");
	const frame = { ...workFrame(table, 0), decision }, before = structuredClone(table);
	frame.view.work = { revision: 0 };
	const paths = (facts: ReturnType<typeof choices>, capacity: number) => {
		const found = new Map<string, string[]>(), visited = new Set<string>();
		const walk = (selected: Inspection, path: string[]) => {
			const key = JSON.stringify(selected);
			if (visited.has(key)) return; visited.add(key);
			const menu = inspect(facts, selected, capacity);
			assert.ok(menu.options.length <= capacity);
			assert.equal(new Set(menu.options.map((one) => one.id)).size, menu.options.length);
			for (const option of menu.options) {
				if (Object.hasOwn(menu.enter, option.id)) walk(menu.enter[option.id]!, [...path, option.id]);
				else if (!found.has(option.id)) found.set(option.id, [...path, option.id]);
			}
		};
		walk({}, []);
		assert.deepEqual([...found.keys()].sort(), facts.options.map((one) => one.id).sort());
		return found;
	};
	const rules = loadRules("rules/cr.tsv");
	const boundary = { ...frame, decision: { ...decision, situation: "priority" as const }, view: { ...frame.view,
		blockDeclaration: { row: 10, clock: 20, seat: 1, blockers: [{ ...ref(blockers[0]!), blocking: [ref(hydra)] }], heard: false, current: [], conflicts: [] } } };
	const facts = choices(decision.options), capacity = CHOICE_LIMIT - 3;
	const routes = paths(facts, capacity);
	assert.match(inspect(facts, {}, capacity).field!, /^Damage to /);
	const packet = focus(frame, startingIntent(0), { inspection: {}, capacity });
	assert.match(packet.inspection!.facts!.join(" "), /lethal 2/);
	assert.match(packet.inspection!.facts!.join(" "), /lethal 3/);
	// Domain ranges and multiple filters must also work when the provider has
	// fewer slots than one recipient has possible amounts. No first-N shortcut.
	paths(facts, 8);
	paths(choices(decision.options.map(({ parameters: _, ...one }) => one)), capacity);
	const selected = decision.options.at(-1)!, path = [...routes.get(selected.id)!];
	const pilot = aiSeat({ name: "Large inspection", judge: true, rules, intent: startingIntent(0), onGap: assert.fail,
		plan: async () => { throw new Error("Inspection cannot invoke strategy"); },
		api: { named: "fixture", async ask(request) {
			assert.deepEqual(table, before);
			const question = request.questions.pick!;
			assert.equal(question.type, "choice"); if (question.type !== "choice") assert.fail();
			assert.ok(Object.keys(question.criteria).length <= CHOICE_LIMIT);
			assert.ok(Object.hasOwn(question.criteria, "ask:help"), "capacity includes the help route");
			assert.ok(Object.hasOwn(question.criteria, "rules:priority"));
			assert.ok(Object.hasOwn(question.criteria, "object:block:10"));
			const choice = path.shift()!;
			assert.ok(Object.hasOwn(question.criteria, choice));
			return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } };
		} } });
	const answer = await pilot.answer(boundary);
	assert.equal(answer.kind, "pick"); if (answer.kind !== "pick") assert.fail();
	assert.equal(answer.option, selected.id); assert.equal(path.length, 0);
	await pilot.close();
	assert.deepEqual(table, before);
	// Blocks share the same inspection: one blocker, then the complete block.
	const blocks = choices(declareBlockers(table).moves.map((one) => one.option));
	assert.equal(blocks.options.length, 5);
	assert.equal(inspect(blocks, {}, 4).field, "Blocker");
	paths(blocks, 4);
	const counted = tally();
	const api = decisionApi(async () => { throw new Error("An oversized request reached the provider"); },
		{ id: "fixture", provider: "offline", api: "typesafe-system-one" } as never, { tally: counted });
	await assert.rejects(api.ask({ state: {}, questions: { pick: { type: "choice", instructions: "Choose a complete action.",
		criteria: Object.fromEntries(decision.options.map((one) => [one.id, one.label])) } } }), /255-choice capacity/);
	assert.equal(counted.spent().length, 0, "local refusal is not billed as a model request");
});

test("a retry packet differs from the first only by the refusal it carries", async () => {
	const table = start(standard, [
		{ name: "A", deck: deck("Green Stompy") },
		{ name: "B", deck: deck("Dimir Control") },
	], "refused");
	const intent: Intent = {
		seat: 0, version: 0,
		deck: { seat: 0, priorities: ["Develop mana"] },
		turn: { objective: "Keep a playable hand", budget: [], hypotheses: [] },
		phase: { turn: 1, phase: "beginning", order: [], expectedBranches: [], reconsiderWhen: [], assumptions: [] },
	};

	// Build the packet from what the loop actually hands a seat, so the test
	// covers the whole path rather than a packet assembled by hand.
	const packets: Packet[] = [];
	const seat = (id: number): Player => ({
		name: `seat-${id}`,
		async answer(frame) {
			if (frame.seat === 0) packets.push(focus(frame, intent));
			if (packets.length === 1) return { kind: "pick", option: "nope", actionId: "bad" };
			const options = frame.decision!.options;
			return { kind: "pick", option: options[0]!.id, actionId: `ok-${packets.length}` };
		},
		observe() {}, close() {},
	});
	assert.ok(await play(table, { 0: seat(0), 1: seat(1) }, {}));

	const [first, retry] = packets;
	assert.equal(first!.refused, undefined);
	assert.equal(retry!.refused?.length, 1);
	assert.match(retry!.refused![0]!, /No option "nope"/);
	// The question did not change, so neither did anything a model reasons over.
	assert.deepEqual({ ...retry, refused: undefined }, { ...first, refused: undefined });
	assert.equal(table.ledger.filter((r) => r.why === "fallback").length, 0);
});
