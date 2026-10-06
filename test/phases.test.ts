import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import type { Frame } from "../src/core/types.ts";
import { commit, start } from "../src/core/commit.ts";
import { project } from "../src/core/view.ts";

const table = () => start(standard, [
	{ name: "A", deck: deck("Green Stompy") },
	{ name: "B", deck: deck("Dimir Control") },
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
		// A pass commits, so it moves the version, and it moves no cards, so it
		// is not an event. Both halves matter: the first is what catches a stale
		// answer, the second is the stored size.
		const events = built.log.length;
		const version = built.cursor.clock;
		const passing = d.options.length === 1 && d.options[0]!.id === "pass";
		apply(built, d.options[0]!.id, "model", "chosen");
		assert.ok(built.cursor.clock > version, "a committed group moves the frame version");
		if (passing) assert.equal(built.log.length, events, "a pass is not an event");
	}
	assert.ok(built.cursor.steps.includes("draw"));
});

test("a turn hook that never answers does not stop the game", async () => {
	// The hook is presentational and the game is never waiting on it. A
	// commentator is a model call, so a loop that awaited one would run an order
	// of magnitude slower for a line no decision is blocked on. A hook whose
	// promise never settles is the strongest form of that: the game finishes
	// with every one of them outstanding.
	const built = table();
	let turns = 0;
	const answer = async (frame: Frame) => {
		const options = frame.decision!.options;
		const land = options.find((option) => option.id.startsWith("land:"));
		return { kind: "pick" as const, option: (land ?? options[0]!).id, actionId: `t${turns}` };
	};
	const seat = (name: string): Player => ({ name, answer, observe() {}, close() {} });
	const outcome = await play(built, { 0: seat("A"), 1: seat("B") }, {}, { onTurn: () => {
		turns += 1;
		return new Promise<void>(() => {});
	} });
	assert.ok(outcome, "the game finished with every hook still outstanding");
	assert.ok(turns > 50, `${turns} turn endings`);

	// A hook that throws is the hook's bug. It is recorded and the game goes on.
	const other = table();
	assert.ok(await play(other, { 0: seat("A"), 1: seat("B") }, {}, { onTurn: () => {
		throw new Error("the commentator fell over");
	} }));
	assert.ok(other.gaps.length > 50);
	assert.match(other.gaps[0]!, /hook failed: Error: the commentator fell over/);
});

test("the version moves for anything that commits, not only for an answer", () => {
	const built = table();
	advance(built);
	const asked = built.cursor.clock;
	const answered = built.ledger.length;

	// A life change settles no decision. A version that missed it would accept
	// a pick written before it, which is what a concession, a declared motion
	// or a judge repair will do once they are written.
	commit(built, [{ do: "change-life", who: 0, amount: -1, reason: "resolve" }], "resolve");
	assert.ok(built.cursor.clock > asked, "a committed group moves the version");
	assert.equal(built.ledger.length, answered, "and settles no decision");
	assert.deepEqual(project(built, 0).window, { kind: "opening", action: "declare" });
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
