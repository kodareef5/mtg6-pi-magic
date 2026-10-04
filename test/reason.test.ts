/**
 * The reasoning roles, end to end, with no network.
 *
 * The chat double records every prompt it was sent, which is what these check:
 * a pregame pass asks several questions at once rather than one, every answer is
 * filed where it will be read, a snippet reaches the decision packet, a summary
 * holds nothing private, and every call lands in the bill with its ceiling.
 */

import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { Api, Model } from "@earendil-works/pi-ai";

import { asks, brief, needsNote, policyFrom } from "../src/context/brief.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { degraded, report, run, seat as seatTable } from "../src/context/sit.ts";
import { bill, CEILING, tally } from "../src/context/spend.ts";
import { question } from "../src/context/seat.ts";
import { recap, recent } from "../src/context/summary.ts";
import { worthPlanning } from "../src/context/strategy.ts";
import { load as loadCards } from "../src/core/cards.ts";
import { fork, linesOf, open, preparedIn, read, reopen, replay, rowsOf } from "../src/core/journal.ts";
import { commit, start } from "../src/core/commit.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { traceInference, type CallTrace } from "../src/context/trace.ts";

const universe = loadCards("cards/standard.tsv");

const sol: Model<Api> = {
	id: "gpt-6.1-sol", name: "GPT-6.1 Sol", api: "openai-completions" as Api, provider: "openai",
	baseUrl: "https://example.invalid/", input: ["text"],
	cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
	reasoning: true, contextWindow: 100000, maxTokens: 10000,
};

/** Pi's streamSimple, as a double. Records each prompt and replies by rule. */
function chat(reply: (user: string, system: string) => string, stop = "stop") {
	const sent: { system: string; user: string; maxTokens?: number }[] = [];
	const stream: Stream = (_model, context, options) => {
		const user = String((context.messages[0] as { content?: unknown } | undefined)?.content ?? "");
		sent.push({ system: context.systemPrompt ?? "", user, ...(options?.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}) });
		const text = reply(user, context.systemPrompt ?? "");
		return {
			result: async () => ({
				content: [{ type: "thinking", thinking: "ignored" }, { type: "text", text }],
				usage: { input: 100, output: 20, cacheRead: 10, cacheWrite: 0, reasoning: 8, totalTokens: 130,
					cost: { input: 0.0001, output: 0.00004, cacheRead: 0, cacheWrite: 0, total: 0.00014 } },
				stopReason: stop,
			}),
		};
	};
	return { stream, sent };
}

const table = () => start(standard, [
	{ name: "A", deck: deck("Green Stompy") },
	{ name: "B", deck: deck("Dimir Control") },
], "reasoning");

test("the pregame asks several questions at once and files each answer where it is read", async () => {
	const built = table();
	const [me, them] = built.seats;

	// A land deck earns no card note, because the engine already knows what a
	// basic land does. That is the filter working, not a missing feature.
	assert.equal(needsNote(universe.cards.get("Forest")!), false);
	assert.equal(needsNote(universe.cards.get("Cavern of Souls")!), true);

	const wave = asks(me!, [them!], universe, { format: standard.name });
	const keys = wave.map((ask) => ask.key);
	assert.deepEqual(keys.slice(0, 3), ["deck", "combos", "opening"]);
	assert.ok(keys.includes("against:1"));
	for (const phase of ["beginning", "precombat-main", "combat", "postcombat-main", "ending"]) {
		assert.ok(keys.includes(`phase:${phase}`), phase);
	}
	assert.equal(keys.some((key) => ["card:Forest", "card:Island", "card:Swamp"].includes(key)), false, "no card note for basics");
	assert.ok(keys.includes("card:Snakeskin Veil"), "a card with something to say gets its own note");
	assert.equal(new Set(keys).size, keys.length, "no question asked twice");

	// Registered composition is public by default, without hands or object ids.
	const sent = wave.map((ask) => ask.user).join("\n");
	assert.match(sent, /public registered deck/);
	assert.match(sent, /4 Qiqirn Merchant/, "the opponent's registered list is in the question");
	for (const id of built.things.keys()) assert.equal(sent.includes(id), false);
	// Mulligan guidance is asked with the curve and the seat count in front of it.
	const opening = wave.find((ask) => ask.key === "opening")!.user;
	assert.match(opening, /60 cards, 20 lands\. Spells by cost: 1:16 2:12 3:2 4:8 5:2\./);
	assert.match(opening, /There are 2 seats/);
	assert.match(opening, /no land/);

	// Retain the existing closed-list branch for a future game setting.
	const closed = asks(me!, [them!], universe, { format: standard.name, openLists: false });
	assert.equal(closed.some((ask) => ask.user.includes("Swamp")), false);

	const counted = tally();
	const { stream, sent: prompts } = chat((user) => `answer for ${user.slice(-40)}`);
	const written = await brief(me!, [them!], universe, reasoner({ role: "pregame", stream, model: sol, thinking: "low", tally: counted, backoffMs: 0 }), { format: standard.name });

	assert.equal(prompts.length, wave.length, "one call per question");
	assert.ok(written.deck.length > 0);
	assert.ok(written.combos.length > 0);
	assert.ok(written.opening.length > 0);
	assert.ok(written.against["1"]!.length > 0);
	assert.ok(written.phases.combat!.length > 0);
	assert.deepEqual(Object.keys(written.cards).sort(), ["Ankle Biter", "Colossadactyl", "Elvish Archdruid", "Fanatical Strength", "Giant Growth", "Llanowar Elves", "Snakeskin Veil"],
		"a note for each card with rules text, none for a vanilla creature or a basic");
	assert.deepEqual(written.gaps, []);

	// Every call is metered with the ceiling it asked for, which is what some
	// routes price against.
	assert.equal(counted.spent().length, wave.length);
	for (const spend of counted.spent()) {
		assert.equal(spend.ceiling, CEILING.pregame);
		assert.equal(spend.thinking, "low");
		assert.equal(spend.usage?.reasoning, 8);
		assert.ok(spend.about.length > 0);
	}
	for (const prompt of prompts) assert.equal(prompt.maxTokens, CEILING.pregame);
	const reading = bill(counted.spent()).join("\n");
	assert.match(reading, /pregame/);
	assert.match(reading, /thinking/);
	assert.match(reading, /cached/);
	assert.match(reading, /total/);

	// The deck-level lines become the seat's policy, which the core already holds.
	assert.equal(policyFrom(written).seat, 0);
	assert.equal(policyFrom(written).winsBy, written.deck);
});

test("a failed question is a gap and the game still starts", async () => {
	const built = table();
	const counted = tally();
	const { stream } = chat((user) => (user.includes("keepable seven") ? "" : "fine"));
	const traces: CallTrace[] = [];
	let dropped = false;
	const observed = traceInference({ classify: async () => { throw new Error("No classifier in this pass"); },
		stream: (model, context, options) => {
			if (!dropped && String((context.messages[0] as { content?: unknown }).content).includes("keepable seven")) {
				dropped = true;
				return { result: async () => { throw new Error("fixture connection dropped"); } };
			}
			return stream(model, context, options);
		},
	}, (event) => traces.push(event));
	const written = await brief(built.seats[0]!, [built.seats[1]!], universe, reasoner({ role: "pregame", stream: observed.stream, model: sol, tally: counted, backoffMs: 0 }), { format: standard.name });
	assert.equal(written.opening, "", "the snippet is missing");
	assert.equal(written.gaps.length, 1);
	assert.match(written.gaps[0]!, /mulligan guidance/);
	assert.ok(written.deck.length > 0, "the other answers still arrived");
	// Tried again before giving up, and every attempt is in the bill, or the run
	// understates what it was charged for.
	const failed = counted.spent().filter((spend) => spend.failed);
	assert.equal(failed.length, 3, "three attempts at the one question");
	for (const attempt of failed) assert.match(attempt.about, /mulligan guidance/);
	const requests = traces.filter((event) => event.event === "request");
	assert.equal(requests.length, counted.spent().length, "capture includes every retry");
	const error = traces.find((event) => event.event === "error");
	assert.ok(error?.event === "error" && error.error.includes("fixture connection dropped"));
	assert.ok(requests.some((request) => request.id === error!.id), "a thrown call keeps its request correlation");
});

test("a brief snippet reaches the decision and a card note only when its card is visible", async () => {
	const built = table();
	advance(built);
	apply(built, "keep", "model", "chosen");
	apply(built, "keep", "model", "chosen");
	advance(built);
	// Walk to the first decision with a real choice in it, taking the forced ones.
	for (;;) {
		const pending = nextDecision(built);
		if (!pending) { advance(built); continue; }
		if (pending.options.length > 1) break;
		apply(built, pending.options[0]!.id, "engine", "forced");
	}

	const written = {
		seat: 0, version: 1,
		deck: "Green Stompy curves out and pumps its biggest creature.",
		combos: "No combinations.",
		opening: "Keep any seven.",
		against: { "1": "Expect to be behind on everything." },
		phases: { "precombat-main": "Play a land. There is nothing else." as string },
		cards: { Forest: "It taps for green.", "Cavern of Souls": "Name the tribe you cast most." },
		gaps: [],
	};
	const recaps = [{ turn: 1, active: "A", line: "A played a Forest.", from: 0, to: 4 }];
	const decision = nextDecision(built)!;
	const packet = focus(
		{ seat: decision.seat, version: built.cursor.clock, view: project(built, decision.seat), decision },
		startingIntent(decision.seat),
		{ brief: written, recaps },
	);

	assert.ok(packet.guidance.includes("Play a land. There is nothing else."), "this window's note is in");
	assert.ok(packet.guidance.some((line) => line.startsWith("Forest:")), "the note for a card an option names is in");
	assert.equal(packet.guidance.some((line) => line.startsWith("Cavern")), false, "an absent card costs nothing");
	assert.equal(JSON.stringify(packet).includes("Green Stompy curves out"), false, "the deck reading is strategy's, not the pilot's");
	assert.equal(JSON.stringify(packet).includes("behind on everything"), false, "so is the matchup");
	assert.deepEqual(packet.lately, ["Turn 1: A played a Forest."]);
	assert.deepEqual(recent(recaps), ["Turn 1: A played a Forest."]);

	const asked = question(packet, false);
	assert.equal(asked.type, "choice");
	if (asked.type !== "choice") throw new Error("Expected a choice");
	assert.match(asked.instructions, /Notes for this window:/);
	assert.match(asked.instructions, /Recently:/);
	assert.equal("ask:help" in asked.criteria, false, "no planner, no help to ask for");

	// A packet with no brief still builds. A missing plan costs quality; refusing
	// to build one would cost the game.
	const bare = focus(
		{ seat: decision.seat, version: built.cursor.clock, view: project(built, decision.seat), decision },
		startingIntent(decision.seat),
	);
	assert.deepEqual(bare.guidance, []);
	assert.deepEqual(bare.lately, []);
});

test("a recap is two sentences of public events and skips a turn where nothing happened", async () => {
	const built = table();
	advance(built);
	apply(built, "keep", "model", "chosen");
	apply(built, "keep", "model", "chosen");
	advance(built);
	const from = built.log.length;

	// Nothing public yet, so no call is made at all.
	const counted = tally();
	const { stream, sent } = chat(() => "A played a Forest and passed.");
	const quiet = await recap(built, reasoner({ role: "summary", stream, model: sol, tally: counted, backoffMs: 0 }), { number: 1, active: "A", from: built.log.length });
	assert.equal(quiet, null);
	assert.equal(sent.length, 0, "an empty turn is not sent to a model");

	// Play until something public happens, then summarise it.
	while (built.log.length === from) {
		const decision = nextDecision(built);
		if (!decision) { advance(built); continue; }
		const land = decision.options.find((option) => option.id.startsWith("land:"));
		apply(built, (land ?? decision.options[0]!).id, "model", "chosen");
	}
	const said = await recap(built, reasoner({ role: "summary", stream, model: sol, thinking: "low", tally: counted, backoffMs: 0 }), { number: 1, active: "A", from });
	assert.ok(said);
	assert.equal(said.line, "A played a Forest and passed.");
	assert.equal(said.from, from);
	assert.equal(said.to, built.log.length);
	assert.equal(counted.spent()[0]!.ceiling, CEILING.summary);
	assert.equal(sent[0]!.maxTokens, 200);

	// The commentator is told what it does not know, and is given no private fact.
	assert.match(sent[0]!.system, /not know anybody's hand/);
	assert.match(sent[0]!.system, /Two sentences/);

	// Seat 1's hand is private, and a summary is shared with everybody, so it is
	// built from the spectator projection and cannot hold one.
	const hidden = cardsIn(built, "hand", 1);
	assert.ok(hidden.length > 0);
	commit(built, [{ do: "move", what: hidden[0]!.id, to: "battlefield", reason: "play-land" }], "play-land");
	const after = await recap(built, reasoner({ role: "summary", stream, model: sol, tally: counted, backoffMs: 0 }), { number: 2, active: "B", from: built.log.length - 1 });
	assert.ok(after);
	// An Island on the battlefield is public and may be named; a count of a hand is
	// all the request carries about what is still hidden.
	assert.match(sent.at(-1)!.user, /Island/);
	assert.match(sent.at(-1)!.user, /\d+ in hand/);
});

test("a phase is planned only when it has a choice that could be lost", () => {
	const built = table();
	// Before the hands are dealt there is no phase at all.
	assert.equal(worthPlanning(built), false);
	advance(built);
	assert.equal(worthPlanning(built), false, "a mulligan declaration is not a phase plan");
	apply(built, "keep", "model", "chosen");
	apply(built, "keep", "model", "chosen");
	advance(built);

	// Walk a turn. A plan is worth a call only where more than one move is listed:
	// the main phases, where a land or a spell can be played, and nowhere else.
	const planned = new Set<string>();
	while (built.cursor.turn === 1) {
		if (worthPlanning(built)) planned.add(built.cursor.steps[0]!);
		const decision = nextDecision(built);
		if (!decision) { advance(built); continue; }
		const land = decision.options.find((option) => option.id.startsWith("land:"));
		apply(built, (land ?? decision.options[0]!).id, "model", "chosen");
	}
	assert.deepEqual([...planned], ["precombat-main", "postcombat-main"]);
});

test("the whole table is seated, briefed and played, and the recaps do not block it", async () => {
	const built = table();

	// A commentator held until released. Nothing in the game may be waiting on
	// it, so the game runs on and the recaps pile up unanswered. Proving that
	// with a gate rather than a stopwatch keeps the test off the clock.
	const HELD = 20;
	let release = () => {};
	const gate = new Promise<void>((resolve) => { release = resolve; });
	let firstResolvedAfter = 0;
	const { stream: talking, sent: said } = chat(() => "Something happened.");
	const slow: Stream = (model, context, options) => {
		const inner = talking(model, context, options);
		return {
			result: async () => {
				if (said.length >= HELD) release();
				await gate;
				firstResolvedAfter ||= said.length;
				return inner.result();
			},
		};
	};
	const { stream: thinking } = chat(() => "Play lands. Nothing else is possible.");

	let picks = 0;
	const inference = {
		classify: (async (model: Model<Api>, request: { questions: Record<string, { type: string; criteria: Record<string, string> }> }) => {
			picks += 1;
			const criteria = Object.keys(request.questions.pick!.criteria);
			const choice = criteria.find((id) => id.startsWith("land:")) ?? criteria[0]!;
			return {
				api: "typesafe-system-one", provider: "typesafe", model: "jev-latest",
				answers: { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 0.9 } },
				stopReason: "stop", timestamp: 0,
			};
		}) as never,
		// The pregame reasons, the commentator is the slow one.
		stream: ((model: Model<Api>, context: { systemPrompt?: string }, options: unknown) =>
			(context.systemPrompt?.includes("commentator") ? slow : thinking)(model, context as never, options as never)) as never,
	};

	const jev = { type: "classifier" as const, id: "jev-latest", name: "Jev", api: "typesafe-system-one",
		provider: "typesafe", baseUrl: "https://example.invalid/", input: ["text" as const],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000 };
	const parts = [
		{ role: "decide" as const, pattern: "typesafe/jev-latest", model: jev },
		{ role: "pregame" as const, pattern: "gpt-6.1-sol:low", model: sol, thinkingLevel: "low" as const },
		{ role: "summary" as const, pattern: "gpt-5.6-luna:low", model: sol, thinkingLevel: "low" as const },
	];

	const began = Date.now();
	const traces: CallTrace[] = [];
	const observed = traceInference(inference, (event) => traces.push(event));
	const seated = await seatTable(built, async () => parts, observed, universe, { format: standard.name });
	assert.ok(seated.chronicle.briefs[0]?.deck, "seat 0 was briefed");
	assert.ok(seated.chronicle.briefs[1]?.deck, "seat 1 was briefed");

	const outcome = await run(built, seated, observed, parts[2]!, undefined);
	const ms = Date.now() - began;
	void ms;

	assert.ok(outcome, "the game finished");
	assert.equal(seated.picks(), picks, "every request to the decision model is counted");
	assert.ok(seated.chronicle.recaps.length > 50, `${seated.chronicle.recaps.length} recaps`);
	assert.equal(said.length, seated.chronicle.recaps.length);

	// In turn order however late each answer landed, so the last three are the
	// last three turns.
	const turns = seated.chronicle.recaps.map((r) => r.turn);
	assert.deepEqual(turns, [...turns].sort((a, b) => a - b));

	// The proof that they ran beside the game: at least twenty were dispatched
	// before any of them answered. A loop that awaited each one could never have
	// more than a single request outstanding.
	assert.ok(firstResolvedAfter >= HELD, `${firstResolvedAfter} outstanding when the first answered`);
	const requests = traces.filter((event) => event.event === "request");
	assert.equal(requests.length, seated.tally.spent().length, "every model attempt has an exact capture");
	assert.equal(new Set(requests.map((event) => event.id)).size, requests.length);
	for (const request of requests) {
		assert.ok(traces.indexOf(request) < traces.findIndex((event) => event.id === request.id && event.event === "reply"));
		assert.ok(request.model.includes("/"));
		assert.equal("baseUrl" in request, false);
		if (request.kind === "classify") {
			const sent = request.request as { state: { actor: number; options: { id: string }[] }; questions: { pick: { criteria: Record<string, string> } } };
			assert.ok([0, 1].includes(sent.state.actor));
			assert.ok(sent.state.options.every((option) => option.id in sent.questions.pick.criteria));
		} else assert.ok(request.settings.maxTokens! > 0);
	}

	// Every role is in one bill, with the decision model counted separately
	// because Pi does not meter a classifier's tokens.
	const reading = report(built, seated, outcome, ms).join("\n");
	assert.match(reading, /pregame/);
	assert.match(reading, /summary/);
	assert.match(reading, /picks     \d+ decision-model calls/);
	const [, forced, chosen] = reading.match(/forced (\d+)  delegated \d+  chosen (\d+)/)!;
	assert.ok(Number(forced) > 5 * Number(chosen), "the table takes far more decisions than it asks");
	assert.match(reading, /forced    \d+\.\d%/);

	// A role switched off is a decision, not a gap.
	const quiet = table();
	const seatedQuiet = await seatTable(
		quiet,
		async () => [parts[0]!, { role: "pregame" as const, pattern: "off", off: true }],
		inference, universe, { format: standard.name },
	);
	assert.deepEqual(seatedQuiet.chronicle.briefs[0]?.gaps, []);
	assert.deepEqual(quiet.gaps, []);
	assert.ok(await run(quiet, seatedQuiet, inference, { role: "summary", pattern: "off", off: true }, undefined));
	assert.deepEqual(seatedQuiet.chronicle.recaps, []);
	const asked = seatedQuiet.tally.spent();
	assert.equal(asked.filter((spend) => spend.role !== "decide").length, 0, "no reasoner answered");
	// The decision model is in the same bill as the reasoners, so a run shows
	// every call it made in one place.
	assert.ok(asked.length > 50, `${asked.length} decision calls recorded`);
	assert.equal(asked.length, seatedQuiet.picks());
});

test("a carried brief keeps its failures, and a stuck recap cannot lose a saved game", async () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-carried-"));
	const built = table();
	const jev = { type: "classifier" as const, id: "jev-latest", name: "Jev", api: "typesafe-system-one",
		provider: "typesafe", baseUrl: "x", input: ["text" as const],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000 };
	const parts = [
		{ role: "decide" as const, pattern: "typesafe/jev-latest", model: jev },
		{ role: "pregame" as const, pattern: "gpt-6.1-sol:low", model: sol },
		{ role: "summary" as const, pattern: "gpt-5.6-luna:low", model: sol },
	];

	// A recap that never answers. The game must still be saved.
	const stuck: Stream = () => ({ result: () => new Promise(() => {}) });
	const inference = {
		classify: (async (_model: unknown, request: { questions: Record<string, { criteria: Record<string, string> }> }) => {
			const criteria = Object.keys(request.questions.pick!.criteria);
			const choice = criteria.find((id) => id.startsWith("land:")) ?? criteria[0]!;
			return { api: "typesafe-system-one", provider: "typesafe", model: "jev-latest",
				answers: { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } },
				stopReason: "stop", timestamp: 0 };
		}) as never,
		stream: stuck as never,
	};

	// A brief carried from a clone, with a question that had failed in the parent.
	const scarred = { seat: 0, version: 1, deck: "Green Stompy.", combos: "None.",
		opening: "", against: {}, phases: {}, cards: {},
		gaps: ["mulligan guidance: the model fell over"] };

	const journal = open(join(dir, "child.jsonl"), {
		id: "child", format: standard.name, seed: "reasoning",
		seats: built.seats.map((at) => ({ id: at.id, name: at.name, deck: at.deck })),
		cards: { path: "x", generated: "2026-10-03" }, rules: { path: "y", effective: "z" },
		created: "2026-10-03T00:00:00.000Z",
	});

	const seated = await seatTable(built, async () => parts, inference, universe, {
		format: standard.name,
		journal,
		prepared: [{ seat: 0, made: scarred }, { seat: 1, made: { ...scarred, seat: 1, gaps: [] } }],
	});

	// Carried as given: a clone is the same game continued, so there is nothing
	// to check it against. But its failures are still this run's failures.
	assert.equal(seated.chronicle.briefs[0]!.deck, "Green Stompy.");
	assert.equal(seated.tally.spent().filter((spend) => spend.role === "pregame").length, 0, "not re-asked");
	assert.match(built.gaps.join(" "), /brief \(carried\).*the model fell over/);
	assert.ok(degraded(built, seated), "a carried failure is not a clean run");

	// The clone already holds the briefs it carried, so they are not written twice.
	assert.equal(preparedIn(read(journal.path).lines).length, 0);

	const outcome = await run(built, seated, inference, parts[2]!, undefined, journal, 50);
	assert.ok(outcome, "the game finished");

	// Saved, with every recap still unanswered. Appending after the wait meant a
	// stuck commentator lost a finished game.
	const back = read(journal.path);
	assert.ok(rowsOf(back.lines).length > 50, `${rowsOf(back.lines).length} decisions saved`);
	assert.deepEqual(rowsOf(back.lines).map((row) => row.picked), built.ledger.map((row) => row.picked));
	assert.deepEqual(seated.chronicle.recaps, []);
	assert.match(built.gaps.join(" "), /recaps were still unanswered when the game was saved/);
});

/**
 * The whole persistence lifecycle, through the real callers.
 *
 * Every earlier journal test built its file by hand, which is how a file saved
 * by `run` came to be missing its first gameplay line per seat: the branch was
 * covered and the caller was not. So this one plays a game, clones it, tears the
 * clone's last line the way a crash would, resumes it, plays on, and clones
 * again, asserting at each step that the file holds the game the table holds.
 */
test("a game saved, cloned, torn, resumed and cloned again is the same game throughout", async () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-life-"));
	const jev = { type: "classifier" as const, id: "jev-latest", name: "Jev", api: "typesafe-system-one",
		provider: "typesafe", baseUrl: "x", input: ["text" as const],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000 };
	const talk = chat(() => "A land, and a pass.");
	const inference = {
		classify: (async (_model: unknown, request: { questions: Record<string, { criteria: Record<string, string> }> }) => {
			const ids = Object.keys(request.questions.pick!.criteria);
			const choice = ids.find((id) => id.startsWith("land:")) ?? ids[0]!;
			return { api: "typesafe-system-one", provider: "typesafe", model: "jev-latest",
				answers: { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } },
				stopReason: "stop", timestamp: 0 };
		}) as never,
		stream: talk.stream as never,
	};
	const parts = [
		{ role: "decide" as const, pattern: "typesafe/jev-latest", model: jev },
		{ role: "pregame" as const, pattern: "gpt-6.1-sol:low", model: sol },
		{ role: "summary" as const, pattern: "off", off: true },
	];
	const header = (id: string, built: Table) => ({
		id, format: standard.name, seed: "life",
		seats: built.seats.map((at) => ({ id: at.id, name: at.name, deck: at.deck })),
		cards: { path: "cards/standard.tsv", generated: universe.generated },
		rules: { path: "y", effective: "z" },
		created: "2026-10-03T00:00:00.000Z",
	});
	/** Every line the file holds that a table also produces. Briefs are not in it. */
	const gameplay = (path: string) => read(path).lines.filter((line) => !("prepared" in line));

	// One: a fresh game, played and saved. Its pregame writes two briefs, which
	// is what used to cost it the first two receipts.
	const first = start(standard, [{ deck: deck("Green Stompy") }, { deck: deck("Dimir Control") }], "life");
	const parentPath = join(dir, "parent.jsonl");
	const parentJournal = open(parentPath, header("parent", first));
	const seated = await seatTable(first, async () => parts, inference, universe, {
		format: standard.name, journal: parentJournal,
	});
	assert.ok(await run(first, seated, inference, parts[2]!, undefined, parentJournal, 50), "finished");

	assert.equal(preparedIn(read(parentPath).lines).length, 2, "both briefs kept");
	assert.deepEqual(gameplay(parentPath), linesOf(first), "the file holds the whole game");

	// Two: cloned at a version in the middle of it.
	const at = 20;
	const childPath = join(dir, "child.jsonl");
	const forked = fork(parentPath, at, "child", childPath);
	assert.deepEqual(forked.forkedFrom, { game: "parent", version: at });

	// Three: the clone's last line is torn off mid write, the way a crash leaves
	// it. It reads with a notice, and resuming repairs the file rather than
	// leaving the fragment for the next append to fuse onto.
	appendFileSync(childPath, '{"v":99,"receipt":{"se');
	assert.match(read(childPath).truncated ?? "", /ends mid line/);
	const back = replay(childPath, (saved) =>
		start(standard, saved.seats.map((s) => ({ name: s.name, deck: s.deck })), saved.seed), undefined,
		{ cards: { generated: universe.generated }, rules: { effective: "z" } });
	assert.equal(back.table.ledger.length, at, "the clone is the position it was cut at");
	assert.deepEqual(back.table.seats.map((s) => s.name), first.seats.map((s) => s.name), "the same seats");
	const childJournal = reopen(childPath, back.header, back.table);
	assert.match(childJournal.repaired ?? "", /^\{"v":99/);

	// Four: resumed with the pregame switched off. The clone owns its
	// preparation, so the roster is not asked whether to keep it.
	const off = [parts[0]!, { role: "pregame" as const, pattern: "off", off: true }, parts[2]!];
	const again = await seatTable(back.table, async () => off, inference, universe, {
		format: standard.name, journal: childJournal, prepared: back.prepared,
	});
	assert.equal(again.chronicle.briefs[0]!.deck, seated.chronicle.briefs[0]!.deck, "the carried plan survived");
	assert.equal(again.tally.spent().filter((spend) => spend.role === "pregame").length, 0, "not re-asked");
	assert.equal(preparedIn(read(childPath).lines).length, 2, "and not written a second time");

	// Five: played on, and the file still readable and still whole.
	assert.ok(await run(back.table, again, inference, parts[2]!, undefined, childJournal, 50), "finished again");
	assert.deepEqual(gameplay(childPath), linesOf(back.table), "the file holds the continued game");

	// The shared prefix is shared. Same seeds, same names, same picks up to the
	// cut, because the clone was dealt the cards the parent was dealt.
	assert.deepEqual(
		rowsOf(read(childPath).lines, at).map((row) => [row.seq, row.picked]),
		rowsOf(read(parentPath).lines, at).map((row) => [row.seq, row.picked]),
	);

	// Six: a clone of the clone, which is what makes a position a fixture.
	const grandPath = join(dir, "grand.jsonl");
	fork(childPath, 10, "grand", grandPath);
	assert.equal(preparedIn(read(grandPath).lines).length, 2, "the briefs came across again");
	assert.equal(rowsOf(read(grandPath).lines).length, 10);
});

test("work takes its answer only through submit, and tells the model what was wrong until it is right", async () => {
	const replies = [
		{ content: [{ type: "text", text: "We need to cast the Elves first, then..." }], stopReason: "stop" },
		{ content: [{ type: "toolCall", id: "a", name: "lookup", arguments: { rule: "302.6" } }, { type: "toolCall", id: "b", name: "submit", arguments: { commands: [] } }], stopReason: "toolUse" },
		{ content: [{ type: "toolCall", id: "c", name: "submit", arguments: { commands: ["plan"] } }], stopReason: "toolUse" },
	];
	const seen: unknown[][] = [];
	const stream: Stream = (_model, context) => { seen.push(structuredClone(context.messages)); const reply = replies.shift()!; return { result: async () => reply }; };
	const counted = tally();
	const thinking = reasoner({ role: "strategy", stream, model: sol, tally: counted, backoffMs: 0 });
	const submit = { name: "submit", description: "The answer.", parameters: { type: "object" },
		check: (args: Record<string, unknown>) => (args.commands as unknown[]).length ? null : "The commands are empty." };
	const lookup = { name: "lookup", description: "A rule.", parameters: { type: "object" }, answer: (args: Record<string, unknown>) => `Rule ${args.rule}: summoning sickness.` };
	const answer = await thinking.work("seat plan", { system: "S", user: "facts", task: "Plan now." }, { submit, lookups: [lookup], turns: 3 });
	assert.deepEqual(answer, { commands: ["plan"] });
	assert.equal(counted.spent().length, 3, "every reply is a metered call");
	const second = JSON.stringify(seen[1]), third = JSON.stringify(seen[2]);
	assert.match(second, /replied with text and did not call a tool/);
	assert.match(third, /Rule 302.6: summoning sickness/, "a lookup is answered");
	assert.match(third, /Not accepted: The commands are empty/, "a refused answer says why");
	assert.match(JSON.stringify(seen[0]), /"facts".*"Plan now."/, "the task comes after the facts");

	const stubborn = reasoner({ role: "strategy", stream: () => ({ result: async () => ({ content: [{ type: "text", text: "Prose." }], stopReason: "stop" }) }), model: sol, tally: tally(), backoffMs: 0 });
	await assert.rejects(stubborn.work("seat plan", { system: "S", user: "facts" }, { submit, turns: 2 }), /did not submit an accepted answer/);
});
