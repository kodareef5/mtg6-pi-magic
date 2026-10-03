/**
 * The reasoning roles, end to end, with no network.
 *
 * The chat double records every prompt it was sent, which is what these check:
 * a pregame pass asks several questions at once rather than one, every answer is
 * filed where it will be read, a snippet reaches the decision packet, a summary
 * holds nothing private, and every call lands in the bill with its ceiling.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Api, Model } from "@earendil-works/pi-ai";

import { asks, brief, needsNote, policyFrom } from "../src/context/brief.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { report, run, seat as seatTable } from "../src/context/sit.ts";
import { bill, CEILING, tally } from "../src/context/spend.ts";
import { question } from "../src/context/seat.ts";
import { recap, recent } from "../src/context/summary.ts";
import { worthPlanning } from "../src/context/strategy.ts";
import { load as loadCards } from "../src/core/cards.ts";
import { commit, start } from "../src/core/commit.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";

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
		const user = String(context.messages[0]?.content ?? "");
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
	{ name: "A", deck: Array(60).fill("Forest") },
	{ name: "B", deck: Array(60).fill("Swamp") },
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
	assert.equal(keys.some((key) => key.startsWith("card:")), false, "no card note for basics");
	assert.equal(new Set(keys).size, keys.length, "no question asked twice");

	// The opponent's cards are never in a question. A pregame leak cannot be
	// undone by a later ruling, so the closed-list form asks about the format.
	const sent = wave.map((ask) => ask.user).join("\n");
	assert.equal(sent.includes("Swamp"), false);
	assert.match(sent, /have not seen their cards/);
	// Mulligan guidance is asked with the curve and the seat count in front of it.
	const opening = wave.find((ask) => ask.key === "opening")!.user;
	assert.match(opening, /60 cards, 60 lands/);
	assert.match(opening, /There are 2 seats/);
	assert.match(opening, /no land/);

	// An open-list benchmark is the only way the other deck appears, and it is off
	// unless somebody asks for it.
	const open = asks(me!, [them!], universe, { format: standard.name, openLists: true });
	assert.match(open.find((ask) => ask.key === "against:1")!.user, /Swamp/);

	const counted = tally();
	const { stream, sent: prompts } = chat((user) => `answer for ${user.slice(-40)}`);
	const written = await brief(me!, [them!], universe, reasoner({ role: "pregame", stream, model: sol, thinking: "low", tally: counted }), { format: standard.name });

	assert.equal(prompts.length, wave.length, "one call per question");
	assert.ok(written.deck.length > 0);
	assert.ok(written.combos.length > 0);
	assert.ok(written.opening.length > 0);
	assert.ok(written.against["1"]!.length > 0);
	assert.ok(written.phases.combat!.length > 0);
	assert.deepEqual(written.cards, {});
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
	const written = await brief(built.seats[0]!, [built.seats[1]!], universe, reasoner({ role: "pregame", stream, model: sol, tally: counted }), { format: standard.name });
	assert.equal(written.opening, "", "the snippet is missing");
	assert.equal(written.gaps.length, 1);
	assert.match(written.gaps[0]!, /mulligan guidance/);
	assert.ok(written.deck.length > 0, "the other answers still arrived");
	// A failed call is in the bill too, or the run understates its own cost.
	assert.equal(counted.spent().filter((spend) => spend.failed).length, 1);
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
		deck: "Sixty Forests. It casts nothing.",
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

	assert.ok(packet.guidance.includes("Sixty Forests. It casts nothing."));
	assert.ok(packet.guidance.some((line) => line.startsWith("Forest:")), "the visible card's note is in");
	assert.equal(packet.guidance.some((line) => line.startsWith("Cavern")), false, "an absent card costs nothing");
	assert.deepEqual(packet.assumed, ["Expect to be behind on everything."]);
	assert.deepEqual(packet.lately, ["Turn 1: A played a Forest."]);
	assert.deepEqual(recent(recaps), ["Turn 1: A played a Forest."]);

	// The question carries the plan and says it was written before this board.
	const asked = question(packet);
	assert.equal(asked.type, "choice");
	if (asked.type !== "choice") throw new Error("Expected a choice");
	assert.match(asked.instructions, /Sixty Forests/);
	assert.match(asked.instructions, /written before this board existed/);
	assert.match(asked.instructions, /Recently:/);

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
	const quiet = await recap(built, reasoner({ role: "summary", stream, model: sol, tally: counted }), { number: 1, active: "A", from: built.log.length });
	assert.equal(quiet, null);
	assert.equal(sent.length, 0, "an empty turn is not sent to a model");

	// Play until something public happens, then summarise it.
	while (built.log.length === from) {
		const decision = nextDecision(built);
		if (!decision) { advance(built); continue; }
		const land = decision.options.find((option) => option.id.startsWith("land:"));
		apply(built, (land ?? decision.options[0]!).id, "model", "chosen");
	}
	const said = await recap(built, reasoner({ role: "summary", stream, model: sol, thinking: "low", tally: counted }), { number: 1, active: "A", from });
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
	const after = await recap(built, reasoner({ role: "summary", stream, model: sol, tally: counted }), { number: 2, active: "B", from: built.log.length - 1 });
	assert.ok(after);
	// A Swamp on the battlefield is public and may be named; a count of a hand is
	// all the request carries about what is still hidden.
	assert.match(sent.at(-1)!.user, /Swamp/);
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

	// Walk a turn. A plan is worth a call only where more than one move is listed,
	// which on a land deck is the main phase and nothing else.
	const planned = new Set<string>();
	while (built.cursor.turn === 1) {
		if (worthPlanning(built)) planned.add(built.cursor.steps[0]!);
		const decision = nextDecision(built);
		if (!decision) { advance(built); continue; }
		const land = decision.options.find((option) => option.id.startsWith("land:"));
		apply(built, (land ?? decision.options[0]!).id, "model", "chosen");
	}
	assert.deepEqual([...planned], ["precombat-main"]);
});

test("the whole table is seated, briefed and played, and the recaps do not block it", async () => {
	const built = table();

	// A commentator that takes a beat to answer. If the loop awaited each recap
	// the game could not finish in less than one delay per turn.
	const delay = 25;
	const { stream: talking, sent: said } = chat(() => "Something happened.");
	const slow: Stream = (model, context, options) => {
		const inner = talking(model, context, options);
		return { result: async () => { await new Promise((r) => setTimeout(r, delay)); return inner.result(); } };
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
	const seated = await seatTable(built, async () => parts, inference, universe, { format: standard.name });
	assert.ok(seated.chronicle.briefs[0]?.deck, "seat 0 was briefed");
	assert.ok(seated.chronicle.briefs[1]?.deck, "seat 1 was briefed");

	const outcome = await run(built, seated, inference, parts[2]!, undefined);
	const ms = Date.now() - began;

	assert.ok(outcome, "the game finished");
	assert.equal(seated.picks(), picks);
	assert.ok(seated.chronicle.recaps.length > 50, `${seated.chronicle.recaps.length} recaps`);
	assert.equal(said.length, seated.chronicle.recaps.length);

	// In turn order however late each answer landed, so the last three are the
	// last three turns.
	const turns = seated.chronicle.recaps.map((r) => r.turn);
	assert.deepEqual(turns, [...turns].sort((a, b) => a - b));

	// The proof that they ran beside the game: awaiting each one would have cost
	// at least one delay per recap, and the whole run took far less than that.
	assert.ok(ms < seated.chronicle.recaps.length * delay, `${ms}ms against ${seated.chronicle.recaps.length} x ${delay}ms`);

	// Every role is in one bill, with the decision model counted separately
	// because Pi does not meter a classifier's tokens.
	const reading = report(built, seated, outcome, ms).join("\n");
	assert.match(reading, /pregame/);
	assert.match(reading, /summary/);
	assert.match(reading, /picks     \d+ decision-model calls/);
	assert.match(reading, /forced    9\d\.\d%/);

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
	assert.equal(seatedQuiet.tally.spent().length, 0, "nothing was asked of a model that is off");
});
