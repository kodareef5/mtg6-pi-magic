import { strict as assert } from "node:assert";
import { test } from "node:test";

import { focus } from "../src/context/packet.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import type { Intent } from "../src/core/intent.ts";
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
	assert.deepEqual(packet.routes, {});
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
