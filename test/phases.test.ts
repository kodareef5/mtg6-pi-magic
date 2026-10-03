import { strict as assert } from "node:assert";
import { test } from "node:test";

import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import { start } from "../src/core/commit.ts";
import { project } from "../src/core/view.ts";

const table = () => start(standard, [
	{ name: "A", deck: Array(60).fill("Forest") },
	{ name: "B", deck: Array(60).fill("Swamp") },
], "phases");

test("listed actions stay in their window and a pending choice cannot be skipped", () => {
	const built = table();
	advance(built);
	const before = structuredClone(built);
	assert.throws(() => advance(built), /pending decision/);
	assert.deepEqual(built, before);
	const version = built.log.length;
	apply(built, "mulligan", "model", "chosen");
	assert.ok(built.log.length > version, "a declaration is an event other seats read");
	assert.match(project(built, 1).table.join("\n"), /mulligan/);
	apply(built, "keep", "model", "chosen");
	advance(built);
	assert.deepEqual(project(built, 0).window, { kind: "opening", action: "declare" });
	assert.match(project(built, 0).yours.join("\n"), /puts 1 on the bottom/);
	apply(built, "keep", "model", "chosen");
	advance(built);
	assert.deepEqual(project(built, 0).window, { kind: "opening", action: "bottom" });
	const bottom = nextDecision(built)!;
	assert.ok(bottom.options.every((o) => o.id.startsWith("bottom:")));
	apply(built, bottom.options[0]!.id, "model", "chosen");
	assert.equal(project(built, 0).window.kind, "turn");
	assert.throws(() => apply(built, bottom.options[1]!.id, "model", "chosen"));
	assert.equal(built.cursor.steps.includes("draw"), false);
	while (built.cursor.turn === 1) {
		const d = nextDecision(built);
		if (!d) { advance(built); continue; }
		assert.notEqual(d.situation, "pregame");
		for (const o of d.options) {
			assert.equal(o.id.startsWith("bottom:"), false);
			assert.notEqual(o.id, "draw");
			if (o.id.startsWith("land:")) {
				assert.ok(["precombat-main", "postcombat-main"].includes(built.cursor.steps[0]!));
				assert.equal(d.seat, built.cursor.active);
			}
			if (o.id.startsWith("discard:")) assert.equal(built.cursor.steps[0], "cleanup");
		}
		// A pass is a decision and moves the version, and it moves no cards, so
		// it is not an event and the log does not grow. Both halves matter: the
		// first is what catches a stale answer, the second is the stored size.
		const events = built.log.length;
		const answered = built.ledger.length;
		const clock = built.cursor.clock;
		const passing = d.options.length === 1 && d.options[0]!.id === "pass";
		apply(built, d.options[0]!.id, "model", "chosen");
		assert.ok(built.ledger.length > answered, "an answered decision moves the frame version");
		assert.ok(built.cursor.clock > clock, "every committed group moves the clock");
		if (passing) assert.equal(built.log.length, events, "a pass is not an event");
	}
	assert.ok(built.cursor.steps.includes("draw"));
});

test("table talk is offered once per seat at a real phase ending", async () => {
	const built = table();
	const endings = new Set<string>();
	const players: Record<number, Player> = Object.fromEntries(built.seats.map((seat) => [seat.id, {
		name: seat.name,
		async answer(frame) {
			return { kind: "pick", option: frame.decision!.options[0]!.id, actionId: "pick" };
		},
		async interject(frame) {
			const at = frame.view.window;
			assert.equal(at.kind, "turn");
			if (at.kind !== "turn") throw new Error("Expected a turn");
			const key = `${seat.id}/${at.turn}/${at.phase}`;
			assert.equal(endings.has(key), false, key);
			endings.add(key);
			return null;
		},
		observe() {}, close() {},
	} satisfies Player]));
	assert.ok(await play(built, players, {}));
	assert.deepEqual([...endings].filter((key) => key.startsWith("0/1/")), [
		"0/1/beginning", "0/1/precombat-main", "0/1/combat", "0/1/postcombat-main", "0/1/ending",
	]);
});
