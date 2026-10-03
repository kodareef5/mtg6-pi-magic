import { strict as assert } from "node:assert";
import { test } from "node:test";

import { focus, type Packet } from "../src/context/packet.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import type { Intent } from "../src/core/intent.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import { start } from "../src/core/commit.ts";
import { project } from "../src/core/view.ts";

test("context preserves the seat's options and knowledge and scopes assumptions to a turn and phase", () => {
	const table = start(standard, [
		{ name: "A", deck: Array(60).fill("Forest") },
		{ name: "B", deck: Array(60).fill("Swamp") },
	], "context");
	const intent: Intent = {
		seat: 0, version: 0,
		deck: { seat: 0, priorities: ["Develop mana"] },
		turn: { objective: "Evaluate combat", budget: [], hypotheses: ["Opponent may hold removal"] },
		phase: { turn: 1, phase: "combat", order: [], expectedBranches: [], reconsiderWhen: [], assumptions: ["The attack may be profitable"] },
	};
	const frame = () => ({ seat: 0, version: table.log.length, view: project(table, 0), decision: nextDecision(table)! });
	advance(table);
	const opening = frame();
	const before = structuredClone(opening);
	const packet = focus(opening, intent);
	assert.deepEqual(packet.options, opening.decision.options);
	assert.deepEqual(packet.assumed, []);
	// No rules were handed in, so nothing is advertised. Advertising a route
	// cannot make it answerable. test/dial.test.ts is the dialer's own test.
	assert.deepEqual(packet.routes, []);
	assert.equal(JSON.stringify(packet).includes("Swamp"), false);
	packet.options[0]!.label = "Changed by a consumer";
	assert.deepEqual(opening, before);
	assert.throws(() => focus(opening, { ...intent, seat: 1 }), /own seat/);
	apply(table, "keep", "model", "chosen");
	apply(table, "keep", "model", "chosen");
	advance(table);
	while (table.cursor.steps[0] !== "begin-combat" || table.cursor.priority !== 0) {
		const decision = nextDecision(table);
		if (decision) apply(table, decision.options[0]!.id, "model", "chosen");
		else advance(table);
	}
	assert.deepEqual(focus(frame(), intent).assumed, [...intent.turn.hypotheses, ...intent.phase.assumptions]);
	assert.deepEqual(focus(frame(), { ...intent, phase: { ...intent.phase, turn: 2 } }).assumed, []);
	assert.deepEqual(focus(frame(), { ...intent, phase: { ...intent.phase, phase: "ending" } }).assumed, []);
});

test("a retry packet differs from the first only by the refusal it carries", async () => {
	const table = start(standard, [
		{ name: "A", deck: Array(60).fill("Forest") },
		{ name: "B", deck: Array(60).fill("Swamp") },
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
