/**
 * The dialer. A route changes what a seat knows and nothing else.
 *
 * The property it rests on: following a route does not move the table, does
 * not change the question, and cannot be mistaken for a move.
 */

import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { dial, follow, topics } from "../src/context/dial.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { aiSeat, question } from "../src/context/seat.ts";
import { decisionApi } from "../src/context/model.ts";
import { tally } from "../src/context/spend.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { project } from "../src/core/view.ts";

const rules = loadRules("rules/cr.tsv");

const table = () => start(standard, [
	{ name: "A", deck: deck("Green Stompy") },
	{ name: "B", deck: deck("Dimir Control") },
], "dial");

/** Pi's classify, as a double. Answers with whatever the rule says, in order. */
function classifier(reply: (ids: string[], nth: number) => string) {
	const sent: { ids: string[]; instructions: string; learned?: string[]; refused?: string[] }[] = [];
	const classify = (async (_model: unknown, request: { state: { learned?: string[]; refused?: string[] }; questions: Record<string, { criteria: Record<string, string>; instructions: string }> }) => {
		const asked = request.questions.pick!;
		const ids = Object.keys(asked.criteria);
		sent.push({ ids, instructions: asked.instructions, learned: request.state.learned, refused: request.state.refused });
		const choice = reply(ids, sent.length - 1);
		return {
			api: "typesafe-system-one", provider: "typesafe", model: "jev-latest",
			answers: { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } },
			stopReason: "stop", timestamp: 0,
		};
	}) as never;
	return { classify, sent };
}

const jev = {
	type: "classifier" as const, id: "jev-latest", name: "Jev", api: "typesafe-system-one",
	provider: "typesafe", baseUrl: "x", input: ["text" as const],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000,
};
/**
 * Walk to the first turn decision with a real choice, taking the forced ones.
 *
 * It reads what is pending rather than assuming nothing is, so a caller that
 * already looked at the opening can hand the same table in.
 */
function toChoice(built: ReturnType<typeof table>) {
	for (;;) {
		const pending = nextDecision(built);
		if (!pending) { advance(built); continue; }
		if (pending.situation === "pregame") { apply(built, "keep", "model", "chosen"); continue; }
		if (pending.options.length > 1) return pending;
		apply(built, pending.options[0]!.id, "engine", "forced");
	}
}

test("every route cites a rule that resolves", () => {
	assert.ok(topics().length > 0);
	for (const route of topics()) {
		assert.match(route.id, /^rules:/, "a route id cannot be mistaken for a move");
		assert.ok(route.cites.length > 0, `${route.id} cites nothing`);
		for (const line of follow(route, rules)) {
			assert.equal(line.includes("not in "), false, line);
			assert.equal(line.includes("not a glossary term"), false, line);
			// A citation that resolves carries its own text, not a pointer to it.
			assert.ok(line.length > 40, `${route.id} answered with ${line}`);
		}
	}
});

test("a route is offered only where its subject is on the menu", () => {
	const built = table();
	advance(built);
	const opening = nextDecision(built)!;
	assert.deepEqual(dial(opening, rules).map((r) => r.id), ["rules:mulligan"]);
	// No rules handed in, nothing advertised.
	assert.deepEqual(dial(opening, undefined), []);

	const choice = toChoice(built);
	const offered = dial(choice, rules).map((r) => r.id);
	assert.ok(offered.includes("rules:priority"), `priority route missing from ${offered.join(", ")}`);
	assert.ok(offered.includes("rules:land"), "a land is offered, so its rule is askable");
	assert.equal(offered.includes("rules:mulligan"), false, "the opening is over");
});

test("following a route changes what the seat knows and nothing else", async () => {
	const built = table();
	const decision = toChoice(built);
	const land = decision.options.find((o) => o.id.startsWith("land:"))!;

	// Dial once, then play the land.
	const asked = classifier((ids, nth) => (nth === 0 ? "rules:land" : land.id));
	const seat = aiSeat({
		name: "A",
		api: decisionApi(asked.classify, jev, { tally: tally() }),
		intent: startingIntent(decision.seat),
		rules,
		onGap: (note) => assert.fail(note),
	});

	const before = structuredClone(built);
	const frame = { seat: decision.seat, version: built.cursor.clock, view: project(built, decision.seat), decision };
	const answer = await seat.answer(frame);

	// The whole point. A route is not a move.
	assert.deepEqual(built, before, "the table moved while a seat read a rule");
	assert.deepEqual(answer, { kind: "pick", option: land.id, actionId: "A-2" });

	// Two requests: the dial, then the move.
	assert.equal(asked.sent.length, 2);

	// The question did not change. Same moves offered, both times.
	const moves = (ids: string[]) => ids.filter((id) => !id.startsWith("rules:"));
	assert.deepEqual(moves(asked.sent[1]!.ids), moves(asked.sent[0]!.ids));

	// The rule arrived, with its number and its text, and it is labelled as asked for.
	assert.match(asked.sent[1]!.instructions, /learned contains the cited rules you asked/);
	assert.match(asked.sent[1]!.learned!.join(" "), /305\.2/);
	assert.match(asked.sent[1]!.learned!.join(" "), /one land during their turn/);
	assert.equal(asked.sent[0]!.learned, undefined, "not before it was asked for");

	// A route already followed is not offered again.
	assert.equal(asked.sent[1]!.ids.includes("rules:land"), false);
	assert.ok(asked.sent[0]!.ids.includes("rules:land"));

	// A refused pick retries this same decision. It must retain the fetched
	// facts and the spent route budget rather than dialling the same rule again.
	const retrying = classifier((_ids, nth) => nth === 0 ? "rules:land" : nth === 1 ? "not-offered" : land.id);
	const retrySeat = aiSeat({ name: "A", api: decisionApi(retrying.classify, jev), intent: startingIntent(decision.seat), rules, dials: 1, onGap: (note) => assert.fail(note) });
	await retrySeat.answer(frame);
	await retrySeat.answer({ ...frame, refused: ["not-offered was not a move"] });
	assert.equal(retrying.sent.length, 3);
	assert.equal(retrying.sent[2]!.ids.some((id) => id.startsWith("rules:")), false);
	assert.match(retrying.sent[2]!.learned!.join(" "), /305\.2/);
	assert.match(retrying.sent[2]!.refused!.join(" "), /not-offered was not a move/);
	assert.deepEqual(built, before);
});

test("a route reads as an ask and never as a move, and the budget ends the walk", async () => {
	const built = table();
	const decision = toChoice(built);

	// A seat that dials forever. The budget, not the seat, has to stop it.
	const greedy = classifier((ids) => ids.find((id) => id.startsWith("rules:")) ?? ids[0]!);
	const dialled: string[] = [];
	const seat = aiSeat({
		name: "A",
		api: decisionApi(greedy.classify, jev, { tally: tally() }),
		intent: startingIntent(decision.seat),
		rules,
		dials: 1,
		onGap: (note) => assert.fail(note),
		onDial: (route) => dialled.push(route),
	});

	const before = structuredClone(built);
	const answer = await seat.answer({
		seat: decision.seat, version: built.cursor.clock,
		view: project(built, decision.seat), decision,
	});

	assert.deepEqual(dialled, ["rules:priority"], "one dial, then the budget is spent");
	assert.equal(greedy.sent.length, 2);
	// Past the budget nothing is advertised, so the seat has to answer with a move.
	assert.deepEqual(greedy.sent[1]!.ids.filter((id) => id.startsWith("rules:")), []);
	assert.equal(answer.kind, "pick");
	assert.ok(decision.options.some((o) => o.id === (answer as { option: string }).option));
	assert.deepEqual(built, before);

	// The menu says an ask acts on nothing, and says what it does not promise.
	const packet = focus(
		{ seat: decision.seat, version: 0, view: project(built, decision.seat), decision },
		startingIntent(decision.seat),
		{ rules },
	);
	const asked = question(packet, false);
	assert.equal(asked.type, "choice");
	if (asked.type !== "choice") throw new Error("Expected a choice");
	assert.match(asked.criteria["rules:priority"]!, /Acts on nothing/);
	assert.match(asked.instructions, /Rule asks show the named rule and return to this decision without acting/);
	assert.match(asked.instructions, /Acceptance does not certify card meaning or rules legality/);
	// And it still never says what is good.
	for (const word of ["should", "best", "recommend"]) {
		assert.equal(asked.instructions.toLowerCase().includes(word), false, word);
	}
});
