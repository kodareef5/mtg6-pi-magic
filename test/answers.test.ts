import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import { play } from "../src/core/loop.ts";
import type { Answer, Player } from "../src/core/player.ts";
import { commit, start } from "../src/core/commit.ts";
import { cardsIn } from "../src/core/table.ts";
import type { Frame } from "../src/core/types.ts";

const table = () => start(standard, [
	{ name: "A", deck: deck("Green Stompy") },
	{ name: "B", deck: deck("Dimir Control") },
], "answers");

const player = (answer: Player["answer"]): Player => ({ name: "seat", answer, observe() {}, close() {} });
const pick = (frame: Frame): Answer => ({ kind: "pick", option: frame.decision!.options[0]!.id, actionId: "pick" });

test("unusable answers retry the same decision and never masquerade as choices", async () => {
	for (const failures of [1, 2]) {
		for (const invalid of [null, { kind: "pick", option: "bogus", actionId: "bad" }, new Error("offline")]) {
			const built = table();
			const frames: Frame[] = [];
			const bad = player(async (frame) => {
				frames.push(structuredClone(frame));
				if (frames.length <= failures) {
					if (invalid instanceof Error) throw invalid;
					return invalid as Answer;
				}
				return pick(frame);
			});
			assert.ok(await play(built, { 0: bad, 1: player(async (frame) => pick(frame)) }, {}));
			// Same decision, same view, same version. The one difference is that
			// the retry says why the last answer was not taken.
			assert.deepEqual({ ...frames[1], refused: undefined }, { ...frames[0], refused: undefined });
			assert.equal(frames[0]!.refused, undefined);
			assert.equal(frames[1]!.refused?.length, 1);
			assert.match(frames[1]!.refused![0]!, invalid instanceof Error ? /offline/ : /answer|option/);
			const fallback = failures === 2;
			assert.equal(built.ledger[0]!.why, fallback ? "fallback" : "chosen");
			assert.equal(built.ledger[0]!.picked, "keep");
			assert.equal(built.gaps.length, fallback ? 1 : 0);
		}
	}

	for (const selection of ["bottom", "discard"]) {
		const built = table();
		advance(built);
		apply(built, selection === "bottom" ? "mulligan" : "keep", "model", "chosen");
		apply(built, "keep", "model", "chosen");
		advance(built);
		if (selection === "bottom") {
			apply(built, "keep", "model", "chosen");
			advance(built);
		} else {
			built.cursor.steps = ["cleanup"];
			commit(built, cardsIn(built, "library", 0).slice(0, 2).map((c) => ({
				do: "move", what: c.id, to: "hand", reason: "draw",
			})), "draw");
		}
		const before = structuredClone(built);
		let calls = 0;
		const bad = player(async () => { calls++; return { kind: "pick", option: "bogus", actionId: "bad" }; });
		assert.equal(await play(built, { 0: bad, 1: bad }, {}), null);
		assert.equal(calls, 2);
		assert.deepEqual(built.things, before.things);
		assert.deepEqual(built.ledger, before.ledger);
		assert.deepEqual(nextDecision(built), nextDecision(before));
		assert.match(built.gaps[0]!, /no terminating option/);
		const good = player(async (frame) => pick(frame));
		assert.ok(await play(built, { 0: good, 1: good }, {}));
	}

	for (const request of [{ kind: "ask", route: "more-options" }, { kind: "delegate", instruction: "Play this turn" }] as const) {
		const built = table();
		advance(built);
		const before = structuredClone(built);
		let calls = 0;
		const asking = player(async () => { calls++; return request; });
		assert.equal(await play(built, { 0: asking, 1: asking }, {}), null);
		assert.equal(calls, 1);
		assert.deepEqual(built.things, before.things);
		assert.deepEqual(built.ledger, before.ledger);
		assert.deepEqual(nextDecision(built), nextDecision(before));
		assert.match(built.gaps[0]!, /not implemented/);
	}
});
