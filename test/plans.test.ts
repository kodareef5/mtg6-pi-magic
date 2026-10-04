/**
 * Planned. A seat's plan is accepted whole and atomically; the table flies it:
 * it takes a step only one listed option fits, passes when the plan is silent,
 * raises a stop the plan named, and records each step on the ledger row that
 * carried it out, so replay and clones read progress without equipment edits.
 * The pilot sees the plan's marks on its options; nothing is removed.
 * Past 150 lines because each invariant plays a real position.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { play } from "../src/core/loop.ts";
import { fork, open, replay, save, type Header } from "../src/core/journal.ts";
import { annotate, planState } from "../src/core/planning.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { editWork, planProblems, prepareWork, workFrame } from "../src/core/work-tools.ts";
import type { Answer, Player } from "../src/core/player.ts";
import { lifted, type Plan } from "../src/core/language.ts";
import type { Frame } from "../src/core/types.ts";
import { load as loadCards } from "../src/core/cards.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { seat as seatTable, run } from "../src/context/sit.ts";
import { CEILING, tally } from "../src/context/spend.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { planWork, prepareTurn, reviewPlan, syntaxReference } from "../src/context/strategy.ts";
import { aiSeat, question } from "../src/context/seat.ts";
import { asState } from "../src/context/model.ts";
import { announce, establish, example, main, matchup, pack, place, quiet } from "./play.ts";

const physical = (table: Table) => { const { work: _work, workLog: _history, ...state } = structuredClone(table); return state; };
const turn3 = { active: "self" as const, fromTurn: 3, throughTurn: 3 };
/** Green's third turn: a land, Fabled Passage, an attack with the Chocobo. */
const line: Plan = { objective: "Grow the Chocobo with two land drops and attack.", guidance: "Land first, then the Passage, so the Chocobo sees both.",
	steps: [
		{ label: "Play a Forest", when: { ...turn3, step: "precombat-main" }, action: { prefix: "land:", objects: { zones: ["hand"], card: "Forest" } } },
		{ label: "Crack Fabled Passage", when: { ...turn3, step: "precombat-main" }, action: { procedure: example("Crack Fabled Passage for a basic land") } },
		{ label: "Attack with the Chocobo", when: { ...turn3, step: "declare-attackers" }, action: { prefix: "attack:", objects: { card: "Sazh's Chocobo" } } },
		{ label: "Finish attacking", when: { ...turn3, step: "declare-attackers" }, action: { option: "attack:done" } },
	], packages: [{ card: "Sazh's Chocobo", registers: [{ basis: "Landfall — Whenever a land you control enters, put a +1/+1 counter on this creature.", kind: "watch",
		event: { on: "enters", of: { types: ["land"], controller: "you" } }, effect: { instructions: [{ do: "counters", on: "this", kind: "+1/+1", amount: 1 }] } }] }],
};
/** Green with the Chocobo, Fabled Passage and two Forests in play, a Forest in hand. Physical setup only. */
function position() {
	const table = matchup("plans");
	establish(table, 0, "Sazh's Chocobo", line.packages![0]!.registers);
	establish(table, 0, "Fabled Passage", []);
	place(table, 0, "battlefield", "Forest", "Forest");
	place(table, 0, "hand", "Forest");
	return table;
}
/** A seat that answers the few things only it can: its hand, and its searches. It records every ask. */
function pilot(asked: Frame[]): Player {
	return { name: "Green", observe() {}, close() {}, async answer(frame): Promise<Answer> {
		asked.push(frame);
		const options = frame.decision!.options;
		const pick = frame.decision!.situation === "pregame" ? options.find((option) => option.id === "keep")
			: options.find((option) => /Choose Forest/.test(option.label)) ?? quiet(options);
		return { kind: "pick", option: pick!.id, actionId: `green-${asked.length}` };
	} };
}
const opponent: Player = { name: "Red", observe() {}, close() {}, async answer(frame) {
	const options = frame.decision!.options;
	return { kind: "pick", option: (options.find((option) => option.id === "keep") ?? quiet(options)).id, actionId: `red-${frame.version}` };
} };
const stopAfter = (table: Table, turn: number) => () => { if (table.cursor.turn > turn) throw stop; };
const stop = new Error("stop");
async function playUntil(table: Table, players: Record<number, Player>, turn: number) {
	try { await play(table, players, { 0: startingIntent(0), 1: startingIntent(1) }, stopAfter(table, turn)); } catch (error) { if (error !== stop) throw error; }
}

test("a plan is accepted whole and atomically, and every problem with it is named at once", () => {
	const table = position();
	main(table, 0);
	const before = physical(table);
	assert.equal(editWork(table, 0, [{ do: "plan.put", plan: line }], "plan"), true);
	assert.deepEqual(physical(table), before, "accepting a plan moves nothing");
	assert.equal(editWork(table, 0, [{ do: "plan.put", plan: line }], "plan"), false, "a redelivery does not edit twice");
	assert.throws(() => editWork(table, 0, [{ do: "plan.request", reason: "different" }], "plan"), /different seat tools/);
	assert.deepEqual(table.work[0]!.packages!.map((one) => one.card), ["Sazh's Chocobo"], "the plan's packages join the seat's");
	const accepted = structuredClone(table);
	const broken: Plan = { ...line, steps: [
		{ label: "Untap", when: { step: "untap" }, action: { option: "pass" } },
		{ label: "Nothing named", when: {}, action: {} },
		{ label: "A land play with a cost", when: {}, action: { procedure: { source: { zones: ["hand"], card: "Forest" }, claim: "Land", basis: "Forest", timing: "land", cost: { tap: true }, instructions: [] } } },
	], packages: [{ card: "Lightning Bolt", registers: [] }] };
	assert.throws(() => editWork(table, 0, [{ do: "plan.put", plan: broken }], "broken"),
		(error: Error) => /4 problems/.test(error.message) && /untap has no priority/.test(error.message) && /name an option id/.test(error.message) && /Lightning Bolt/.test(error.message));
	assert.deepEqual(table, accepted, "a refused plan changes nothing");
	assert.throws(() => editWork(table, 0, [{ do: "plan.put", plan: line }], "stale", 0), /equipment changed/);
});

test("the table flies the plan: one fitting option is taken, silence passes, and progress lives on the ledger", async () => {
	const table = position();
	editWork(table, 0, [{ do: "plan.put", plan: line }], "plan");
	const asked: Frame[] = [];
	await playUntil(table, { 0: pilot(asked), 1: opponent }, 5);
	const carried = table.ledger.filter((row) => row.seat === 0 && row.execution);
	assert.deepEqual(carried.map((row) => row.execution!.step), [0, 1, 2, 3], "every step, in order");
	assert.ok(carried.every((row) => row.by === "engine"), "each step had one fitting option, so the table took it without asking");
	assert.ok(carried.slice(0, 3).every((row) => row.why === "delegated"), "the plan settled those; the last was the only option left");
	assert.deepEqual(workFrame(table, 0).view.done, [0, 1, 2, 3]);
	const kinds = new Set(asked.map((frame) => frame.decision!.options.some((option) => option.id.startsWith("discard:")) ? "discard" : frame.decision!.situation));
	assert.deepEqual([...kinds].sort(), ["discard", "pregame", "resolution"], "the seat chose only its hand, its search and its discard: every silent window passed without it");
	assert.ok(table.ledger.some((row) => row.seat === 0 && row.picked === "attack:done" && table.cursor.turn > 5 && row.why === "delegated"),
		"on a later turn the plan is silent in combat, so the table attacks with nothing");
	assert.equal(cardsIn(table, "battlefield", 0).find((one) => one.card === "Sazh's Chocobo")!.counters["+1/+1"], 2, "both land entries triggered");

	// Replay rebuilds progress from the rows; a clone continues from where it stood.
	const directory = mkdtempSync(join(tmpdir(), "magic-plans-"));
	const header: Header = { id: "plans", format: standard.name, seed: table.rng.seed, seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })),
		cards: { path: "cards/standard.tsv", generated: "fixture" }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
	const journal = open(join(directory, "parent.jsonl"), header);
	save(journal, table);
	const restored = replay(journal.path, () => position()).table;
	assert.deepEqual(restored.ledger, table.ledger);
	assert.deepEqual(restored.work, table.work);
	assert.deepEqual(workFrame(restored, 0).view.done, [0, 1, 2, 3]);
	const after = carried[1]!.seq + 1;
	const childPath = join(directory, "child.jsonl");
	fork(journal.path, after, "child", childPath);
	assert.deepEqual(workFrame(replay(childPath, () => position()).table, 0).view.done, [0, 1], "a clone holds exactly the progress of its prefix");
});

test("a stop asks for a new plan once, a stop that already holds waits for a change, and help past the turn's budget is refused", async () => {
	const table = position();
	const lands = (atLeast: number) => ({ amount: { count: { types: ["land" as const], controller: "you" } }, atLeast });
	// A stop that already holds waits until it has been false: it names a change, not a state.
	const already: Plan = { objective: "Hold.", guidance: "Pass.", steps: [], askWhen: [{ label: "three lands", if: lands(3) }] };
	editWork(table, 0, [{ do: "plan.put", plan: already }], "already");
	assert.deepEqual(table.work[0]!.unarmed, ["three lands"]);
	const growing: Plan = { objective: "Play the Forest.", guidance: "Then reconsider.", askWhen: [{ label: "four lands", if: lands(4) }],
		steps: [{ label: "Play a Forest", when: { ...turn3, step: "precombat-main" }, action: { prefix: "land:", objects: { zones: ["hand"], card: "Forest" } } }] };
	// A standing branch keeps the pilot consulted, so it can ask for help.
	const quiet_: Plan = { objective: "Hold.", guidance: "Pass.", steps: [], may: [{ label: "Consider passing", when: { active: "self" }, action: { option: "pass" } }] };
	editWork(table, 0, [{ do: "plan.put", plan: growing }], "plan");
	main(table, 0, 3);
	const requests: string[] = [];
	let refusal = "";
	const planner: Player = { name: "Green", observe() {}, close() {}, async answer(frame): Promise<Answer> {
		const work = frame.view.work!;
		if (work.request) { requests.push(work.request); return { kind: "work", tools: [{ do: "plan.put", plan: quiet_ }], revision: work.revision, actionId: `plan-${requests.length}` }; }
		if (frame.refused?.length) { refusal ||= frame.refused[0]!; return { kind: "pick", option: quiet(frame.decision!.options).id, actionId: `pick-${frame.version}` }; }
		return { kind: "work", tools: [{ do: "plan.request", reason: "The pilot asked for help." }], revision: work.revision, actionId: `help-${frame.version}-${work.revision}` };
	} };
	await playUntil(table, { 0: planner, 1: opponent }, 3);
	assert.deepEqual(requests.slice(0, 2), ["Stop: four lands", "The pilot asked for help."], "the stop once its land arrives, then the pilot's request");
	assert.match(refusal, /requests for a new plan are spent/, "a third request in the turn is refused");
});

test("a branch and a held resource are marked on the options they touch, and nothing is removed", () => {
	const table = matchup("branches");
	const chocobo = establish(table, 0, "Sazh's Chocobo", []);
	place(table, 0, "battlefield", "Forest");
	place(table, 0, "hand", "Snakeskin Veil");
	place(table, 1, "battlefield", "Mountain");
	place(table, 1, "hand", "Shock");
	main(table, 1, 2);
	announce(table, example("Cast Shock"), (option) => option.activation.targets[0]!.some((one) => "id" in one && one.id === chocobo.id));
	apply(table, "pass", "model", "chosen");
	const decision = nextDecision(table)!;
	assert.equal(decision.seat, 0);
	const frame = workFrame(table, 0);
	frame.view.work = prepareWork(frame, [{ do: "plan.put", plan: { objective: "Keep the Chocobo.", guidance: "Veil it if it is targeted.", steps: [],
		may: [{ label: "Veil a targeted creature", when: { active: "opponent" }, if: { amount: { count: { zones: ["stack"], controller: "opponent", targeting: { types: ["creature"], controller: "you" } } }, atLeast: 1 },
			action: { procedure: example("Cast Snakeskin Veil") } }],
		holds: [{ objects: { zones: ["battlefield"], controller: "self", card: "Forest" }, purpose: "green for Veil" }] } }]);
	const state = planState(frame)!;
	assert.deepEqual(state.branches.map((one) => one.label), ["Veil a targeted creature"]);
	const marked = annotate(frame.decision!.options, state);
	assert.ok(marked.some((option) => option.id === "pass" && !option.shows), "pass stays, unmarked");
	const veil = marked.filter((option) => option.id.startsWith(`plan:${frame.view.work!.planned}:b0:`));
	assert.ok(veil.length > 0 && veil.every((option) => /Plan branch: Veil a targeted creature/.test(option.shows!)));
	assert.ok(veil.some((option) => /Uses Forest, held: green for Veil/.test(option.shows!)), "spending the held Forest is marked, not refused");
	assert.equal(marked.length, frame.decision!.options.length + state.procedures.length);
});

test("the writer's check names every problem at once, and a corrected plan is accepted", async () => {
	const table = position();
	main(table, 0);
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }], "request");
	const frame = workFrame(table, 0);
	const broken = { ...line, steps: [{ label: "Attack in the end step", when: { step: "end" }, action: { prefix: "attack:" } }, { label: "Nothing", when: {}, action: {} }],
		packages: [{ card: "Hired Claw", registers: [{ basis: "{1}{R}: Put a +1/+1 counter on this creature.", kind: "watch", event: { on: "step", step: "end" },
			effect: { instructions: [{ do: "counters", on: "this", kind: "+1/+1", amount: 1 }] } }] }] };
	const replies = [{ plan: broken }, { plan: line }];
	const seen: string[] = [];
	const stream: Stream = (_model, context) => {
		seen.push(JSON.stringify(context.messages));
		const args = replies.shift()!;
		return { result: async () => ({ content: [{ type: "toolCall", id: `call-${seen.length}`, name: "submit", arguments: args }], stopReason: "toolUse" }) };
	};
	const writer = reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 });
	const { tools } = await planWork(frame, {}, writer);
	assert.deepEqual(tools, [{ do: "plan.put", plan: line }]);
	assert.match(seen[1]!, /\d problems: steps\[0\] \(Attack in the end step\): attack: options are listed only in declare-attackers.*steps\[1\] \(Nothing\): name an option id.*Hired Claw.*is an activated ability/, "every problem in one refusal");
	assert.match(seen[0]!, /YOUR TASK: Plan the turn\./);
});

test("the writer's habits with one meaning are read as meant: an untap step, an action inside its if, bounds inside an amount, fields beside the plan", async () => {
	const table = position();
	main(table, 0);
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }], "request");
	const habits = { objective: "o", guidance: "g", steps: [{ label: "Untap", when: { step: "untap" }, action: { option: "pass" } }, line.steps[0]],
		may: [{ label: "Pass while they hold three cards", when: {}, if: { amount: { count: { zones: ["hand"], controller: "opponent" }, atLeast: 3 }, action: { option: "pass" } } }] };
	// The plan closed too early: its branches written beside it.
	const { may, ...early } = habits;
	const stream: Stream = () => ({ result: async () => ({ content: [{ type: "toolCall", id: "c", name: "submit", arguments: { plan: structuredClone(early), may: structuredClone(may) } }], stopReason: "toolUse" }) });
	const { tools: [put] } = await planWork(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.ok(put?.do === "plan.put");
	assert.deepEqual(put.plan.steps.map((step) => step.label), ["Play a Forest"], "the table untaps for the seat");
	assert.deepEqual(put.plan.may![0], { label: "Pass while they hold three cards", when: {}, action: { option: "pass" },
		if: { amount: { count: { zones: ["hand"], controller: "opponent" } }, atLeast: 3 } });
});

test("strategy plans before a seat first acts and at each of its turns after the draw, with one cached prompt", async () => {
	const universe = loadCards("cards/standard.tsv");
	const model = { type: "classifier", id: "jev-latest", provider: "typesafe", api: "typesafe-system-one" } as never;
	const chat = { id: "fixture", provider: "offline", type: "chat" } as never;
	const roster = async () => [
		{ role: "decide" as const, pattern: "fixture", model },
		{ role: "pregame" as const, pattern: "off", off: true },
		{ role: "strategy" as const, pattern: "fixture", model: chat },
	];
	const prompts: { user: string; system?: string; ceiling?: number }[] = [];
	const inference = {
		classify: (async (_model: unknown, request: { questions: Record<string, { criteria: Record<string, string> }> }) => ({
			api: "typesafe-system-one", provider: "typesafe", model: "jev-latest", stopReason: "stop", timestamp: 0,
			answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
				const ids = Object.keys(question.criteria);
				const choice = ids.find((id) => id === "keep") ?? ids.find((id) => id.startsWith("land:")) ?? ids.find((id) => id !== "ask:help")!;
				return [key, { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 }];
			})),
		})) as never,
		stream: ((_model: unknown, context: { systemPrompt?: string; messages: { content: string }[] }, options: { maxTokens?: number }) => {
			prompts.push({ user: context.messages[0]!.content, system: context.systemPrompt, ceiling: options.maxTokens });
			return { result: async () => ({ content: [{ type: "toolCall", id: "call", name: "submit", arguments: { plan: { objective: "Develop.", guidance: "Play lands.",
				steps: [{ label: "Pass the turn", when: { active: "self" }, action: { option: "pass" } }] } } }], stopReason: "toolUse" }) };
		}) as never,
	};
	const table = start(standard, [{ name: "A", deck: deck("Green Stompy") }, { name: "B", deck: deck("Dimir Control") }], "work");
	const seated = await seatTable(table, roster, inference, universe, { format: standard.name });
	assert.equal(prompts.length, 0, "seating spends no strategy before a decision");
	assert.ok(await run(table, seated, inference, undefined));
	assert.equal(table.gaps.length, 0);
	const sessions = prompts.map((prompt) => JSON.parse(prompt.user) as { seat: number; view: { window: { kind: string; turn: number; active: number; step: string } } });
	for (const seat of [0, 1]) {
		const own = sessions.filter((session) => session.seat === seat && session.view.window.kind === "turn" && session.view.window.active === seat);
		assert.deepEqual(own.map((session) => session.view.window.turn), [...new Set(own.map((session) => session.view.window.turn))], "at most one plan per own turn");
		assert.ok(own.every((session) => session.view.window.step !== "upkeep" || session.view.window.turn === 1), "a turn's plan waits for the draw; the first turn has none");
	}
	assert.equal(sessions.filter((session) => session.view.window.kind === "opening").length, 0, "no plan during the mulligan: the brief's opening policy decides it");
	for (const seat of [0, 1]) assert.ok(sessions.find((session) => session.seat === seat), `seat ${seat} planned once the game began`);
	assert.ok(prompts.every((prompt) => prompt.ceiling === CEILING.strategy));
	assert.equal(new Set(prompts.map((prompt) => prompt.system)).size, 1, "every call sends the same system prompt, so it can be cached");
	assert.ok(prompts[0]!.system!.includes(syntaxReference()), "the syntax and its examples are in it");
	for (const prompt of prompts) {
		const sent = JSON.parse(prompt.user) as { seat: number; objects: { zone: string; controller: number }[]; cards: { name: string; oracle: string }[] };
		assert.ok(sent.objects.every((object) => object.zone !== "library" && (object.zone !== "hand" || object.controller === sent.seat)), "nothing hidden from the seat");
		assert.ok(sent.cards.length > 0 && sent.cards.every((fact) => fact.oracle === universe.cards.get(fact.name)!.oracle), "the writer reads the actual card text");
	}
});

test("the pilot's packet stays small: the plan, the options and the public position", () => {
	const table = position();
	editWork(table, 0, [{ do: "plan.put", plan: line }], "plan");
	main(table, 0, 3);
	const frame = workFrame(table, 0);
	const state = planState(frame)!;
	const decision = { ...frame.decision!, options: annotate(frame.decision!.options, state) };
	const packet = focus({ ...frame, decision }, startingIntent(0));
	const size = JSON.stringify(asState(packet)).length + question(packet, true).instructions.length + JSON.stringify(question(packet, true).criteria).length;
	assert.ok(size < 9000, `a pilot request is ${size} characters`);
	assert.equal(packet.plan?.due, "Play a Forest");
	assert.equal(JSON.stringify(packet).includes("registers"), false);
});

test("a step means playing what it names: never a discard, a token by its name, and a public hand count", async () => {
	// A card the step means to cast, still in hand at cleanup with eight cards: the pilot discards, not the table.
	const table = matchup("discard");
	main(table, 0, 3);
	const spell = cardsIn(table, "hand", 0).find((one) => !/Forest|Passage/.test(one.card ?? ""))!;
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [{ label: `Cast ${spell.card} when able`, when: turn3,
		action: { objects: { zones: ["hand"], refs: [{ id: spell.id, incarnation: spell.incarnation }] } } }] } }], "plan");
	const asked: Frame[] = [];
	await playUntil(table, { 0: pilot(asked), 1: opponent }, 3);
	assert.equal(table.ledger.some((row) => row.seat === 0 && row.picked.startsWith("discard:") && row.why === "delegated"), false, "the table discards nothing for the seat");

	// A token is named as the writer sees it, and its attack is taken.
	const tokens = matchup("token");
	commit(tokens, [{ do: "token", id: "soldier", controller: 0, spec: { name: "Soldier", types: ["creature"], subtypes: ["Soldier"], colors: ["white"], power: 2, toughness: 2 } }], "game-setup");
	main(tokens, 0, 3);
	editWork(tokens, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [
		{ label: "Attack with the Soldier", when: { ...turn3, step: "declare-attackers" }, action: { prefix: "attack:", objects: { card: "Soldier" } } },
		{ label: "Finish attacking", when: { ...turn3, step: "declare-attackers" }, action: { option: "attack:done" } }] } }], "plan");
	await playUntil(tokens, { 0: pilot([]), 1: opponent }, 3);
	assert.ok(tokens.ledger.some((row) => row.picked === "attack:soldier"), "the Soldier attacks");

	// Hand sizes are public, so a plan can count the opponent's.
	const hand = matchup("hand");
	main(hand, 0, 3);
	const count = (bound: object) => ({ amount: { count: { zones: ["hand" as const], controller: "opponent" as const } }, ...bound });
	editWork(hand, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [], may: [{ label: "Pass while they hold three cards", when: {}, if: count({ atLeast: 3 }), action: { option: "pass" } }],
		askWhen: [{ label: "They are hellbent", if: count({ atMost: 0 }) }] } }], "plan");
	assert.deepEqual(planState(workFrame(hand, 0))!.branches.map((one) => one.label), ["Pass while they hold three cards"], "Red holds seven");
	assert.equal(hand.work[0]!.unarmed, undefined, "and is not hellbent, so the stop is armed");
	assert.equal(JSON.stringify(workFrame(hand, 0).view.objects).includes("hidden-"), false, "nothing stands in for those cards in what the seat is shown");
});

test("a strategy session that gives nothing usable leaves a gap, and the game goes on under the standing plan", async () => {
	const universe = loadCards("cards/standard.tsv");
	const model = { type: "classifier", id: "jev-latest", provider: "typesafe", api: "typesafe-system-one" } as never;
	const chat = { id: "fixture", provider: "offline", type: "chat" } as never;
	const roster = async () => [{ role: "decide" as const, pattern: "fixture", model }, { role: "pregame" as const, pattern: "off", off: true }, { role: "strategy" as const, pattern: "fixture", model: chat }];
	const inference = {
		classify: (async (_model: unknown, request: { questions: Record<string, { criteria: Record<string, string> }> }) => ({ api: "typesafe-system-one", provider: "typesafe", model: "jev-latest", stopReason: "stop", timestamp: 0,
			answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => { const ids = Object.keys(question.criteria); const choice = ids.find((id) => id === "keep") ?? ids[0]!;
				return [key, { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 }]; })) })) as never,
		// Every answer is malformed: steps that are not a list.
		stream: (() => ({ result: async () => ({ content: [{ type: "toolCall", id: "c", name: "submit", arguments: { plan: { objective: "o", guidance: "g", steps: null } } }], stopReason: "toolUse" }) })) as never,
	};
	const table = start(standard, [{ name: "A", deck: deck("Green Stompy") }, { name: "B", deck: deck("Dimir Control") }], "unplanned");
	const outcome = await run(table, await seatTable(table, roster, inference, universe, { format: standard.name }), inference, undefined);
	assert.ok(outcome, "the game reaches an outcome");
	assert.ok(table.gaps.some((gap) => gap.includes("/steps must be array") && gap.endsWith("The standing plan is kept.")), "each failed session is a gap that names why");
});

test("a stop is watched in its window, and its window and bounds are read as written", async () => {
	// Accepted in the main phase, a stop for combat that already holds there is armed: it fires in its window.
	const table = position();
	main(table, 0, 3);
	const lands = { amount: { count: { types: ["land" as const], controller: "you" as const } }, atLeast: 1 };
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [], askWhen: [{ label: "In combat with a land", when: { active: "self", step: "declare-attackers" }, if: lands }] } }], "plan");
	assert.equal(table.work[0]!.unarmed, undefined, "outside its window it waits for nothing");
	const requests: string[] = [];
	const replanner: Player = { name: "Green", observe() {}, close() {}, async answer(frame): Promise<Answer> {
		const work = frame.view.work!;
		if (work.request) { requests.push(work.request); return { kind: "work", tools: [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], revision: work.revision, actionId: `plan-${requests.length}` }; }
		return { kind: "pick", option: (frame.decision!.options.find((option) => option.id === "keep") ?? quiet(frame.decision!.options)).id, actionId: `green-${frame.version}` };
	} };
	await playUntil(table, { 0: replanner, 1: opponent }, 3);
	assert.deepEqual(requests, ["Stop: In combat with a land"]);
	// The first turn's budget is counted from when it begins, not from seating.
	const fresh = matchup("began");
	main(fresh, 0, 1);
	assert.ok(fresh.cursor.began[0]! > 0, "turn 1 begins when the hands are settled");
	// A stop in a step nobody acts in is refused, and a bound written twice is not quietly dropped.
	assert.match(planProblems(workFrame(table, 0), { objective: "o", guidance: "g", steps: [], askWhen: [{ label: "At untap", when: { step: "untap" }, if: lands }] }).join(" "), /untap has no priority/);
	assert.deepEqual(lifted({ if: { amount: { count: { types: ["creature"] }, atLeast: 3 }, atLeast: 1 } }), { if: { amount: { count: { types: ["creature"] }, atLeast: 3 }, atLeast: 1 } });
});

test("the writer is told its mana source by source, and what a land in hand would add by its package", async () => {
	const table = position();
	main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }, { do: "package.put", package: { card: "Forest", registers: [] } }], "request");
	const seen: string[] = [];
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); return { result: async () => ({ content: [{ type: "toolCall", id: "c", name: "submit", arguments: { plan: line } }], stopReason: "toolUse" }) }; };
	await planWork(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.match(seen[0]!, /Mana now: Forest \(0-\d+\) makes G; Forest \(0-\d+\) makes G/);
	assert.match(seen[0]!, /Land plays left this turn: 1\. In hand: .*Forest: enters untapped, makes G/);
	assert.match(seen[0]!, /Ba Sing Se: no package, so how it enters and what it makes are unknown/, "a land with no package is not guessed at");
});

test("the plan's arithmetic: costs from what the steps before leave, holds kept, land plays counted with what the plan permits", () => {
	const turn = (table: Table) => table.cursor.turn;
	const problems = (table: Table, plan: Omit<Plan, "objective" | "guidance">) => planProblems(workFrame(table, 0), { objective: "o", guidance: "g", ...plan }).join(" | ");
	const now = (table: Table) => ({ active: "self" as const, step: "precombat-main" as const, fromTurn: turn(table), throughTurn: turn(table) });
	const cast = (table: Table, card: string, label = `Cast ${card}`) => ({ label, when: now(table), action: { prefix: "cast:", objects: { card, zones: ["hand" as const] } } });
	const land = (table: Table, card: string) => ({ label: `Play ${card}`, when: now(table), action: { prefix: "land:", objects: { card, zones: ["hand" as const] } } });
	const veil = (table: Table): Plan["may"] => [{ label: "Veil a targeted creature", when: { active: "opponent" as const, fromTurn: turn(table) + 1, throughTurn: turn(table) + 1 },
		action: { procedure: { claim: "Cast Snakeskin Veil", basis: "Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn.", source: { zones: ["hand"], controller: "self", card: "Snakeskin Veil" },
			timing: "spell", targets: [{ object: { types: ["creature"], controller: "you" } }], instructions: [] } } }];

	// Three Forests: Hydra spends them all, so Veil cannot also be kept.
	const three = matchup("arithmetic");
	place(three, 0, "battlefield", "Forest", "Forest", "Forest");
	main(three, 0, 3);
	place(three, 0, "hand", "Mossborn Hydra", "Snakeskin Veil");
	assert.match(problems(three, { steps: [cast(three, "Mossborn Hydra")], may: veil(three) }), /may\[0\] \(Veil a targeted creature\): costs \{G\} but the steps before it leave no untapped source/);
	const forest = cardsIn(three, "battlefield", 0).find((one) => one.card === "Forest")!;
	assert.match(problems(three, { steps: [cast(three, "Mossborn Hydra")], may: veil(three), holds: [{ objects: { refs: [{ id: forest.id, incarnation: forest.incarnation }] }, purpose: "Veil" }] }),
		/steps\[\d\] \(Cast Mossborn Hydra\): costs \{2\}\{G\} but the steps before it leave Forest \(G\), Forest \(G\), and the plan holds Forest/);

	// The land first pays for the Hydra; the Hydra first does not.
	const two = matchup("order");
	place(two, 0, "battlefield", "Forest", "Forest");
	main(two, 0, 3);
	place(two, 0, "hand", "Mossborn Hydra", "Forest");
	editWork(two, 0, [{ do: "package.put", package: { card: "Forest", registers: [] } }], "forest");
	assert.match(problems(two, { steps: [cast(two, "Mossborn Hydra"), land(two, "Forest")] }), /Cast Mossborn Hydra\): costs \{2\}\{G\}/);
	assert.equal(problems(two, { steps: [land(two, "Forest"), cast(two, "Mossborn Hydra")] }), "");
	// A card the seat does not hold is named, and a window on the wrong seat's turn never opens.
	assert.match(problems(two, { steps: [cast(two, "Icetill Explorer")] }), /you hold no Icetill Explorer now/);
	assert.match(problems(two, { steps: [], askWhen: [{ label: "Never", when: { active: "opponent", fromTurn: turn(two), throughTurn: turn(two) }, if: { amount: { life: "you" }, atMost: 5 } }] }), /is your turn, so a window for the opponent's turn on it never opens/);

	// A land that enters tapped makes nothing this turn.
	editWork(two, 0, [{ do: "package.put", package: { card: "Forest", registers: [{ basis: "This land enters tapped.", kind: "enters", tapped: true }] } }], "tapped");
	assert.match(problems(two, { steps: [land(two, "Forest"), cast(two, "Mossborn Hydra")] }), /costs \{2\}\{G\}/);

	// Icetill Explorer cast first permits the second land.
	const icetill = matchup("icetill-plan");
	place(icetill, 0, "battlefield", "Forest", "Forest", "Forest", "Forest");
	main(icetill, 0, 3);
	place(icetill, 0, "hand", "Icetill Explorer", "Forest", "Forest");
	editWork(icetill, 0, [{ do: "package.put", package: { card: "Icetill Explorer", registers: pack("Icetill Explorer") } }, { do: "package.put", package: { card: "Forest", registers: [] } }], "icetill");
	assert.equal(problems(icetill, { steps: [cast(icetill, "Icetill Explorer"), land(icetill, "Forest"), land(icetill, "Forest")] }), "");
	assert.match(problems(icetill, { steps: [land(icetill, "Forest"), land(icetill, "Forest")] }), /no land play is left for it this turn/);
});

test("an essential step that cannot be taken where it belongs asks for a new plan; a plain one is passed over", async () => {
	for (const essential of [true, false]) {
		const table = position();
		main(table, 0, 3);
		// The Passage is already on the battlefield, so no cast option ever names it.
		const passage = cardsIn(table, "battlefield", 0).find((one) => one.card === "Fabled Passage")!;
		editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [{ label: "Cast the Passage", when: { ...turn3, step: "precombat-main" },
			...(essential ? { essential: true as const } : {}), action: { prefix: "cast:", objects: { refs: [{ id: passage.id, incarnation: passage.incarnation }] } } }] } }], "plan");
		const requests: string[] = [];
		const writer: Player = { name: "Green", observe() {}, close() {}, async answer(frame): Promise<Answer> {
			const work = frame.view.work!;
			if (work.request) { requests.push(work.request); return { kind: "work", tools: [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], revision: work.revision, actionId: `plan-${requests.length}` }; }
			return { kind: "pick", option: quiet(frame.decision!.options).id, actionId: `g-${frame.version}` };
		} };
		await playUntil(table, { 0: writer, 1: opponent }, 3);
		assert.deepEqual(requests, essential ? ["Stop: Step 1 cannot be taken now: Cast the Passage"] : []);
	}
});

test("a step is carried out with a payment that spares what the plan holds, and the table takes it", async () => {
	const table = matchup("sparing");
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest", "Forest");
	place(table, 0, "hand", "Llanowar Elves");
	const [kept] = cardsIn(table, "battlefield", 0).filter((one) => one.card === "Forest");
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", holds: [{ objects: { refs: [{ id: kept!.id, incarnation: kept!.incarnation }] }, purpose: "Snakeskin Veil" }],
		steps: [{ label: "Cast Llanowar Elves", when: { ...turn3, step: "precombat-main" }, action: { prefix: "cast:", objects: { card: "Llanowar Elves" } } }] } }], "plan");
	const due = planState(workFrame(table, 0))!.due[0]!;
	assert.equal(due.candidates.length, 1, "of the two Forests, only the free one fits the step");
	assert.ok(!due.candidates[0]!.objects!.some((ref) => ref.id === kept!.id));
	await playUntil(table, { 0: pilot([]), 1: opponent }, 3);
	assert.equal(table.things.get(kept!.id)!.tapped, false, "the held Forest is still untapped");
	assert.ok(table.ledger.some((row) => row.picked.startsWith("cast:") && row.why === "delegated"), "and the table took the cast itself");
});

test("the pilot reads the plan's guidance for the window it is in, and no other", () => {
	const table = position();
	main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.put", plan: { ...line, phases: [
		{ when: { active: "self", step: "precombat-main" }, guidance: "Land first, then the Passage." },
		{ when: { active: "self", step: "declare-attackers" }, guidance: "Attack with the Chocobo." }] } }], "plan");
	const packet = focus(workFrame(table, 0), startingIntent(0));
	assert.deepEqual(packet.plan!.phase, ["Land first, then the Passage."]);
	assert.match(question(packet, true).instructions, /Now: Land first, then the Passage\./);
});

test("the turn before ours prepares our next one; a quiet turn offers it as it is, a changed one asks for a review", async () => {
	for (const changed of [false, true]) {
		const table = position();
		main(table, 0, 3);
		editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], "planned");
		main(table, 1, 4);
		// Every card Green could draw is named by a branch, so any draw is covered.
		const names = [...new Set(cardsIn(table, "library", 0).map((one) => one.card!))];
		const prepared: Plan = { objective: "Prepared.", guidance: "g", steps: [], may: names.map((name) => ({ label: `If I draw ${name}`, when: { active: "self", step: "precombat-main" },
			if: { amount: { count: { zones: ["hand"], controller: "you", name } }, atLeast: 1 }, action: { option: "pass" } })) };
		const calls = { prepare: 0, review: [] as string[][], plan: 0 };
		const seat = aiSeat({ name: "Green", api: { named: "none", ask: async () => { throw new Error("no pilot call expected"); } } as never, intent: startingIntent(0), onGap() {},
			plan: async () => { calls.plan += 1; return { tools: [] }; },
			prepare: async () => { calls.prepare += 1; return prepared; },
			review: async (_frame, plan, lines) => { calls.review.push(lines); return { tools: [{ do: "plan.put", plan }] }; } });
		seat.observe(workFrame(table, 0));
		seat.observe(workFrame(table, 0));
		assert.equal(calls.prepare, 1, "one preparation for the turn ahead");
		if (changed) commit(table, [{ do: "change-life", who: 0, amount: -3, reason: "resolve" }], "resolve");
		main(table, 0, 5);
		const answer = await seat.answer(workFrame(table, 0));
		assert.equal(answer.kind, "work");
		assert.deepEqual((answer as Extract<Answer, { kind: "work" }>).tools, [{ do: "plan.put", plan: prepared }]);
		assert.equal(calls.plan, 0, "no plan written from scratch");
		if (changed) assert.ok(calls.review.length === 1 && calls.review[0]!.includes("your life went from 20 to 17"), "a change is reviewed, and named");
		else assert.equal(calls.review.length, 0, "nothing changed but the draw: no call");
	}
});

test("every seat sees each turn begin, even a turn of only forced play", async () => {
	const table = position();
	const seen: string[] = [];
	const watcher: Player = { ...pilot([]), observe(frame) { if (frame.view.window.kind === "turn") seen.push(`${frame.view.window.turn}:${frame.view.window.step}`); } };
	await playUntil(table, { 0: watcher, 1: opponent }, 2);
	assert.ok(seen.includes("2:untap"), `Green saw Red's turn begin: ${seen.slice(0, 6).join(", ")}`);
});

test("preparation asks for the next turn window by window, and a review may keep the prepared plan in one short answer", async () => {
	const table = position();
	main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], "planned");
	main(table, 1, 4);
	const seen: string[] = [];
	const replies: Record<string, unknown>[] = [{ plan: { objective: "Next turn.", guidance: "g", steps: [], phases: [{ when: { active: "self", fromTurn: 5, throughTurn: 5, step: "precombat-main" }, guidance: "Develop." }] } }];
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); return { result: async () => ({ content: [{ type: "toolCall", id: `c${seen.length}`, name: "submit", arguments: replies.shift()! }], stopReason: "toolUse" }) }; };
	const writer = reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 });
	const prepared = await prepareTurn(workFrame(table, 0), {}, writer);
	assert.match(seen[0]!, /PREPARE YOUR NEXT TURN\. It is the opponent's turn 4; yours, turn 5/);
	assert.equal(prepared.objective, "Next turn.");

	main(table, 0, 5);
	replies.push({ accept: true });
	const kept = await reviewPlan(workFrame(table, 0), prepared, ["you drew Forest"], {}, writer);
	assert.match(seen[1]!, /Since you prepared it: you drew Forest/);
	assert.deepEqual(kept.tools, [{ do: "plan.put", plan: prepared }]);
});

test("an essential step waits for the steps before it, and nothing is taken for the seat past it", () => {
	const table = position();
	main(table, 0, 3);
	const passage = cardsIn(table, "battlefield", 0).find((one) => one.card === "Fabled Passage")!;
	const window = { ...turn3, step: "precombat-main" as const };
	const blocked = { label: "Cast the Passage", when: window, essential: true as const, action: { prefix: "cast:", objects: { refs: [{ id: passage.id, incarnation: passage.incarnation }] } } };
	const land = { label: "Play a Forest", when: window, action: { prefix: "land:", objects: { zones: ["hand" as const], card: "Forest" } } };
	// The land comes first, so it may yet pay: no stop, and the table plays it.
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [land, blocked] } }], "land-first");
	let state = planState(workFrame(table, 0))!;
	assert.deepEqual([state.stops, state.unmet], [[], undefined]);
	// The essential step comes first: it is the stop, and the land is not taken past it.
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [blocked, land] } }], "blocked-first");
	state = planState(workFrame(table, 0))!;
	assert.deepEqual([state.stops, state.unmet], [["Step 1 cannot be taken now: Cast the Passage"], 0]);
});

test("payments are tried together: the creature takes the Village's red so a Mountain stays free for Shock", () => {
	const table = matchup("village");
	main(table, 1, 2);
	establish(table, 1, "Rockface Village", pack("Rockface Village"));
	place(table, 1, "battlefield", "Mountain", "Mountain");
	place(table, 1, "hand", "Emberheart Challenger", "Shock");
	const now = { active: "self" as const, step: "precombat-main" as const, fromTurn: 2, throughTurn: 2 };
	const plan: Plan = { objective: "o", guidance: "g",
		steps: [{ label: "Cast Emberheart Challenger", when: now, action: { prefix: "cast:", objects: { zones: ["hand"], card: "Emberheart Challenger" } } }],
		may: [{ label: "Shock a blocker", when: { active: "any" }, action: { procedure: { claim: "Cast Shock", basis: "Shock deals 2 damage to any target.", source: { zones: ["hand"], controller: "self", card: "Shock" },
			timing: "spell", targets: [{ object: { types: ["creature"] }, player: "any" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] } } }] };
	assert.deepEqual(planProblems(workFrame(table, 1), plan), []);
	// Without the Village, both Mountains pay for the creature and Shock is named as the conflict.
	commit(table, [{ do: "move", what: cardsIn(table, "battlefield", 1).find((one) => one.card === "Rockface Village")!.id, to: "graveyard", reason: "resolve" }], "resolve");
	assert.match(planProblems(workFrame(table, 1), plan).join(" "), /may\[0\] \(Shock a blocker\): costs \{R\} but the steps before it leave no untapped source/);
});

test("a challenger's revision is used when it is ready, and the turn never waits for one that is not", async () => {
	for (const ready of [true, false]) {
		const table = position();
		main(table, 0, 3);
		editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], "planned");
		main(table, 1, 4);
		const names = [...new Set(cardsIn(table, "library", 0).map((one) => one.card!))];
		const covering = names.map((name) => ({ label: `If I draw ${name}`, when: { active: "self" as const, step: "precombat-main" as const },
			if: { amount: { count: { zones: ["hand" as const], controller: "you" as const, name } }, atLeast: 1 }, action: { option: "pass" } }));
		const prepared: Plan = { objective: "Prepared.", guidance: "g", steps: [], may: covering }, revised: Plan = { ...prepared, objective: "Revised." };
		const seat = aiSeat({ name: "Green", api: { named: "none", ask: async () => { throw new Error("no pilot call"); } } as never, intent: startingIntent(0), onGap() {},
			prepare: async () => prepared, challenge: () => ready ? Promise.resolve(revised) : new Promise<Plan>(() => {}) });
		seat.observe(workFrame(table, 0));
		await new Promise((resolve) => setImmediate(resolve));
		main(table, 0, 5);
		const answer = await seat.answer(workFrame(table, 0)) as Extract<Answer, { kind: "work" }>;
		assert.deepEqual(answer.tools, [{ do: "plan.put", plan: ready ? revised : prepared }]);
	}
});

test("the arithmetic is refused once and then left to the pilot, and a conditional step is not counted", async () => {
	const table = matchup("once");
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest");
	place(table, 0, "hand", "Mossborn Hydra");
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }], "request");
	const window = { active: "self" as const, step: "precombat-main" as const, fromTurn: 3, throughTurn: 3 };
	const hydra = { label: "Cast Mossborn Hydra", when: window, action: { prefix: "cast:", objects: { zones: ["hand" as const], card: "Mossborn Hydra" } } };
	const conditional = { ...hydra, label: "Cast Mossborn Hydra if a third land arrives", if: { amount: { count: { types: ["land" as const], controller: "you" as const } }, atLeast: 3 } };
	assert.deepEqual(planProblems(workFrame(table, 0), { objective: "o", guidance: "g", steps: [conditional] }), [], "a step that may not happen is not counted");
	const seen: string[] = [];
	const plan = { objective: "o", guidance: "g", steps: [hydra] };
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); return { result: async () => ({ content: [{ type: "toolCall", id: `c${seen.length}`, name: "submit", arguments: { plan } }], stopReason: "toolUse" }) }; };
	const { tools } = await planWork(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.equal(seen.length, 2, "refused once, then accepted");
	assert.match(seen[1]!, /costs \{2\}\{G\}/);
	assert.deepEqual(tools, [{ do: "plan.put", plan }]);
});
