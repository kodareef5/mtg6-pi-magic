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
import { castAttackers } from "../src/core/budget.ts";
import { play } from "../src/core/loop.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { planReason } from "../src/core/planning.ts";
import type { Player } from "../src/core/player.ts";
import { changedPlan } from "../src/context/plan-edit.ts";
import { RequestTooLarge, type DecisionApi } from "../src/context/model.ts";
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
	assert.deepEqual(asked.slice(0, 6).map((one) => one.ids), [
		["order:trigger-509-0", "order:trigger-509-1", "ask:help"], ["order:trigger-509-1", "order:trigger-509-0", "ask:help"],
		["order:trigger-509-0", "order:trigger-509-2", "ask:help"], ["order:trigger-509-2", "order:trigger-509-0", "ask:help"],
		["order:trigger-509-1", "order:trigger-509-2", "ask:help"], ["order:trigger-509-2", "order:trigger-509-1", "ask:help"]],
		"each pair of waiting triggers is asked in both orientations, with help, before the put");
	assert.ok((asked[0]!.state.options as { id: string }[]).every((one) => one.id.startsWith("order:")), "an order question shows only the pair it orders");
	assert.equal(asked[0]!.criteria["order:trigger-509-0"]!.split(". Its trigger")[0],
		"Earthbender Ascension (0-5@5) resolves before Mightform Harmonizer (0-44@3), so Mightform Harmonizer (0-44@3) goes on the stack first", "a claim reads the same against resolution or placement wording");
	assert.match(asked[6]!.instructions, /Your stated order puts your waiting triggers on the stack in this order: Mightform Harmonizer \(0-44@3\) now, then Earthbender Ascension \(0-5@5\), then Mossborn Hydra \(0-48@3\)\./);
	const marked = asked[6]!.ids.filter((id) => asked[6]!.criteria[id]!.includes("Your stated order puts this trigger on the stack now"));
	assert.deepEqual(marked, ["trigger:trigger-509-1:t0=0-15@2", "trigger:trigger-509-1:t0=0-44@3", "trigger:trigger-509-1:t0=0-48@3"], "every target choice of the last trigger to resolve keeps the order");
	assert.deepEqual(first, { kind: "pick", option: "trigger:trigger-509-2", actionId: "Lab-7" }, "the put is the pilot's own pick, even one that breaks its stated order");

	// The logged game put Hydra on at 263. The next put asks again about what still waits, so it is read from its own position.
	asked.length = 0;
	put = "trigger:trigger-509-1:t0=0-48@3";
	const second = await seat.answer(decisionFrame(position(journal, 264, 0).table, 0));
	assert.deepEqual(asked.map((one) => one.ids), [["order:trigger-509-0", "order:trigger-509-1", "ask:help"], ["order:trigger-509-1", "order:trigger-509-0", "ask:help"], asked[2]!.ids],
		"one remaining pair both ways, then the put");
	assert.ok(asked[2]!.criteria["trigger:trigger-509-1:t0=0-48@3"]!.includes("Your stated order puts this trigger on the stack now"));
	assert.ok(!asked[2]!.criteria["trigger:trigger-509-0"]!.includes("Your stated order"));
	assert.equal(second.kind === "pick" && second.option, "trigger:trigger-509-1:t0=0-48@3");
});

test("contradictory pair answers state no order", async () => {
	const { table, brief } = position(expand("trigger-hydra-order"), 263, 0);
	// Ascension before Harmonizer, Harmonizer before Hydra, Hydra before Ascension.
	const beats: Record<string, string> = { "order:trigger-509-0|order:trigger-509-1": "order:trigger-509-0", "order:trigger-509-1|order:trigger-509-2": "order:trigger-509-1",
		"order:trigger-509-0|order:trigger-509-2": "order:trigger-509-2" };
	let put: { instructions: string; criteria: Record<string, string> } | undefined;
	const api: DecisionApi = { named: "cyclic", ask: async (request) => {
		const question = request.questions.pick as { criteria: Record<string, string>; instructions: string };
		const pair = Object.keys(question.criteria).filter((id) => id.startsWith("order:"));
		const choice = pair.length ? beats[[...pair].sort().join("|")]! : (put = question, "trigger:trigger-509-0");
		return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } };
	} };
	await aiSeat({ name: "Lab", api, intent: startingIntent(0), chronicle: { briefs: brief ? { 0: brief } : {}, recaps: [] }, onGap() {},
		plan: async () => { throw new Error("no planning here"); } }).answer(decisionFrame(table, 0));
	assert.ok(put && !put.instructions.includes("stated order") && Object.values(put.criteria).every((text) => !text.includes("stated order")), "a cycle is not presented as intent");
});

test("pair answers that follow the listed position state no order", async () => {
	const { table, brief } = position(expand("trigger-hydra-order"), 263, 0);
	let put: { instructions: string } | undefined;
	// A pilot that always takes the first trigger listed answers each pair differently in its two orientations.
	const api: DecisionApi = { named: "positional", ask: async (request) => {
		const question = request.questions.pick as { criteria: Record<string, string>; instructions: string };
		const pair = Object.keys(question.criteria).filter((id) => id.startsWith("order:"));
		const choice = pair.length ? pair[0]! : (put = question, "trigger:trigger-509-0");
		return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } };
	} };
	await aiSeat({ name: "Lab", api, intent: startingIntent(0), chronicle: { briefs: brief ? { 0: brief } : {}, recaps: [] }, onGap() {},
		plan: async () => { throw new Error("no planning here"); } }).answer(decisionFrame(table, 0));
	assert.ok(put && !put.instructions.includes("stated order"));
});

test("a decision too long for the pilot is asked again in smaller inspection steps, with nothing cut", async () => {
	// The stopped game: a 212-power trampler, one blocker, Red at 2 life. Its 211 splits overran the classifier's window.
	const journal = expand("n-trample-assignment");
	const { table, brief } = position(journal, 480, 0);
	const sent: string[][] = [];
	const api: DecisionApi = { named: "windowed", ask: async (request) => {
		const ids = Object.keys((request.questions.pick as { criteria: Record<string, string> }).criteria);
		sent.push(ids);
		if (ids.length > 100) throw new RequestTooLarge("windowed classifier: HTTP 400: max_tokens_exceeded");
		const choice = ids.find((id) => id.startsWith("inspect:component")) ?? (ids.includes("assign:0-15:2-210") ? "assign:0-15:2-210" : ids[0]!);
		return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } };
	} };
	const gaps: string[] = [];
	const answer = await aiSeat({ name: "Lab", api, intent: startingIntent(0), chronicle: { briefs: brief ? { 0: brief } : {}, recaps: [] }, onGap(gap) { gaps.push(gap); },
		plan: async () => { throw new Error("no planning here"); } }).answer(decisionFrame(table, 0));
	assert.ok(sent[0]!.length > 200, "the whole list is asked first");
	assert.ok(sent.slice(1).every((ids) => ids.length <= 100), "after the refusal every question fits");
	assert.ok(sent.slice(1, -1).every((ids) => ids.some((id) => id.startsWith("inspect:component"))), "the narrowing steps choose ranges and act on nothing");
	assert.deepEqual(answer, { kind: "pick", option: "assign:0-15:2-210", actionId: `Lab-${sent.length}` });
	assert.deepEqual(gaps, []);
});

test("a plan's trigger order marks the trigger that goes on now, and the pilot is asked no order questions", async () => {
	const journal = expand("trigger-hydra-order");
	const { table, brief } = position(journal, 263, 0);
	const plan = { ...structuredClone(table.work[0]!.plan!), triggers: [{ resolve: [{ card: "Mossborn Hydra" }, { card: "Earthbender Ascension" }, { card: "Mightform Harmonizer" }],
		purpose: "Harmonizer targets Mossborn Hydra (0-48@3)." }] };
	const marked = (frame: ReturnType<typeof decisionFrame>) => frame.decision!.options.filter((one) => one.notes?.some((note) => note.startsWith("Your plan's trigger order puts this trigger on the stack now"))).map((one) => one.id);
	const frame = decisionFrame(table, 0, { plan });
	assert.deepEqual(marked(frame), ["trigger:trigger-509-1:t0=0-15@2", "trigger:trigger-509-1:t0=0-44@3", "trigger:trigger-509-1:t0=0-48@3"], "the last to resolve goes on first, with every target choice");
	assert.match(frame.decision!.options.find((one) => one.id === "trigger:trigger-509-1:t0=0-48@3")!.notes!.at(-1)!, /Mightform Harmonizer \(0-44@3\) now, then Earthbender Ascension \(0-5@5\), then Mossborn Hydra \(0-48@3\)\. Choices: Harmonizer targets Mossborn Hydra/);
	// With Hydra already on the stack, Harmonizer still goes on before Ascension.
	assert.deepEqual(marked(decisionFrame(position(journal, 264, 0).table, 0, { plan })), ["trigger:trigger-509-1:t0=0-15@2", "trigger:trigger-509-1:t0=0-44@3", "trigger:trigger-509-1:t0=0-48@3"]);
	const asked: { ids: string[]; instructions: string }[] = [];
	const api: DecisionApi = { named: "scripted", ask: async (request) => {
		const question = request.questions.pick as { criteria: Record<string, string>; instructions: string };
		asked.push({ ids: Object.keys(question.criteria), instructions: question.instructions });
		return { pick: { type: "choice", choice: "trigger:trigger-509-1:t0=0-48@3", probabilities: { "trigger:trigger-509-1:t0=0-48@3": 1 }, confidence: 1 } };
	} };
	const answer = await aiSeat({ name: "Lab", api, intent: startingIntent(0), chronicle: { briefs: brief ? { 0: brief } : {}, recaps: [] }, onGap() {},
		plan: async () => { throw new Error("no planning here"); } }).answer(frame);
	assert.equal(asked.length, 1, "the plan gives the order, so only the put is asked");
	assert.match(asked[0]!.instructions, /Your plan's trigger order puts your waiting triggers on the stack in this order: Mightform Harmonizer \(0-44@3\) now/);
	assert.equal(answer.kind === "pick" && answer.option, "trigger:trigger-509-1:t0=0-48@3");
});

test("the writer's trigger order is accepted, read in its own words, and replaces the old one", () => {
	const base = { objective: "Grow Hydra.", guidance: "Landfall.", steps: [], triggers: [{ resolve: [{ card: "Earthbender Ascension" }, { card: "Mossborn Hydra" }] }] };
	const plan = changedPlan(base, { triggers: [{ when: { active: "self", step: "any" }, resolve: [{ card: "Mossborn Hydra", controller: "you" }, { card: "Mightform Harmonizer" }], purpose: "Harmonizer targets Hydra." }] }, {});
	assert.deepEqual(plan.triggers, [{ when: { active: "self" }, resolve: [{ card: "Mossborn Hydra", controller: "self" }, { card: "Mightform Harmonizer" }], purpose: "Harmonizer targets Hydra." }]);
	assert.throws(() => changedPlan(base, { triggers: [{ resolve: [{ card: "Mossborn Hydra" }] }] }, {}), /schema/, "an order names at least two sources");
});

test("a trigger order's named target narrows the mark to the option aiming at it", async () => {
	// Two Sazh's Chocobos; the plan's Harmonizer doubles the one it names.
	const journal = expand("trigger-m-0-402-0");
	const { table } = position(journal, 209, 0);
	const plan = { ...structuredClone(table.work[0]!.plan!), triggers: [{ resolve: [{ card: "Sazh's Chocobo" }, { card: "Mightform Harmonizer" }],
		targets: [{ source: { card: "Mightform Harmonizer" }, target: { refs: [{ id: "0-53", incarnation: 3 }] } }] }] };
	const marked = decisionFrame(table, 0, { plan }).decision!.options.filter((one) => one.notes?.some((note) => note.startsWith("Your plan's trigger order"))).map((one) => one.id);
	assert.deepEqual(marked, ["trigger:trigger-402-0:t0=0-53@3"]);
	const toPlayer = { ...plan, triggers: [{ ...plan.triggers[0]!, targets: [{ source: { card: "Mightform Harmonizer" }, target: "opponent" as const }] }] };
	assert.deepEqual(decisionFrame(table, 0, { plan: toPlayer }).decision!.options.filter((one) => one.notes?.some((note) => note.startsWith("Your plan's trigger order"))), [],
		"a target no option can take marks nothing rather than a wrong option");
	const asked: string[] = [];
	await aiSeat({ name: "Lab", api: { named: "scripted", ask: async (request) => {
		asked.push((request.questions.pick as { instructions: string }).instructions);
		return { pick: { type: "choice", choice: "ask:help", probabilities: { "ask:help": 1 }, confidence: 1 } };
	} }, intent: startingIntent(0), chronicle: { briefs: {}, recaps: [] }, onGap() {}, plan: async () => { throw new Error("no planning here"); } }).answer(decisionFrame(table, 0, { plan: toPlayer }));
	assert.match(asked[0]!, /in this order: Mightform Harmonizer \(0-43@3\) aiming at the opponent now, then Sazh's Chocobo \(0-53@3\), then Sazh's Chocobo \(0-56@3\)\. No listed option puts Mightform Harmonizer \(0-43@3\) on aiming at the opponent\./);
});

test("a named trigger target marks the aiming option when that trigger waits alone", () => {
	// Hydra is already on the stack at 264; the plan aims Harmonizer at Hydra but gives no order for Ascension and Harmonizer.
	const journal = expand("trigger-hydra-order");
	const { table } = position(journal, 264, 0);
	const plan = { ...structuredClone(table.work[0]!.plan!), triggers: [{ resolve: [{ card: "Mossborn Hydra" }, { card: "Mightform Harmonizer" }],
		targets: [{ source: { card: "Mightform Harmonizer" }, target: { card: "Mossborn Hydra" } }] }] };
	const notes = Object.fromEntries(decisionFrame(table, 0, { plan }).decision!.options.map((one) => [one.id, one.notes ?? []]));
	assert.deepEqual(Object.entries(notes).filter(([, list]) => list.some((note) => note.startsWith("Aims where your plan"))).map(([id]) => id), ["trigger:trigger-509-1:t0=0-48@3"]);
	assert.ok(!Object.values(notes).flat().some((note) => note.startsWith("Your plan's trigger order")), "one listed source waiting is no order");
});

test("a target rule leaves a trigger that chooses no target in the order", () => {
	// Ascension's landfall trigger targets nothing; its payoff targets later. Naming the payoff's target must not unmark it.
	const journal = expand("trigger-hydra-order");
	const { table } = position(journal, 264, 0);
	const plan = { ...structuredClone(table.work[0]!.plan!), triggers: [{ resolve: [{ card: "Earthbender Ascension" }, { card: "Mightform Harmonizer" }],
		targets: [{ source: { card: "Earthbender Ascension" }, target: { card: "Mossborn Hydra" } }, { source: { card: "Mightform Harmonizer" }, target: { card: "Mossborn Hydra" } }] }] };
	const marks = Object.fromEntries(decisionFrame(table, 0, { plan }).decision!.options.map((one) => [one.id, (one.notes ?? []).find((note) => note.startsWith("Your plan's trigger order"))]));
	assert.deepEqual(Object.keys(marks).filter((id) => marks[id]), ["trigger:trigger-509-1:t0=0-48@3"]);
	assert.match(marks["trigger:trigger-509-1:t0=0-48@3"]!, /Mightform Harmonizer \(0-44@3\) aiming at Mossborn Hydra \(0-48@3\) now, then Earthbender Ascension \(0-5@5\)\./);
	const flipped = { ...plan, triggers: [{ ...plan.triggers[0]!, resolve: [{ card: "Mightform Harmonizer" }, { card: "Earthbender Ascension" }] }] };
	assert.deepEqual(decisionFrame(table, 0, { plan: flipped }).decision!.options.filter((one) => one.notes?.some((note) => note.startsWith("Your plan's trigger order"))).map((one) => one.id), ["trigger:trigger-509-0"]);
});

test("a seat that keeps returning to the same position is told, then strategy is asked, then play stops", async () => {
	// The October 9 n game: one Harmonizer left, the plan double-blocks menace Zhao, and the pilot added and withdrew the same block 9,000 times.
	const { table } = position(expand("n-block-loop"), 489, 0);
	const repeats: number[] = [];
	let requests = 0, picks = 0;
	const toggling: Player = { name: "toggling", observe() {}, close: async () => {}, async answer(frame) {
		if (planReason(frame)) { requests += 1; return { kind: "work", tools: [{ do: "plan.keep", reason: "scripted" }], revision: frame.view.work?.revision ?? 0, actionId: `keep-${frame.version}` }; }
		picks += 1;
		if (frame.repeated) repeats.push(frame.repeated);
		const option = frame.decision!.options.some((one) => one.id === "unblock:0-44:1-58") ? "unblock:0-44:1-58" : "block:0-44:1-58";
		return { kind: "pick", option, actionId: `toggle-${frame.version}` };
	} };
	const idle: Player = { name: "idle", observe() {}, close: async () => {}, async answer() { throw new Error("the other seat is not asked during this declaration"); } };
	assert.equal(await play(table, { 0: toggling, 1: idle }, { 0: startingIntent(0), 1: startingIntent(1) }), null, "play stops instead of running on");
	assert.ok(repeats.includes(2), "the seat is told it is back at the same position");
	assert.equal(requests, 2, "strategy is asked, up to the turn's requests");
	assert.ok(picks < 20, `bounded: ${picks} picks`);
	assert.match(table.gaps.at(-1)!, /^Seat 0: Loop: this seat has met the same decision in the same position \d+ times this step \(Declare blockers/);
});

test("an option for a step whose window has not come says so, and an action says what it resolves before", () => {
	// Burst is scheduled for precombat main; the decision is in the draw step.
	const future = decisionFrame(position(expand("p-future-step"), 359, 1).table, 1);
	const burst = future.decision!.options.filter((one) => one.id.startsWith("cast:38:0:"));
	assert.ok(burst.length && burst.every((one) => one.notes?.some((note) => /^Carries out plan step 1, Burst Lightning for lethal, which is scheduled for your precombat main; it is not due now\.$/.test(note))));
	// A second Harmonizer is on the stack; Passage's activation would resolve first.
	const stacked = decisionFrame(position(expand("n-passage-above-harmonizer"), 361, 0).table, 0);
	assert.match(stacked.decision!.options.find((one) => one.id.startsWith("use:2:"))!.shows!, /It goes on the stack above your Mightform Harmonizer and resolves before it\./);
	assert.ok(!stacked.decision!.options.find((one) => one.id === "pass")!.shows!.includes("It goes on the stack"), "passing puts nothing on the stack");
});

test("the objection option quotes the declaration's blocking conflicts", async () => {
	const { table, brief } = position(expand("menace-objection"), 286, 1);
	let criteria: Record<string, string> = {};
	await aiSeat({ name: "Lab", judge: true, api: { named: "capture", ask: async (request) => { criteria = (request.questions.pick as { criteria: Record<string, string> }).criteria; throw new Error("captured"); } },
		intent: startingIntent(1), chronicle: { briefs: brief ? { 1: brief } : {}, recaps: [] }, onGap() {}, plan: async () => { throw new Error("no planning here"); } })
		.answer(decisionFrame(table, 1)).catch(() => undefined);
	const objection = Object.entries(criteria).find(([id]) => id.startsWith("object:"));
	assert.ok(objection, "an objection is offered");
	assert.match(objection![1], /The declaration shows: .*menace/);
});

test("the writer is told when an attack step names a creature an earlier step casts this turn", () => {
	// Game k turn 9: the October 9 plan cast Harmonizer from exile and attacked with it.
	const frame = workFrame(position(expand("k-missed-lethal"), 236, 0).table, 0);
	const harmonizer = { source: { card: "Mightform Harmonizer", zones: ["exile"] }, claim: "Cast Mightform Harmonizer", basis: "Warp", timing: "spell", instructions: [] };
	const plan = { objective: "", guidance: "", steps: [
		{ label: "Cast Harmonizer", when: { active: "self", step: "precombat-main" }, action: { procedure: harmonizer } },
		{ label: "Attack with Harmonizer", when: { active: "self", step: "declare-attackers" }, action: { prefix: "attack:", objects: { card: "Mightform Harmonizer" } } },
		{ label: "Attack with Explorer", when: { active: "self", step: "declare-attackers" }, action: { prefix: "attack:", objects: { card: "Icetill Explorer" } } },
	] } as never;
	assert.deepEqual(castAttackers(frame, plan), ["steps[1] (Attack with Harmonizer) attacks with Mightform Harmonizer, which steps[0] casts this turn. A creature cast this turn can attack only with haste."]);
});
