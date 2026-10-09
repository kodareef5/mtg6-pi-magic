/**
 * The pilot lab rebuilds a logged decision as the game loop offered it: before
 * the seat's own later work at that decision, and without help the seat had
 * already used there.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { decisionFrame, position } from "../tools/benchmark-positions.ts";
import { aiSeat, criterion } from "../src/context/seat.ts";
import { startingIntent } from "../src/context/plan.ts";
import type { DecisionApi } from "../src/context/model.ts";
import { summary } from "../src/core/announce.ts";
import { check, InstructionSchema, type Instruction } from "../src/core/language.ts";

const expand = (name: string) => {
	const to = join(mkdtempSync(join(tmpdir(), "magic-lab-")), `${name}.jsonl`);
	writeFileSync(to, gunzipSync(readFileSync(`test/fixtures/benchmarks/${name}.jsonl.gz`)));
	return to;
};

test("a position can be rebuilt before the seat's own later work at that decision", () => {
	const journal = expand("k-preserve-elf-response");
	assert.ok(position(journal, 87, 0).table.work[0]!.request, "the prefix ends with the seat's request for a new plan");
	assert.equal(position(journal, 87, 0, 0).table.work[0]?.request, undefined, "keeping no work entries at the decision leaves the request out");
});

test("a seat rebuilt mid-decision does not offer help it already used", async () => {
	const { table, brief } = position(expand("kellan-reserve"), 82, 1);
	const frame = decisionFrame(table, 1);
	const criteria = async (helpedAt?: number) => {
		let seen: Record<string, string> = {};
		const api: DecisionApi = { named: "capture", ask: async (request) => { seen = (request.questions.pick as { criteria: Record<string, string> }).criteria; throw new Error("captured"); } };
		await aiSeat({ name: "Lab", api, intent: startingIntent(1), chronicle: { briefs: brief ? { 1: brief } : {}, recaps: [] }, onGap() {},
			plan: async () => { throw new Error("no planning here"); }, ...(helpedAt === undefined ? {} : { helpedAt }) }).answer(frame).catch(() => undefined);
		return seen;
	};
	assert.ok("ask:help" in await criteria(), "a seat with a planner offers help");
	assert.ok(!("ask:help" in await criteria(frame.version)), "help already used at this version is not offered again");
});

test("every criterion says what the option does, its facts, and what the plan says about it", () => {
	// Plain descriptions must keep accepted restrictions, including shapes whose prose is incomplete.
	const terms: Instruction[] = [
		{ do: "choose", who: "you", from: { zones: ["battlefield"], controller: "opponent", types: ["creature"], power: { atMost: 2 } }, count: 1, as: "small" },
		{ do: "draw", who: "you", count: 1, if: { amount: { life: "you" }, atLeast: 2, atMost: 5 } },
		{ do: "modify", what: "target:0", until: "end-of-turn", change: { types: { set: ["artifact"] }, loseAbilities: true } },
		{ do: "mana", who: "you", colors: ["R"], times: 2, spendOnly: { types: ["creature"] } },
		{ do: "move", what: "target:0", to: "library", reason: "resolve", position: "bottom" },
	];
	for (const term of terms) check(InstructionSchema, term, "description fixture");
	assert.match(summary(terms[0]!), /"controller":"opponent".*"power":\{"atMost":2\}/);
	assert.match(summary(terms[1]!), /your life is at least 2 and at most 5/);
	assert.match(summary(terms[2]!), /"types":\{"set":\["artifact"\]\},"loseAbilities":true/);
	for (const term of terms.slice(3)) assert.ok(summary(term).includes(JSON.stringify(term)), "unrendered instruction fields remain exact");
	assert.match(summary({ do: "choose", who: "you", from: { types: ["creature", "land"], controller: "opponent", owner: "you" }, count: { count: { types: ["creature"] } } }), /number of creature.*creature or land.*controlled by opponent; owned by you/);
	const uses = { "use:0": { notes: ["Plan step 2: Cast Zhao. Choices: pay with both Mountains."] } } as never;
	assert.equal(criterion({ id: "cast:1", label: "Cast Zhao (Zhao); mana payment: tap Mountain (1-25@2) for R", use: "use:0", notes: ["Uses Mountain, held: Shock on their turn."] } as never, { uses }),
		"Cast Zhao (Zhao); mana payment: tap Mountain (1-25@2) for R. Plan step 2: Cast Zhao. Choices: pay with both Mountains. Uses Mountain, held: Shock on their turn.");
	assert.equal(criterion({ id: "pass", label: "Pass", shows: "Take no response now. If every seat passes in succession, Shock begins resolving." } as never, { uses: {} }),
		"Pass. Take no response now. If every seat passes in succession, Shock begins resolving.", "passing is described by what it does, nothing more");
});

test("a seat states its trigger order one pair at a time, then puts each trigger on as its own decision", async () => {
	const journal = expand("trigger-hydra-order");
	const asked: { ids: string[]; criteria: Record<string, string>; instructions: string; state: Record<string, unknown> }[] = [];
	// A scripted pilot that resolves Hydra, then Ascension, then Harmonizer; at the puts it names its own choice.
	const plan = ["Mossborn Hydra", "Earthbender Ascension", "Mightform Harmonizer"];
	let put = "";
	const api: DecisionApi = { named: "scripted", ask: async (request) => {
		const question = request.questions.pick as { criteria: Record<string, string>; instructions: string };
		asked.push({ ids: Object.keys(question.criteria), ...question, state: request.state });
		const pair = Object.keys(question.criteria).filter((id) => id.startsWith("order:"));
		const rank = (id: string) => plan.findIndex((name) => question.criteria[id]!.startsWith(name));
		const choice = pair.length ? pair.sort((a, b) => rank(a) - rank(b))[0]! : put;
		return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } };
	} };
	const { table, brief } = position(journal, 263, 0);
	const seat = aiSeat({ name: "Lab", api, intent: startingIntent(0), chronicle: { briefs: brief ? { 0: brief } : {}, recaps: [] }, onGap() {},
		plan: async () => { throw new Error("no planning here"); } });

	put = "trigger:trigger-509-2";
	const first = await seat.answer(decisionFrame(table, 0));
	assert.deepEqual(asked.slice(0, 3).map((one) => one.ids), [
		["order:trigger-509-0", "order:trigger-509-1", "ask:help"],
		["order:trigger-509-0", "order:trigger-509-2", "ask:help"],
		["order:trigger-509-1", "order:trigger-509-2", "ask:help"]], "each pair of waiting triggers is one question, with help, before the put");
	assert.ok((asked[0]!.state.options as { id: string }[]).every((one) => one.id.startsWith("order:")), "an order question shows only the pair it orders");
	assert.equal(asked[0]!.criteria["order:trigger-509-0"]!.split(". Its trigger")[0],
		"Earthbender Ascension (0-5@5) resolves before Mightform Harmonizer (0-44@3), so Mightform Harmonizer (0-44@3) goes on the stack first", "a claim reads the same against resolution or placement wording");
	assert.match(asked[3]!.instructions, /Your stated order puts your waiting triggers on the stack in this order: Mightform Harmonizer \(0-44@3\) now, then Earthbender Ascension \(0-5@5\), then Mossborn Hydra \(0-48@3\)\./);
	const marked = asked[3]!.ids.filter((id) => asked[3]!.criteria[id]!.includes("Your stated order puts this trigger on the stack now"));
	assert.deepEqual(marked, ["trigger:trigger-509-1:t0=0-15@2", "trigger:trigger-509-1:t0=0-44@3", "trigger:trigger-509-1:t0=0-48@3"], "every target choice of the last trigger to resolve keeps the order");
	assert.deepEqual(first, { kind: "pick", option: "trigger:trigger-509-2", actionId: "Lab-4" }, "the put is the pilot's own pick, even one that breaks its stated order");

	// The logged game put Hydra on at 263. The stated order still covers what waits, so nothing is asked again.
	asked.length = 0;
	put = "trigger:trigger-509-1:t0=0-48@3";
	const second = await seat.answer(decisionFrame(position(journal, 264, 0).table, 0));
	assert.equal(asked.length, 1, "the next put is one question");
	assert.ok(asked[0]!.criteria["trigger:trigger-509-1:t0=0-48@3"]!.includes("Your stated order puts this trigger on the stack now"));
	assert.ok(!asked[0]!.criteria["trigger:trigger-509-0"]!.includes("Your stated order"));
	assert.equal(second.kind === "pick" && second.option, "trigger:trigger-509-1:t0=0-48@3");
});
