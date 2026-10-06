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
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { Api, Model } from "@earendil-works/pi-ai";

import { brief, current, emptyBrief, needsNote } from "../src/context/brief.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { degraded, run, seat as seatTable } from "../src/context/sit.ts";
import { gameResult, report, preparationFailure, saveReport } from "../tools/game-report.ts";
import { totals, usageReport } from "../src/context/metrics.ts";
import { timeline, timelineData } from "../tools/game-timeline.ts";
import { bill, CEILING, tally, type Spend } from "../src/context/spend.ts";
import { question } from "../src/context/seat.ts";
import { recap, recent } from "../src/context/summary.ts";
import { worthPlanning } from "../src/context/strategy.ts";
import { facts as strategyFacts } from "../src/context/strategy-facts.ts";
import { load as loadCards } from "../src/core/cards.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { splits } from "../src/core/odds.ts";
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
const turnTable = () => start(standard, [{ name: "A", deck: deck("Forest turns") }, { name: "B", deck: deck("Island turns") }], "reasoning");

/** What an analyst submits, and what the synthesis submits, in the shape the pregame checks. */
const FINDINGS = { conclusions: [{ claim: "Develop the Elves before anything else.", evidence: ["4 Llanowar Elves", "16 one-drops"], assumptions: ["no early removal"],
	changesWhen: "the opponent shows removal on turn one", destination: "route" }], unsure: [] };
const BRIEF = { role: "Beatdown: force the exchange before control stabilizes.", route: "Curve out and pump the biggest creature.", recovery: "Rebuild with Elves.",
	matchup: "Their removal is sorcery-speed; attack around it.", opening: {
		play: { keep: "Keep two to four lands with a one-drop.", bottom: "Preserve an early creature and two lands." },
		draw: { keep: "Keep two to four lands with early creatures.", bottom: "Preserve two lands and a curve of creatures." },
	},
	steps: { "precombat-main": { own: "Play a land, then a creature.", opponent: "Hold Veil for a removal spell." } },
	cards: { "Snakeskin Veil": "Hold it for their removal, not for a block." }, traps: ["Pumping into an open blocker."],
	policies: {
		sequencing: { when: "Developing creatures with protection available.", priorities: ["Resolve the creature before protecting it."],
			reserve: "One green for Veil.", reconsider: "A response is needed before development.",
			example: { position: "Two Forests, Llanowar Elves and Snakeskin Veil in hand.", line: ["Cast Elves from one Forest.", "Retain the other Forest for Veil after Elves resolves."], exception: "Elves is countered; release the protection hold." } },
		resources: { when: "A spell and a response share sources.", priorities: ["Allocate the response, then the affordable development."],
			reserve: "A green source for Veil.", reconsider: "There is no creature worth protecting.",
			example: { position: "One Forest, Elves on the battlefield, Veil in hand.", line: ["Keep the Forest untapped while Elves is threatened."], exception: "A lethal line needs that mana now." } },
		responses: { when: "A removal spell targets our creature.", priorities: ["Protect the relevant target while the removal is pending."],
			reserve: "Veil and one green.", reconsider: "The targeted creature is no longer part of the line.",
			example: { position: "Elves targeted by removal, Veil and an untapped Forest available.", line: ["Respond with Veil targeting Elves.", "Wait for both effects."], exception: "The opposing effect cannot be answered by hexproof or the counter." } },
		combat: { when: "Choosing attackers.", priorities: ["Prevent opposing lethal.", "Attack with creatures not required for that defense."],
			reserve: "A blocker that can legally stop the relevant threat.", reconsider: "Evasion changes the possible blocks.",
			example: { position: "Our grounded creatures race a flying threat.", line: ["Do not count grounded creatures as blockers for that flyer.", "Use the prepared racing line."], exception: "A creature gains reach or flying." } },
		recovery: { when: "The main threat is removed.", priorities: ["Preserve enough mana to rebuild.", "Develop the next threat."],
			reserve: "Resources required by that threat.", reconsider: "The opponent threatens lethal before it matters.",
			example: { position: "Our threat died and Elves remains in hand with a Forest available.", line: ["Develop Elves."], exception: "Using the last green source loses an essential response." } },
	} };
const analystFindings = (request: Parameters<Stream>[1]) => {
	const schema = request.tools!.find((one) => one.name === "submit")!.parameters as {
		properties: { value: { properties: { policies: { properties: Record<string, unknown> } } } };
	};
	const owned = Object.keys(schema.properties.value.properties.policies.properties);
	return { ...FINDINGS, policies: Object.fromEntries(owned.map((family) => [family, BRIEF.policies[family as keyof typeof BRIEF.policies]])) };
};
/** Pi's stream as the pregame meets it: each analyst submits findings, the synthesis submits the brief. */
function pregame(options: { hold?: Promise<void>; fail?: string; brief?: object } = {}) {
	const tasks: string[] = [], seen: string[] = [], families: string[][] = [];
	const stream: Stream = (_model, context) => {
		const task = String((context.messages[1] as { content?: unknown } | undefined)?.content ?? "");
		const synthesis = task.includes("Write the brief now");
		const findings = synthesis ? undefined : analystFindings(context);
		if (findings) families.push(Object.keys(findings.policies));
		tasks.push(task);
		seen.push(JSON.stringify(context.messages));
		const failing = options.fail && task.includes(options.fail);
		return { result: async () => {
			if (options.hold && !synthesis) await options.hold;
			const usage = { input: 100, output: 20, cacheRead: 10, cacheWrite: 0, reasoning: 8, totalTokens: 130, cost: { input: 0.0001, output: 0.00004, cacheRead: 0, cacheWrite: 0, total: 0.00014 } };
			if (failing) return { content: [{ type: "text", text: "Prose instead of findings." }], stopReason: "stop", usage };
			return { content: [{ type: "toolCall", id: `call-${tasks.length}`, name: "submit", arguments: { value: synthesis ? options.brief ?? { ...BRIEF, cards: {} } : findings } }], stopReason: "toolUse", usage };
		} };
	};
	return { stream, tasks, seen, families };
}

test("the pregame asks four analysts at once, then one synthesis, and files the brief where it is read", async () => {
	const built = table();
	const [me, them] = built.seats;
	assert.equal(needsNote(universe.cards.get("Forest")!), false);
	assert.equal(needsNote(universe.cards.get("Cavern of Souls")!), true);

	let release = () => {};
	const hold = new Promise<void>((resolve) => { release = resolve; });
	const { policies: _policies, ...withoutPolicies } = BRIEF;
	const { stream, tasks, families } = pregame({ hold, brief: withoutPolicies });
	const counted = tally();
	const writing = brief(me!, [them!], universe, () => reasoner({ role: "pregame", stream, model: sol, thinking: "low", tally: counted, backoffMs: 0 }), { format: standard.name });
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(tasks.length, 4, "all four analysts started before any finished");
	assert.equal(counted.spent().filter((call) => call.pending).length, 4, "dispatched work is counted before a reply exists");
	assert.deepEqual(tasks.map((task) => task.split(".")[0]).sort(), ["CHALLENGE", "DECK AND RESOURCES", "MATCHUP", "OPENING"]);
	assert.deepEqual(families, [["sequencing", "resources"], ["responses", "combat"], [], ["recovery"]], "each turn-policy family has one analyst; opening owns its separate decisions");
	release();
	const written = await writing;
	assert.equal(tasks.length, 5, "then one synthesis");
	assert.match(tasks[4]!, /"deck":\{"conclusions"/, "the synthesis reads every analyst's findings");
	assert.deepEqual({ ...written, seat: undefined, version: undefined, gaps: undefined }, { ...BRIEF, seat: undefined, version: undefined, gaps: undefined });
	assert.equal(written.version, 3);
	assert.deepEqual(written.gaps, []);
	assert.deepEqual(current({ seat: 0, version: 1, deck: "An older brief." }, 0).gaps, ["The carried brief is an older shape and was not used."]);

	const spent = counted.spent();
	assert.deepEqual(spent.map((one) => one.ceiling), [2000, 2000, 2000, 2000, 4000], "an analyst's ceiling, then the synthesis's");
	assert.ok(spent.every((one) => one.thinking === "low" && one.usage?.reasoning === 8));
	assert.ok(spent.every((one) => !one.pending), "settling an attempt clears pending without adding another call");
	assert.match(bill(spent).join("\n"), /pregame/);
	const frame = { seat: me!.id, version: built.cursor.clock, view: project(built, me!.id) };
	const forTurn = JSON.parse(strategyFacts(frame, { brief: written }));
	assert.deepEqual(forTurn.brief.policies, written.policies, "turn preparation keeps dependencies and contingency examples across all five families");
	const forResponse = JSON.parse(strategyFacts(frame, { brief: written }, {}, "response"));
	assert.deepEqual(Object.keys(forResponse.brief.policies), ["resources", "responses", "combat"], "a current response repair does not plan next turn's development");
	assert.equal(forTurn.brief.route, undefined, "the new policies replace duplicate legacy strategic paragraphs");
	assert.equal(forTurn.brief.opening, undefined, "completed opening decisions do not accompany a turn question");
	assert.equal(forTurn.brief.steps, undefined, "existing phase scripts arrive through the base plan, not twice");
	assert.equal(forTurn.brief.cards["Snakeskin Veil"], undefined, "a card note does not follow an unidentified library object");
});

test("the analysts read both lists and computed odds, look rules up, and a failed analyst reaches the synthesis as a failure", async () => {
	const built = table();
	const rules = loadRules("rules/cr.tsv");
	const { stream, tasks, seen } = pregame({ fail: "OPENING" });
	const written = await brief(built.seats[0]!, [built.seats[1]!], universe, () => reasoner({ role: "pregame", stream, model: sol, tally: tally(), backoffMs: 0 }), { format: standard.name, rules });
	const facts = seen[0]!;
	assert.match(facts, /public registered deck/);
	assert.match(facts, /4 Qiqirn Merchant/, "the opponent's registered list is in front of every analyst");
	assert.match(facts, /60 cards, 20 lands/);
	assert.match(facts, /Lands in an opening seven: 0: \d+\.\d%/);
	for (const id of built.things.keys()) assert.equal(facts.includes(`"${id}"`), false, "no object ids");
	assert.equal(written.gaps.length, 1);
	assert.match(written.gaps[0]!, /^opening:.*did not submit/);
	assert.match(tasks.at(-1)!, /"opening":\{"failed"/, "the synthesis is told the opening analyst failed");
	assert.equal(written.route, BRIEF.route, "the brief is still written from the others");

	// Lookups answer rather than throw.
	// Each analyst looks one thing up, then submits; the synthesis submits the brief.
	const lookup = (name: string, args: Record<string, unknown>) => {
		const answers: string[] = [];
		const asking: Stream = (_model, context) => {
			const last = context.messages.at(-1) as { role?: string };
			if (last.role === "toolResult") answers.push(JSON.stringify(last));
			const fresh = context.messages.length === 2 && !String((context.messages[1] as { content?: unknown }).content).includes("Write the brief now");
			const value = String((context.messages[1] as { content?: unknown }).content).includes("Write the brief now") ? { ...BRIEF, cards: {} } : analystFindings(context);
			return { result: async () => fresh ? { content: [{ type: "toolCall", id: "a", name, arguments: args }], stopReason: "toolUse" }
				: { content: [{ type: "toolCall", id: "b", name: "submit", arguments: { value } }], stopReason: "toolUse" } };
		};
		return { asking, answered: () => answers.join("\n") };
	};
	for (const [name, args, expected] of [["rule", { query: "702.19b" }, /702\.19b/], ["rule", { query: "701.66" }, /701\.66a.*701\.66b/], ["rule", { query: "no such words anywhere" }, /Nothing in the rules matches/],
		["card", { name: "Snakeskin Veil" }, /hexproof/], ["card", { name: "Not A Card" }, /No Standard card is named/]] as const) {
		const probe = lookup(name, args);
		await brief(built.seats[0]!, [built.seats[1]!], universe, () => reasoner({ role: "pregame", stream: probe.asking, model: sol, tally: tally(), backoffMs: 0 }), { format: standard.name, rules });
		assert.match(probe.answered(), expected);
	}
});

test("a brief snippet reaches the decision and a card note only when its card is visible", async () => {
	const opening = table();
	advance(opening);
	const policy = { ...emptyBrief(0), opening: BRIEF.opening };
	const openingPacket = () => {
		const decision = nextDecision(opening)!;
		return focus({ seat: decision.seat, version: opening.cursor.clock, view: project(opening, decision.seat), decision }, startingIntent(decision.seat), { brief: policy });
	};
	assert.deepEqual(openingPacket().guidance, [BRIEF.opening.play.keep], "only the starting seat's keep policy reaches its declaration");
	apply(opening, "mulligan", "model", "chosen");
	assert.deepEqual(openingPacket().guidance, [BRIEF.opening.draw.keep], "the other seat receives the draw policy, without bottom instructions");
	apply(opening, "keep", "model", "chosen");
	advance(opening);
	assert.deepEqual(openingPacket().opening, { starting: 0, mulligans: 1, bottom: 1, hand: openingPacket().opening!.hand });
	apply(opening, "keep", "model", "chosen");
	advance(opening);
	assert.deepEqual(openingPacket().guidance, [BRIEF.opening.play.bottom], "after keeping, only the bottom policy is read");
	assert.deepEqual(openingPacket().options.map((one) => one.id), nextDecision(opening)!.options.map((one) => one.id), "the policy narrows context, never choices");
	const bottom = nextDecision(opening)!;
	const legacy = focus({ seat: bottom.seat, version: opening.cursor.clock, view: project(opening, bottom.seat), decision: bottom }, startingIntent(bottom.seat),
		{ brief: { ...policy, opening: { old: "The original policy remains whole." } } });
	assert.deepEqual(legacy.guidance, ["old: The original policy remains whole."], "a carried free-form note is preserved, not guessed into a new shape");

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

	const written = { ...emptyBrief(0),
		route: "Green Stompy curves out and pumps its biggest creature.",
		matchup: "Expect to be behind on everything.",
		opening: "Keep any seven.",
		steps: { "precombat-main": { own: "Play a land. There is nothing else.", opponent: "Nothing to do on their main phase." } },
		cards: { Forest: "It taps for green.", "Cavern of Souls": "Name the tribe you cast most." },
	};
	const recaps = [{ turn: 1, active: "A", line: "A played a Forest.", from: 0, to: 4 }];
	const decision = nextDecision(built)!;
	const packet = focus(
		{ seat: decision.seat, version: built.cursor.clock, view: project(built, decision.seat), decision },
		startingIntent(decision.seat),
		{ brief: written, recaps },
	);

	assert.ok(packet.guidance.includes("Play a land. There is nothing else."), "this window's note, for whose turn it is");
	assert.equal(packet.guidance.includes("Nothing to do on their main phase."), false);
	assert.ok(packet.guidance.some((line) => line.startsWith("Forest:")), "the note for a card an option names is in");
	assert.equal(packet.guidance.some((line) => line.startsWith("Cavern")), false, "an absent card costs nothing");
	assert.equal(JSON.stringify(packet).includes("Green Stompy curves out"), false, "the deck reading is strategy's, not the pilot's");
	assert.equal(JSON.stringify(packet).includes("behind on everything"), false, "so is the matchup");
	assert.deepEqual(packet.lately, [], "the pilot reads current turn events and prepared guidance, not an arbitrary tail of recaps");
	assert.deepEqual(packet.history, project(built, decision.seat).history);
	assert.deepEqual(recent(recaps), ["Turn 1: A played a Forest."]);

	const asked = question(packet, false);
	assert.equal(asked.type, "choice");
	if (asked.type !== "choice") throw new Error("Expected a choice");
	assert.match(asked.instructions, /supplied facts and this seat's preparation/);
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
	const built = turnTable();

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
	const { stream: thinking } = pregame();

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
	assert.ok(seated.chronicle.briefs[0]?.route, "seat 0 was briefed");
	assert.ok(seated.chronicle.briefs[1]?.route, "seat 1 was briefed");

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
		assert.equal(request.size.bytes, Buffer.byteLength(JSON.stringify(request.request)), "diagnostics report exact serialized bytes without a token estimate");
		if (request.kind === "classify") {
			const sent = request.request as { state: { actor: number; options: { id: string }[] }; questions: { pick: { criteria: Record<string, string> } } };
			assert.ok([0, 1].includes(sent.state.actor));
			assert.ok(sent.state.options.every((option) => option.id in sent.questions.pick.criteria));
		} else assert.ok(request.settings.maxTokens! > 0);
	}

	// Every role is in one bill, with the decision model counted separately
	// because Pi does not meter a classifier's tokens.
	const result = gameResult(built, seated);
	const reading = report(result).join("\n");
	assert.equal(result.schema, 1);
	assert.deepEqual(JSON.parse(JSON.stringify(result)).llm, result.llm, "the saved report retains exact aggregates");
	assert.equal(result.fromVersion, 0);
	assert.equal(result.version, built.ledger.length);
	assert.ok(result.timing!.preparedAt! <= result.timing!.playStartedAt!);
	assert.ok(result.timing!.playStartedAt! <= result.timing!.playEndedAt!);
	assert.ok(result.timing!.playEndedAt! <= result.timing!.finishedAt!);
	assert.equal(result.elapsedMs, result.timing!.finishedAt! - result.timing!.startedAt);
	assert.equal(result.timing!.turns![0]!.turn, 1, "the first turn is recorded after the opening");
	assert.ok(result.timing!.turns!.every((mark, i) => mark.source === "recorded" && mark.turn === i + 1));
	assert.equal(result.timing!.turns!.at(-1)!.turn, built.cursor.turn, "the unfinished last turn is also timed");
	assert.match(reading, /pregame/);
	assert.match(reading, /summary/);
	assert.match(reading, /jev       \d+ calls/);
	const [, forced, chosen] = reading.match(/forced (\d+)  delegated \d+  chosen (\d+)/)!;
	assert.ok(Number(forced) > 0 && Number(chosen) > 1000, "rules perform compulsory work while both pilots answer voluntary windows");
	assert.match(reading, /judge     0 calls/);

	// A role switched off is a decision, not a gap.
	const quiet = turnTable();
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

test("a game bill counts attempts and separates overlapping time, role, model and reported usage", () => {
	const usage = { input: 100, output: 20, cacheRead: 10, cacheWrite: 5, reasoning: 8, totalTokens: 135,
		cost: { input: 0.0001, output: 0.00004, cacheRead: 0, cacheWrite: 0, total: 0.00014 } };
	const base: Spend = { role: "strategy", about: "preparation", model: "test/sol", thinking: "low", ceiling: 4000, at: 0, ms: 1000, usage };
	const calls: Spend[] = [base,
		{ ...base, role: "pregame", thinking: "high", at: 250, ms: 500 },
		{ ...base, role: "judge", about: "ruling", at: 2000, ms: 250 },
		{ ...base, role: "judge", about: "ruling", model: "test/other", at: 2250, ms: 250, usage: undefined, failed: "retry" },
		{ ...base, role: "judge", about: "ruling", at: 3000, ms: 100, usage: undefined, cancelled: true },
		{ ...base, at: 4000, ms: 0, usage: undefined, pending: true }];
	const result = usageReport(calls, 4500), total = result.total;
	assert.equal(total.calls, 6);
	assert.equal(total.callMs, 2600);
	assert.equal(total.activeMs, 2100, "overlaps and idle gaps are not summed as elapsed time");
	assert.equal(total.input, 345, "input includes fresh, cached read and cached write tokens once");
	assert.equal(total.output, 60, "reasoning is already in output");
	assert.equal(total.reasoning, 24);
	assert.equal(total.missingUsage, 3);
	assert.equal(total.missingCost, 3);
	assert.deepEqual([total.failed, total.cancelled, total.pending], [1, 1, 1]);
	assert.equal(result.models.length, 3, "thinking levels and providers are distinct");
	assert.equal(result.models.find((one) => one.model === "test/sol" && one.thinking === "low")!.calls, 4, "a model total includes all its roles");
	assert.equal(result.roles.find((one) => one.role === "judge")!.calls, 3);
	assert.equal(result.roles.find((one) => one.role === "summary")!.calls, 0);
	assert.equal(totals([{ ...base, at: undefined }]).activeMs, null, "older calls without start times have unknown overlap");
	assert.equal(totals([]).activeMs, 0);
	assert.equal(totals([{ ...base, failed: "error", usage: { ...usage, totalTokens: 0 } }]).missingUsage, 1);
	const failed = preparationFailure(table(), Object.assign(new Error("refused"), {
		spends: calls, timing: { startedAt: 0, finishedAt: 4500 }, problem: "Card meaning missing.",
	}), 0);
	assert.equal(failed.llm!.total.calls, 6, "refused preparation does not lose its bill");
	assert.equal(failed.error, "Card meaning missing.");
	const reading = report({ ...failed, error: undefined, interruptions: { stops: 0, essential: 0, help: 0, rulings: 1, upheld: 0 }, judged: { cases: 1, failed: 0 } }).join("\n");
	assert.match(reading, /judge\s+3 calls\s+1 cases this run.*1 game rulings\s+0 rollbacks/);
	assert.match(reading, /unmetered 3 calls lack usage/);
	const plotted = { ...failed, calls: [base, { ...base, at: 500 }, { ...base, at: 1500, ms: 200 }] };
	const chart = timelineData(plotted, [{ at: 700, turn: 1, active: 0, source: "first-observed" }]);
	assert.equal(chart.peak, 2);
	assert.equal(chart.groups[0]!.lanes, 2, "concurrent calls in one role occupy separate rows");
	assert.deepEqual(chart.groups[0]!.calls.map((call) => call.lane), [0, 1, 0], "rows are reused after a request ends");
	assert.equal(chart.turns[0]!.source, "first-observed", "trace-derived turns never claim exact starts");
	assert.equal(timelineData({ ...plotted, timing: { startedAt: 0, finishedAt: 4500, turns: [{ at: 650, turn: 1, active: 0, source: "recorded" }] } }, chart.turns).turns[0]!.at, 650);
	const seed = '</script><script>throw Error("injection")</script> $&';
	const html = timeline({ ...plotted, seed });
	assert.ok(!html.includes('</script><script>throw'), "saved text cannot escape the data block");
	assert.equal(JSON.parse(html.match(/<script id="game" type="application\/json">([\s\S]*?)<\/script>/)![1]!).seed, seed);
	const path = join(mkdtempSync(join(tmpdir(), "magic-report-")), "game.result.json");
	assert.equal(saveReport(path, plotted).length, 2, "the same run saves its JSON and standalone HTML");
	assert.equal(JSON.parse(readFileSync(path, "utf8")).calls.length, 3);
	assert.ok(readFileSync(path.replace(".result.json", ".timeline.html"), "utf8").includes("function draw()"), "the viewer script is embedded");
	assert.throws(() => timelineData({ ...plotted, calls: [{ ...base, at: undefined }], timing: undefined }), /no request timestamps/);
});

test("a carried brief keeps its failures, and a stuck recap cannot lose a saved game", async () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-carried-"));
	const built = turnTable();
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
	const scarred = { ...emptyBrief(0), route: "Green Stompy.", gaps: ["opening: the model fell over"] };

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
	assert.equal(seated.chronicle.briefs[0]!.route, "Green Stompy.");
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
	const talk = pregame();
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
	const first = start(standard, [{ deck: deck("Forest turns") }, { deck: deck("Island turns") }], "life");
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
	assert.equal(again.chronicle.briefs[0]!.route, seated.chronicle.briefs[0]!.route, "the carried plan survived");
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
	let researching = 0;
	const researcher = reasoner({ role: "pregame", model: sol, tally: tally(), stream: (_model, context) => {
		researching++;
		if (researching < 3) return { result: async () => ({ stopReason: "toolUse", content: [{ type: "toolCall", id: `read-${researching}`, name: "lookup", arguments: { rule: "701.66a" } }] }) };
		assert.deepEqual(context.tools!.map((one) => one.name), ["submit"], "the final reply reserves delivery rather than another lookup");
		assert.match(JSON.stringify(context.messages.at(-1)), /final reply is for submit/);
		assert.match(JSON.stringify(context.messages), /Rule 701\.66a/, "reference answers survive into submission");
		return { result: async () => ({ stopReason: "toolUse", content: [{ type: "toolCall", id: "answer", name: "submit", arguments: { commands: ["prepared"] } }] }) };
	} });
	assert.deepEqual(await researcher.work("assess card", { system: "S", user: "card" }, { submit, lookups: [lookup], turns: 3 }), { commands: ["prepared"] });
	assert.equal(researching, 3, "reserving submission does not raise the session's call budget");

	const stubborn = reasoner({ role: "strategy", stream: () => ({ result: async () => ({ content: [{ type: "text", text: "Prose." }], stopReason: "stop" }) }), model: sol, tally: tally(), backoffMs: 0 });
	await assert.rejects(stubborn.work("seat plan", { system: "S", user: "facts" }, { submit, turns: 2 }), /did not submit an accepted answer/);

	// Cancelling speculative work is not a failed configuration, never retries,
	// and leaves the same reasoner usable for the real decision.
	const cancelled = tally(), controller = new AbortController();
	let calls = 0;
	const cancellable = reasoner({ role: "strategy", model: sol, tally: cancelled, backoffMs: 0, stream: (_model, _context, options) => {
		calls++;
		if (calls === 1) { assert.ok(options?.signal); return { result: () => new Promise(() => {}) }; }
		return { result: async () => ({ content: [{ type: "toolCall", id: "ready", name: "submit", arguments: { commands: ["plan"] } }], stopReason: "toolUse" }) };
	} });
	const pending = cancellable.work("preparation", { system: "S", user: "old" }, { submit, signal: controller.signal });
	controller.abort(new Error("superseded"));
	await assert.rejects(pending, /superseded/);
	assert.equal(calls, 1);
	assert.equal(cancelled.spent()[0]!.cancelled, true);
	assert.equal(cancellable.broken(), null);
	assert.deepEqual(await cancellable.work("turn", { system: "S", user: "now" }, { submit }), { commands: ["plan"] });
	assert.equal(calls, 2);
});

test("opening-hand splits are exact: they match counting every hand", () => {
	// Six cards: two lands, one cheap spell, three others. Every three-card hand, counted.
	const deck = ["L", "L", "C", "O", "O", "O"], hands: string[][] = [];
	for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) hands.push([deck[a]!, deck[b]!, deck[c]!]);
	for (const { counts, chance } of splits([2, 1, 3], 3)) {
		const matching = hands.filter((hand) => ["L", "C", "O"].every((kind, at) => hand.filter((card) => card === kind).length === counts[at])).length;
		assert.ok(Math.abs(chance - matching / hands.length) < 1e-12, `${counts}`);
	}
	assert.ok(Math.abs(splits([2, 1, 3], 3).reduce((sum, one) => sum + one.chance, 0) - 1) < 1e-12);
});
