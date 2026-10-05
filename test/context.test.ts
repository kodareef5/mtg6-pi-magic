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
	assert.deepEqual(compact.objects.map((object) => object.id).sort(),
		paused.view.objects!.filter((object) => object.zone === "battlefield" || object.zone === "stack").map((object) => object.id).sort(), "public objects, with or without a plan");
	assert.equal(JSON.stringify(compact.objects).includes("registrations"), false, "registrations stay with strategy");
	for (const object of compact.objects) if (paused.view.printed?.[object.name])
		assert.deepEqual(compact.cards[object.name], paused.view.printed[object.name], "public permanents and stack objects retain their source text");
	assert.equal(compact.plan?.objective, paused.view.work!.plan!.objective);
	const withoutWork = focus({ ...paused, view: { ...paused.view, work: undefined } }, startingIntent(paused.seat));
	assert.equal(withoutWork.plan, undefined);
	assert.deepEqual(withoutWork.objects, compact.objects);
	compact.objects[0]!.name = "Consumer edit";
	Object.values(compact.cards)[0]!.oracle = "Consumer edit";
	assert.deepEqual(paused, original, "the compact packet does not share mutable state");
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
