import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { focus, type Packet } from "../src/context/packet.ts";
import { advance, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import type { Intent } from "../src/core/intent.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import { start } from "../src/core/commit.ts";
import { project } from "../src/core/view.ts";
import { abilityExercise } from "../tools/ability-fixture.ts";
import { startingIntent } from "../src/context/plan.ts";
import { choices, inspect, type Inspection } from "../src/context/choices.ts";
import { aiSeat } from "../src/context/seat.ts";
import { example, main, matchup, offered, place } from "./play.ts";
import { workFrame } from "../src/core/work-tools.ts";

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
	assert.equal(compact.resolving?.objective, paused.view.work!.plan!.objective);
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
	const sourceFrame = workFrame(targets, 1);
	const decision = { ...sourceFrame.decision!, options: [...offers.map((one) => one.option), { id: "pass", label: "Pass priority" }] };
	const choiceFrame = { ...sourceFrame, decision };
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
	const entered = inspect(facts, inspect(facts, {}).enter["inspect:use:0"]!);
	assert.deepEqual(inspect(facts, entered.enter["inspect:back"]!).options, inspect(facts, {}).options, "backtracking restores all choices");
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
