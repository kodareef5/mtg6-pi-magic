/**
 * The idempotent invariant: the same actionId applied twice changes the game
 * once. The other three invariants named in AGENTS.md (no leak, replay, forced)
 * need the engine and have no test yet.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Decision } from "../../src/core/types.ts";
import type { Act } from "../../src/seating/protocol.ts";
import { judgeAct } from "../../src/seating/host.ts";

const decision: Decision = {
	situation: "priority",
	seat: 5,
	question: "You have priority.",
	options: [
		{ id: "pass", label: "Pass" },
		{ id: "cast-elf-g", label: "Cast Llanowar Elves, tapping Forest for G" },
	],
};

const act: Act = {
	type: "act",
	seat: 5,
	version: 147,
	actionId: "a1",
	option: "cast-elf-g",
};

const at = (over: Partial<Parameters<typeof judgeAct>[1]> = {}) => ({
	version: 147,
	decision,
	applied: new Map<string, string>(),
	...over,
});

test("a fresh pick on the current frame applies", () => {
	assert.deepEqual(judgeAct(act, at()), { kind: "apply" });
});

test("the same actionId and pick replays instead of applying twice", () => {
	const applied = new Map([["a1", "cast-elf-g"]]);
	assert.deepEqual(judgeAct(act, at({ applied })), { kind: "replay" });
});

test("a reused actionId carrying a different pick is refused", () => {
	const applied = new Map([["a1", "pass"]]);
	assert.deepEqual(judgeAct(act, at({ applied })), {
		kind: "refuse",
		refused: "duplicate",
	});
});

test("a replay is judged before staleness, so a dropped socket is recoverable", () => {
	const applied = new Map([["a1", "cast-elf-g"]]);
	assert.deepEqual(judgeAct(act, at({ applied, version: 148 })), { kind: "replay" });
});

test("a pick answering an older frame is stale", () => {
	assert.deepEqual(judgeAct(act, at({ version: 148 })), {
		kind: "refuse",
		refused: "stale",
	});
});

test("a pick with nothing pending is not this seat's turn", () => {
	assert.deepEqual(judgeAct(act, at({ decision: null })), {
		kind: "refuse",
		refused: "not-your-turn",
	});
});

test("a pick for another seat's decision is not this seat's turn", () => {
	assert.deepEqual(judgeAct(act, at({ decision: { ...decision, seat: 2 } })), {
		kind: "refuse",
		refused: "not-your-turn",
	});
});

test("an id the host never offered is refused", () => {
	assert.deepEqual(judgeAct({ ...act, option: "deal-40-damage" }, at()), {
		kind: "refuse",
		refused: "unknown-option",
	});
});
