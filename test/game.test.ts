/**
 * Milestone one: two seats play a legal Standard deck of basic lands to a
 * recorded end. Pass, play a land, untap, draw, mulligan, deck out.
 *
 * No leak, replay, and forced live here. Decision and phase invariants have
 * their own fixtures; idempotency for the parked wire lives in test/seating.
 * The game and projection fixtures stay together past 150 lines because the
 * visibility checks also observe every decision of a complete game.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { load } from "../src/core/cards.ts";
import { standard } from "../src/core/format.ts";
import { play } from "../src/core/loop.ts";
import { scriptedPlayer, type Player } from "../src/core/player.ts";
import { commit, start } from "../src/core/commit.ts";
import type { Table } from "../src/core/table.ts";
import type { Frame } from "../src/core/types.ts";
import { describe, project, render } from "../src/core/view.ts";

const universe = load("cards/standard.tsv");
const deck = (card: string) => Array.from({ length: 60 }, () => card);

/**
 * A seat that keeps its hand, plays a land when it can, and otherwise takes the
 * first option. Enough to finish a game, and it is a test fixture rather than
 * anything the product ships.
 */
function policy(name: string, seen: Frame[] = []): Player {
	return {
		name,
		async answer(frame) {
			seen.push(frame);
			const options = frame.decision!.options;
			const land = options.find((o) => o.id.startsWith("land:"));
			const pick = land ?? options[0]!;
			return { kind: "pick", option: pick.id, actionId: `${name}-${seen.length}` };
		},
		observe(frame) {
			seen.push(frame);
		},
		close() {},
	};
}

const table = () => start(standard, [{ deck: deck("Forest") }, { deck: deck("Swamp") }], "seed-1");

const finish = async (built: Table) => {
	const players = Object.fromEntries(built.seats.map((s) => [s.id, policy(s.name)]));
	return play(built, players, {});
};

test("the decks are legal before a card moves", () => {
	const built = table();
	assert.equal(built.seats.length, 2);
	assert.equal(built.things.size, 120);
	for (const s of built.seats) assert.equal(universe.cards.has(s.deck[0]!), true);
});

test("a game of lands finishes, and somebody decks out", async () => {
	const built = table();
	const outcome = await finish(built);
	assert.ok(outcome);
	const results = Object.values(outcome.results);
	assert.equal(results.filter((r) => r === "lose").length, 1);
	assert.equal(results.filter((r) => r === "win").length, 1);
	assert.ok(built.cursor.turn > 50, `${built.cursor.turn} turns`);
	assert.equal(built.gaps.length, 0);
});

test("forced: far more decisions are taken by the table than asked of a seat", async () => {
	const built = table();
	await finish(built);
	const by = (why: string) => built.ledger.filter((r) => r.why === why).length;
	assert.equal(by("fallback"), 0);
	assert.ok(by("forced") > by("chosen") * 2, `${by("forced")} forced, ${by("chosen")} chosen`);
	// Every row names what was offered, so a recorded game is a test corpus.
	for (const row of built.ledger) assert.ok(row.offered.includes(row.picked));

	// At the mulligan limit, keeping and the last bottom selection are forced too.
	const limited = table();
	limited.opening = { declared: {}, taken: { 0: 7 }, kept: [], owed: {} };
	commit(limited, [...limited.things.values()].filter((c) => c.owner === 0).slice(0, 7)
		.map((c) => ({ do: "move", what: c.id, to: "hand", reason: "draw" })), "game-setup");
	const strict = policy("strict");
	const answer = strict.answer;
	strict.answer = (frame) => { assert.ok(frame.decision!.options.length > 1); return answer(frame); };
	await play(limited, { 0: strict, 1: strict }, {});
	assert.equal(limited.ledger[0]!.why, "forced");
	assert.ok(limited.ledger.some((r) => r.picked.startsWith("bottom:") && r.why === "forced"));
});

test("replay: the same seed gives the same log, change for change", async () => {
	const a = table();
	const b = table();
	await finish(a);
	await finish(b);
	assert.equal(a.log.length, b.log.length);
	assert.deepEqual(
		a.log.map((r) => JSON.stringify(r.changes)),
		b.log.map((r) => JSON.stringify(r.changes)),
	);
	assert.deepEqual(a.ledger.map((r) => r.picked), b.ledger.map((r) => r.picked));

	// The seed and the recorded picks rebuild the whole game: cards, control
	// state and outcome. That is what journal.replay does, and it is why a
	// control transition needs no receipt of its own to be replayable.
	const restored = table();
	const scripts = Object.fromEntries(restored.seats.map((s) => [
		s.id,
		scriptedPlayer(s.name, a.ledger.filter((r) => r.by === "model" && r.seat === s.id).map((r) => r.picked)),
	]));
	await play(restored, scripts, {});
	assert.deepEqual(restored.log, a.log);
	assert.deepEqual(restored.cursor, a.cursor);
	assert.deepEqual(restored.opening, a.opening);
	assert.deepEqual(restored.things, a.things);
	assert.deepEqual(restored.seats, a.seats);
	assert.deepEqual(restored.rng, a.rng);
	assert.deepEqual(restored.outcome, a.outcome);

	// Control transitions move the cursor and stay out of the log, so the
	// stored form is the size of the game rather than of the clock.
	assert.ok(a.log.length < a.cursor.clock / 10, `${a.log.length} receipts, ${a.cursor.clock} groups`);
	assert.equal(a.log.some((r) => r.changes.every((c) => c.do === "turn")), false);
});

test("a different seed gives a different game", async () => {
	const a = table();
	const b = start(standard, [{ deck: deck("Forest") }, { deck: deck("Swamp") }], "seed-2");
	await finish(a);
	await finish(b);
	assert.notEqual(
		a.log.map((r) => JSON.stringify(r.changes)).join(),
		b.log.map((r) => JSON.stringify(r.changes)).join(),
	);
});

test("no leak: a view names only cards in a public zone or this seat's own hand", async () => {
	// Use a distinct identity so a public copy cannot mask a leak in the test.
	const hidden = start(standard, [{ deck: ["Secret"] }, { deck: ["Forest"] }], "hidden");
	const tap = commit(hidden, [{ do: "tap", what: "0-0" }], "game-setup");
	assert.equal(describe(hidden, tap).includes("Secret"), false);
	commit(hidden, [{ do: "move", what: "0-0", to: "battlefield", reason: "resolve" }], "resolve");
	assert.equal(describe(hidden, tap).includes("Secret"), false, "later reveals do not rewrite history");
	const card = hidden.things.get("0-0")!;
	card.faceDown = true;
	const faceDownTap = commit(hidden, [{ do: "tap", what: card.id }], "cost-payment");
	for (const zone of ["battlefield", "stack", "exile"] as const) {
		card.zone = zone;
		for (const viewer of [1, "spectator"] as const) {
			assert.equal(JSON.stringify(project(hidden, viewer)).includes("Secret"), false);
		}
	}
	card.faceDown = false;
	assert.equal(describe(hidden, faceDownTap).includes("Secret"), false);
	assert.ok(JSON.stringify(project(hidden, "spectator")).includes("Secret"));

	const built = table();
	let checks = 0;

	// Which names a seat may legitimately read: anything in a public zone, plus
	// its own hand. A card that has only ever been in another seat's hand or
	// library must not appear anywhere in the view, and the count it belongs to
	// still has to.
	const allowed = (self: number) =>
		new Set(
			[...built.things.values()]
				.filter(
					(t) =>
						t.zone === "battlefield" ||
						t.zone === "graveyard" ||
						t.zone === "stack" ||
						t.zone === "exile" ||
						(t.owner === self && t.zone === "hand"),
				)
				.map((t) => t.card),
		);

	const players = Object.fromEntries(
		built.seats.map((s) => {
			const self = s.id;
			return [
				self,
				{
					name: s.name,
					async answer(frame: Frame) {
						const may = allowed(self);
						const text = render(frame);
						for (const other of built.seats) {
							if (other.id === self) continue;
							for (const name of new Set(other.deck)) {
								if (may.has(name)) continue;
								assert.equal(text.includes(name), false, `seat ${self} was shown ${name}`);
							}
						}
						// Shape is preserved: the opponent's hand is a count.
						const theirs = built.seats.find((x) => x.id !== self)!;
						assert.match(
							frame.view.table.join("\n"),
							new RegExp(`${theirs.name}: \\d+ life, \\d+ in hand`),
						);
						checks += 1;
						const options = frame.decision!.options;
						const land = options.find((o) => o.id.startsWith("land:"));
						return { kind: "pick" as const, option: (land ?? options[0]!).id, actionId: `n-${checks}` };
					},
					observe() {},
					close() {},
				} satisfies Player,
			];
		}),
	);

	await play(built, players, {});
	assert.ok(checks > 50, `${checks} frames checked`);
});

test("the private block holds nothing of another seat's", async () => {
	const built = table();
	await finish(built);
	for (const s of built.seats) {
		const mine = project(built, s.id);
		const theirs = built.seats.find((x) => x.id !== s.id)!;
		for (const line of mine.yours) {
			assert.equal(line.includes(theirs.deck[0]!), false, line);
		}
	}
});

test("a spectator sees the public lines and no hand", () => {
	const built = table();
	const view = project(built, "spectator");
	assert.equal(view.yours.length, 0);
	assert.ok(view.table.length >= 3);
	assert.deepEqual(view.window, { kind: "opening", action: "deal" });
	assert.match(view.table[0]!, /^Opening/);
});
