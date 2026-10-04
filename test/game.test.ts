/**
 * Milestone one: two seats play registered Standard decks from the collection to
 * a recorded end. The fixture policy only plays lands and passes, so the game
 * runs through untap, draw, mulligan, cleanup and deck out.
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
import { relive } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import { scriptedPlayer, type Player } from "../src/core/player.ts";
import { commit, start } from "../src/core/commit.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { deck } from "../src/core/decks.ts";
import type { Frame } from "../src/core/types.ts";
import { describe, project, render } from "../src/core/view.ts";

const universe = load("cards/standard.tsv");

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

const table = (seed = "seed-1") => start(standard, [{ deck: deck("Green Stompy") }, { deck: deck("Dimir Control") }], seed);

const finish = async (built: Table) => {
	const players = Object.fromEntries(built.seats.map((s) => [s.id, policy(s.name)]));
	return play(built, players, {});
};

test("the decks are legal before a card moves", () => {
	const built = table();
	assert.equal(built.seats.length, 2);
	assert.equal(built.things.size, 120, "two main decks; neither practice deck has a sideboard");
	for (const s of built.seats) for (const name of Object.keys(s.deck.main)) assert.equal(universe.cards.has(name), true);
	assert.throws(() => start(standard, [{ deck: { ...deck("Green Stompy"), main: { ...deck("Green Stompy").main, "Gigantosaurus": 5 } } }, { deck: deck("Dimir Control") }], "illegal"),
		/cannot be registered for standard: 5 copies of Gigantosaurus/, "setup refuses a deck the format does not allow");
	assert.throws(() => start(standard, [{ deck: { ...deck("Green Stompy"), main: { ...deck("Green Stompy").main, "Not A Card": 1 } } }, { deck: deck("Dimir Control") }], "unknown"),
		/no card named Not A Card/, "every game card comes from the universe");
});

test("a game finishes, and somebody decks out", async () => {
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

	// The seed and the recorded decisions rebuild the whole game: cards, control
	// state and outcome. That is what journal.replay does, and it is why a
	// control transition needs no receipt of its own to be replayable.
	const restored = relive(table(), a.ledger);
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
	assert.deepEqual(restored.ledger, a.ledger);
});

test("replay: a fallback is replayed as a fallback, not as a missing answer", async () => {
	// A fallback is the absence of an answer, so no scripted player can produce
	// one. Replay reads the recorded decision instead, which is the only way a
	// game containing one comes back.
	const played = table();
	let refusals = 0;
	const sabotage = (name: string): Player => ({
		name,
		async answer(frame) {
			if (refusals < 2) { refusals += 1; return { kind: "pick", option: "nope", actionId: "bad" }; }
			const options = frame.decision!.options;
			const land = options.find((o) => o.id.startsWith("land:"));
			return { kind: "pick", option: (land ?? options[0]!).id, actionId: `${name}-${refusals++}` };
		},
		observe() {}, close() {},
	});
	const outcome = await play(played, { 0: sabotage("a"), 1: sabotage("b") }, {});
	assert.ok(outcome);
	assert.equal(played.ledger.filter((r) => r.why === "fallback").length, 1);
	assert.equal(played.gaps.length, 1);

	const again = relive(table(), played.ledger);
	assert.deepEqual(again.ledger, played.ledger);
	assert.deepEqual(again.log, played.log);
	assert.deepEqual(again.things, played.things);
	assert.deepEqual(again.outcome?.results, played.outcome?.results);

	// Scripting the model rows alone cannot: the first question has no answer.
	const scripted = table();
	const scripts = Object.fromEntries(scripted.seats.map((s) => [
		s.id,
		scriptedPlayer(s.name, played.ledger.filter((r) => r.by === "model" && r.seat === s.id).map((r) => r.picked)),
	]));
	await play(scripted, scripts, {});
	assert.notDeepEqual(scripted.ledger.map((r) => r.picked), played.ledger.map((r) => r.picked));
});

test("a different seed gives a different game", async () => {
	const a = table();
	const b = table("seed-2");
	await finish(a);
	await finish(b);
	assert.notEqual(
		a.log.map((r) => JSON.stringify(r.changes)).join(),
		b.log.map((r) => JSON.stringify(r.changes)).join(),
	);
});

test("no leak: public deck counts never identify hidden objects", async () => {
	// Gigantosaurus is only in Green's deck, so no public copy can mask a leak.
	const hidden = table("hidden");
	const giant = cardsIn(hidden, "library", 0).find((object) => object.card === "Gigantosaurus")!;
	const tap = commit(hidden, [{ do: "tap", what: giant.id }], "game-setup");
	assert.equal(describe(hidden, tap).includes("Gigantosaurus"), false);
	commit(hidden, [{ do: "move", what: giant.id, to: "battlefield", reason: "resolve" }], "resolve");
	assert.equal(describe(hidden, tap).includes("Gigantosaurus"), false, "later reveals do not rewrite history");
	const card = hidden.things.get(giant.id)!;
	card.faceDown = true;
	const faceDownTap = commit(hidden, [{ do: "tap", what: card.id }], "cost-payment");
	for (const zone of ["battlefield", "stack", "exile"] as const) {
		card.zone = zone;
		for (const viewer of [1, "spectator"] as const) {
			// Printed facts cover every card on the public lists, so they name no object.
			const { decks, printed, ...position } = project(hidden, viewer);
			assert.equal(JSON.stringify(position).includes("Gigantosaurus"), false);
			assert.deepEqual(Object.keys(printed!), [...new Set(hidden.seats.flatMap(({ deck }) => [...Object.keys(deck.main), ...Object.keys(deck.sideboard)]))].sort());
			assert.equal(decks![0]!.cards.Gigantosaurus, 2, "the registered count is public");
		}
	}
	card.faceDown = false;
	assert.equal(describe(hidden, faceDownTap).includes("Gigantosaurus"), false);
	assert.ok(project(hidden, "spectator").objects!.some((object) => object.card === "Gigantosaurus"));

	const built = table();
	let checks = 0;

	const registered = project(built, "spectator").decks;
	const sorted = (counts: Record<string, number>) => Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
	assert.deepEqual(registered, built.seats.map((one) => ({ seat: one.id, name: one.deck.name, cards: sorted(one.deck.main), sideboard: {} })));
	const edited = project(built, 0);
	edited.decks![1]!.cards.Island = 0;
	assert.deepEqual(project(built, 0).decks, registered, "projection owns its deck counts");
	assert.equal(project({ ...built, format: { ...standard, decksRegistered: false } }, 0).decks, undefined);

	// Registered names do not associate a hidden object with a card name. The
	// position shows public identities, this seat's hand, and hidden counts.
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
						const { decks, ...position } = frame.view;
						assert.deepEqual(decks, registered, "registration does not change with the position");
						const text = render({ ...frame, view: position });
						for (const object of built.things.values()) {
							if (object.zone === "library" || (object.zone === "hand" && object.owner !== self)) {
								assert.ok(!frame.view.objects!.some((visible) => visible.id === object.id));
							}
						}
						for (const other of built.seats) {
							if (other.id === self) continue;
							for (const name of Object.keys(other.deck.main)) {
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
		const only = Object.keys(theirs.deck.main).filter((name) => !(name in s.deck.main));
		for (const line of mine.yours) for (const name of only) assert.equal(line.includes(name), false, line);
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
