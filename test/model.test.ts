/**
 * A seat answered by a decision model, end to end, with no network.
 *
 * The classifier is a test double, so this covers what the unit fixtures never
 * reach: resolving a roster, building the request, reading the answer, carrying
 * a refusal into the retry, and finishing a game. The double is the only thing
 * standing in for Pi, and its shape is Pi's own `classify`.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { Api, ClassifierApi, ClassifierModel, ClassifierResult, Model } from "@earendil-works/pi-ai";

import { decisionApi, type Classify } from "../src/context/model.ts";
import { startingIntent } from "../src/context/plan.ts";
import { assign, cast, load, readRoster, readWhy, rosterFor, save, suggested } from "../src/context/roles.ts";
import { aiSeat, question } from "../src/context/seat.ts";
import { focus } from "../src/context/packet.ts";
import { start } from "../src/core/commit.ts";
import { advance, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import { play } from "../src/core/loop.ts";
import { project } from "../src/core/view.ts";

const chat = (provider: string, id: string): Model<Api> => ({
	id, name: id, api: "openai-completions" as Api, provider, baseUrl: "https://example.invalid/",
	input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	reasoning: true, contextWindow: 1000, maxTokens: 100,
});

const jev: ClassifierModel<ClassifierApi> = {
	type: "classifier", id: "jev-latest", name: "Jev", api: "typesafe-system-one",
	provider: "typesafe", baseUrl: "https://example.invalid/", input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000,
};

const catalogue = {
	chat: [chat("openai", "gpt-6.1-sol"), chat("openai", "gpt-5.6-luna"), chat("openrouter", "openai/gpt-5.6-luna")],
	classifiers: [jev],
};

test("a roster resolves patterns the way a reader would type them", () => {
	const parts = cast(suggested, catalogue);
	const of = (role: string) => parts.find((part) => part.role === role)!;

	// The suggested defaults resolve against a catalogue that has them.
	assert.equal(of("decide").model?.id, "jev-latest");
	assert.equal(of("pregame").model?.id, "gpt-6.1-sol");
	assert.equal(of("pregame").thinkingLevel, "low");
	assert.equal(of("judge").model?.id, "gpt-6.1-sol");
	assert.equal(of("summary").model?.id, "gpt-5.6-luna");
	assert.equal(of("summary").thinkingLevel, "low");
	for (const part of parts) assert.equal(part.problem, undefined, `${part.role}: ${part.problem}`);

	// A level that was not asked for is not claimed. Pi uses the model's default.
	assert.equal(cast({ summary: "gpt-5.6-luna" }, catalogue).find((p) => p.role === "summary")!.thinkingLevel, undefined);

	// Every default says what it was chosen for, so changing one is an informed
	// change. A default nobody can argue with is a default nobody can improve.
	const why = readWhy().join("\n");
	for (const role of ["decide", "pregame", "strategy", "judge", "summary"]) {
		assert.match(why, new RegExp(`^${role}  \\S+$`, "m"));
	}
	assert.ok(why.length > 600, "the reasoning is articulated, not labelled");

	// A classifier role never resolves to a chat model, whatever is named.
	assert.match(cast({ decide: "gpt-6.1-sol" }, catalogue)[0]!.problem!, /No available model matches/);

	// provider/id is exact. A bare id in two providers is refused, not guessed.
	assert.equal(cast({ judge: "openrouter/openai/gpt-5.6-luna" }, catalogue).find((p) => p.role === "judge")!.model?.provider, "openrouter");
	const vague = cast({ judge: "luna" }, catalogue).find((part) => part.role === "judge")!;
	assert.match(vague.problem!, /matches .*openai.* Name one/);
	assert.equal(vague.model, undefined);
	assert.match(cast({ judge: "nothing-like-this" }, catalogue).find((p) => p.role === "judge")!.problem!, /No available model/);

	// The listing names every role and what it is for, so it is the whole surface.
	const lines = readRoster(parts).join("\n");
	for (const role of ["decide", "pregame", "strategy", "judge", "summary"]) assert.match(lines, new RegExp(role));
});

test("a seat roster overrides every, and the file refuses an invented role", () => {
	// A seat's own roster is what lets one model play another in a bulk run.
	const crew = assign(assign({}, "strategy", "gpt-6.1-sol"), "strategy", "gpt-5.6-luna", 1);
	assert.equal(rosterFor(crew, 0).strategy, "gpt-6.1-sol");
	assert.equal(rosterFor(crew, 1).strategy, "gpt-5.6-luna");
	assert.equal(rosterFor(crew).strategy, "gpt-6.1-sol");
	assert.equal(rosterFor({}, 0).judge, suggested.judge);

	const path = join(mkdtempSync(join(tmpdir(), "magic-roster-")), "roster.json");
	assert.deepEqual(load(path), {}, "a missing file is an empty roster, not an error");
	save(path, crew);
	assert.deepEqual(load(path), crew);
	save(path, { every: { oracle: "gpt-6.1-sol" } } as never);
	assert.throws(() => load(path), /names a role oracle/);
});

/** Pi's classify, as a double. `answer` decides what comes back per request. */
function fake(answer: (criteria: string[], instructions: string) => Record<string, unknown>) {
	const seen: { instructions: string; criteria: string[] }[] = [];
	const classify: Classify = async (model, request) => {
		const asked = request.questions.pick;
		if (!asked || asked.type !== "choice") throw new Error("Expected one choice question named pick");
		const criteria = Object.keys(asked.criteria);
		seen.push({ instructions: asked.instructions, criteria });
		return {
			api: model.api, provider: model.provider, model: model.id,
			answers: answer(criteria, asked.instructions) as ClassifierResult["answers"],
			stopReason: "stop", timestamp: 0,
		};
	};
	return { classify, seen };
}

const table = () => start(standard, [
	{ name: "A", deck: Array(60).fill("Forest") },
	{ name: "B", deck: Array(60).fill("Swamp") },
], "models");

const seatsOf = (built: ReturnType<typeof table>, classify: Classify, gaps: string[], onAsk?: () => void) =>
	Object.fromEntries(built.seats.map((seat) => [seat.id, aiSeat({
		name: seat.name,
		api: decisionApi(classify, jev),
		intent: startingIntent(seat.id),
		onGap: (note) => void gaps.push(note),
		...(onAsk ? { onAsk } : {}),
	})]));

test("a model-backed seat plays a whole game and is asked only what is not forced", async () => {
	const built = table();
	const picks: string[] = [];
	const { classify, seen } = fake((criteria) => {
		const land = criteria.find((id) => id.startsWith("land:"));
		const choice = land ?? criteria[0]!;
		picks.push(choice);
		return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 0.9 } };
	});
	let calls = 0;
	const outcome = await play(built, seatsOf(built, classify, built.gaps, () => void calls++), {});

	assert.ok(outcome, "the game finished");
	assert.equal(built.gaps.length, 0);
	assert.equal(Object.values(outcome.results).filter((r) => r === "win").length, 1);

	// Every request carried one choice question whose ids are the offered ids.
	const chosen = built.ledger.filter((row) => row.why === "chosen");
	assert.equal(seen.length, chosen.length);
	assert.equal(calls, chosen.length);
	assert.deepEqual(picks, chosen.map((row) => row.picked));
	for (const [at, request] of seen.entries()) assert.deepEqual(request.criteria, chosen[at]!.offered);

	// A forced decision costs no call, which is the whole economics of this.
	const forced = built.ledger.filter((row) => row.why === "forced").length;
	assert.ok(forced > calls * 5, `${forced} forced against ${calls} calls`);
	assert.ok(calls > 50, `${calls} calls`);
});

test("a refused answer reaches the next request, and a wrong answer kind becomes a gap", async () => {
	// First answer names an id that is not offered. The loop refuses it and asks
	// again, and the reason has to be in the second request or the model repeats.
	const built = table();
	let asked = 0;
	const { classify, seen } = fake((criteria) => {
		asked += 1;
		const choice = asked === 1 ? "not-an-option" : criteria[0]!;
		return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 0.5 } };
	});
	assert.ok(await play(built, seatsOf(built, classify, built.gaps), {}));
	assert.match(seen[1]!.instructions, /No option "not-an-option"/);
	assert.equal(seen[0]!.instructions.includes("not taken"), false);
	assert.deepEqual(seen[0]!.criteria, seen[1]!.criteria, "the same question, asked again");
	assert.equal(built.ledger.filter((row) => row.why === "fallback").length, 0, "a retry that works is not a fallback");

	// A score answer to a choice question is not a pick. The seat says so and
	// returns nothing usable, so the loop falls back where a terminating option
	// exists and writes a gap naming the model that sent it.
	const other = table();
	const { classify: wrong } = fake(() => ({ pick: { type: "score", score: 2, confidence: 0.4 } }));
	assert.equal(await play(other, seatsOf(other, wrong, other.gaps), {}), null);
	assert.equal(other.ledger[0]!.why, "fallback");
	assert.match(other.gaps.join(" "), /came back as a score answer/);
	assert.match(other.gaps.join(" "), /typesafe\/jev-latest/);

	// It stops rather than finishing. Keeping and passing have terminators, so
	// the game runs on fallbacks until a mandatory discard, which has none, and
	// then the table waits instead of discarding a card nobody chose.
	assert.ok(other.ledger.every((row) => row.why === "forced" || row.why === "fallback"));
	assert.equal(nextDecision(other)?.situation, "turn-based");
	assert.match(nextDecision(other)!.question, /Discard/);
	assert.equal(nextDecision(other)!.fallback, undefined);
	assert.match(other.gaps.at(-1)!, /no terminating option/);
});

test("the question says what is true and never what is good", () => {
	const built = table();
	advance(built);
	const decision = nextDecision(built)!;
	const intent = startingIntent(0);
	const asked = question(focus({ seat: 0, version: 0, view: project(built, 0), decision }, intent));
	assert.equal(asked.type, "choice");
	if (asked.type !== "choice") throw new Error("Expected a choice");

	// Every option is described, and none is recommended.
	assert.deepEqual(Object.keys(asked.criteria), decision.options.map((option) => option.id));
	for (const text of Object.values(asked.criteria)) assert.ok(text.length > 0);
	for (const word of ["should", "best", "recommend", "prefer this"]) {
		assert.equal(asked.instructions.toLowerCase().includes(word), false, word);
	}

	// The seat's own priorities are carried, labelled as the seat's.
	assert.match(asked.instructions, /Play a land every turn/);
	// Nothing of the other seat's hand crosses into the request.
	assert.equal(JSON.stringify(asked).includes("Swamp"), false);
});
