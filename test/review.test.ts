/** Considered: a derived checklist guides direct choices; optional private judgments remain replayable. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checklist } from "../src/core/review.ts";
import { execution, planState } from "../src/core/planning.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { fork, open, replay, save, type Header } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { aiSeat } from "../src/context/seat.ts";
import { focus, type Packet } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { announce, establish, example, finish, main, matchup, passBoth, place } from "./play.ts";
import { question as moveQuestion } from "../src/context/seat.ts";
import { activate } from "../src/core/procedures.ts";

test("a pilot executes with derived plan status, while private judgments neither move cards nor complete steps", async () => {
	const position = () => {
		const table = matchup("review");
		place(table, 0, "hand", "Forest", "Forest", "Mossborn Hydra");
		return table;
	};
	const table = position();
	main(table, 0);
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "Develop and keep protection.", guidance: "Play a Forest. Cast Hydra when affordable.", steps: [
		{ label: "Play Forest", when: { active: "self", step: "precombat-main" }, action: { prefix: "land:", objects: { card: "Forest", zones: ["hand"] } } },
		{ label: "Cast Hydra", when: { active: "self", step: "precombat-main" }, action: { prefix: "cast:", objects: { card: "Mossborn Hydra", zones: ["hand"] } } },
	], may: [{ label: "Only with a resource", when: { active: "self", step: "precombat-main" }, if: { amount: 0, atLeast: 1 },
		action: { prefix: "land:", objects: { card: "Forest" } } }],
	phases: [{ when: { active: "self", step: "precombat-main" }, goal: "Develop without spending protection.", guidance: "Play Forest; do not invent extra mana." }] } }], "plan");
	const drawFrame = workFrame(table, 0);
	drawFrame.view.window = { kind: "turn", turn: 1, active: 0, step: "draw", phase: "beginning" };
	for (const inspection of [undefined, {}]) {
		const draw = focus(drawFrame, startingIntent(0), { ...(inspection ? { inspection } : {}) });
		assert.deepEqual(draw.plan!.next.map((one) => [one.label, one.when.step, one.status]), [
			["Play Forest", "precombat-main", "outside-window"], ["Cast Hydra", "precombat-main", "outside-window"],
		], "a pilot waiting for main phase sees the required windows even without a current checklist");
		assert.match(moveQuestion(draw, true).instructions!, /unrelated available activation is not a substitute/);
		assert.deepEqual(drawFrame.view.work!.plan!.steps, table.work[0]!.plan!.steps, "slicing pending windows changes no intent");
	}
	const physical = () => JSON.stringify({ things: [...table.things], cursor: table.cursor, ledger: table.ledger, log: table.log });
	const before = physical(), offered = nextDecision(table), prompts: string[] = [];
	const pilot = aiSeat({ name: "Green", intent: startingIntent(0), onGap: assert.fail, api: { named: "fixture", async ask(request) {
		const question = request.questions.pick!;
		assert.equal(question.type, "choice");
		if (question.type !== "choice") assert.fail();
		prompts.push(question.instructions ?? "");
		const packet = request.state as unknown as Packet;
		assert.equal(Object.hasOwn(question.criteria, "review:hold"), false, "the physical question includes the completion check");
		assert.equal(packet.checklist!.find((one) => one.label === "Play Forest")!.status, "available");
		assert.equal(packet.checklist!.find((one) => one.label === "Cast Hydra")!.status, "later");
		assert.equal(packet.checklist!.find((one) => one.kind === "branch")!.status, "condition-false");
		assert.ok(packet.checklist!.every((one) => !("options" in one)), "checklist facts do not repeat every target/payment id");
		const choice = packet.options.find((one) => one.id.startsWith("land:"))!.id;
		assert.ok(Object.hasOwn(question.criteria, choice));
		return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } };
	} } });
	const items = checklist(workFrame(table, 0));
	assert.ok(items.some((one) => one.label === "Cast Hydra" && !one.options.length), "an unavailable planned use stays visible");
	assert.ok(items.some((one) => one.kind === "phase"), "the phase strategy stays visible in the action question");
	assert.deepEqual(items.find((one) => one.kind === "phase")!.remaining, ["Play Forest", "Cast Hydra"]);
	assert.throws(() => editWork(table, 0, [{ do: "review.record", item: "step:1", verdict: "act", reason: "Use Hydra" }], "unavailable"), /has no current option/);
	assert.throws(() => editWork(table, 0, [{ do: "review.record", item: "made-up", verdict: "skip", reason: "Skip" }], "unknown"), /No checklist item/);
	assert.equal(JSON.stringify(items).includes('"zone":"library"'), false);
	for (const [item, verdict] of [["step:0", "act"], ["step:1", "skip"]] as const) {
		const tools = [{ do: "review.record" as const, item, verdict, reason: "Explicit seat note." }];
		editWork(table, 0, tools, item);
		assert.equal(editWork(table, 0, tools, item), false, "redelivery is idempotent");
		assert.equal(physical(), before, "review moves no cards, clock, priority or ledger");
		assert.deepEqual(nextDecision(table), offered, "every physical option remains available");
	}
	assert.deepEqual(workFrame(table, 0).view.done, [], "a review never completes a step");
	assert.equal(project(table, 1).work?.reviews, undefined, "another seat cannot read these judgments");
	assert.equal(project(table, "spectator").work, undefined);
	assert.throws(() => editWork(table, 0, [{ do: "review.record", item: "step:0", verdict: "act", reason: "Again" }], "duplicate-review"), /already reviewed/);
	const frame = workFrame(table, 0), packet = focus(frame, startingIntent(0));
	const missing = packet.checklist!.find((one) => one.label === "Cast Hydra")!;
	assert.equal(missing.judgment!.verdict, "skip");
	assert.equal(missing.status, "later", "a recorded skip cannot complete or remove the planned use");
	const dir = mkdtempSync(join(tmpdir(), "magic-review-"));
	const header: Header = { id: "review", seed: table.rng.seed, format: table.format.name,
		seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: "cards/standard.tsv", generated: "fixture" }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
	const journal = open(join(dir, "review.jsonl"), header); save(journal, table);
	const restored = replay(journal.path, () => position()).table;
	assert.deepEqual(checklist(workFrame(restored, 0)), checklist(frame), "replay preserves considered uses at the pending decision");
	fork(journal.path, table.ledger.length, "child", join(dir, "child.jsonl"));
	assert.deepEqual(replay(join(dir, "child.jsonl"), () => position()).table.work, table.work, "cloning carries judgments");
	const answer = await pilot.answer(frame);
	assert.equal(answer.kind, "pick");
	if (answer.kind !== "pick") assert.fail();
	assert.equal(prompts.length, 1, "the available planned action is chosen directly, including when judgments are absent");
	apply(table, answer.option, "model", "chosen", execution(planState(frame)!, answer.option));
	assert.ok(checklist(workFrame(table, 0)).every((one) => !one.judgment), "an action invalidates judgments from the old position");
	const afterLand = focus(workFrame(table, 0), startingIntent(0));
	assert.deepEqual(afterLand.plan!.done, ["Play Forest"], "reviews carry execution progress in state alongside the phase guidance");
	assert.deepEqual(afterLand.checklist!.find((one) => one.kind === "phase")!.remaining, ["Cast Hydra"], "an unavailable unfinished action is not counted as complete");
	assert.equal(afterLand.checklist!.find((one) => one.label === "Cast Hydra")!.status, "unavailable");
	assert.deepEqual(afterLand.checklist!.map((one) => one.kind), ["phase", "step", "branch"], "unmentioned cards do not create strategic review jobs");
	assert.ok(afterLand.cards["Mossborn Hydra"], "a completion check retains the unavailable planned card's actual text");
	const help = aiSeat({ name: "Help", intent: startingIntent(0), onGap: assert.fail,
		plan: async () => { throw new Error("Only the help request is being tested"); }, api: { named: "fixture", async ask(request) {
			const question = request.questions.pick!;
			if (question.type !== "choice") assert.fail();
			assert.ok(Object.hasOwn(question.criteria, "ask:help"));
			return { pick: { type: "choice", choice: "ask:help", confidence: 1, probabilities: { "ask:help": 1 } } };
		} } });
	const requested = await help.answer(workFrame(table, 0));
	assert.equal(requested.kind, "work"); if (requested.kind !== "work") assert.fail();
	assert.equal(requested.tools[0]!.do, "plan.request");
	await help.close();
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "Wait.", guidance: "Retain the cards.", steps: [] } }], "amend");
	assert.equal(table.work[0]!.reviews, undefined, "a changed plan cannot inherit the old judgment");
	await pilot.close();

	const response = matchup("review-response");
	place(response, 1, "hand", "Shock", "Shock", "Mountain"); place(response, 1, "battlefield", "Mountain", "Mountain");
	main(response, 1, 2);
	editWork(response, 1, [{ do: "plan.put", plan: { objective: "Use Shock before the land play.", guidance: "Let Shock resolve, then play Mountain. Keep the other Shock for a response.", steps: [
		{ label: "Play Mountain", when: { active: "self", step: "precombat-main" }, action: { prefix: "land:", objects: { card: "Mountain", zones: ["hand"] } } },
	], may: [{ label: "Respond with Shock", when: { active: "any" }, action: { procedure: example("Cast Shock") } }],
	phases: [{ when: { active: "self", step: "precombat-main" }, guidance: "Play Mountain after Shock resolves. Keep the other Shock for a response." }] } }], "land-after-spell");
	editWork(response, 0, [{ do: "plan.put", plan: { objective: "Keep resources.", guidance: "Respond if needed.", steps: [] } }], "respond");
	announce(response, example("Cast Shock"), (one) => one.activation.targets[0]!.some((target) => "player" in target && target.player === 0));
	const waiting = focus(workFrame(response, 1), startingIntent(1)), land = waiting.checklist!.find((one) => one.id === "step:0")!;
	assert.equal(land.status, "waiting");
	assert.equal(land.available, 0, "the land stays unfinished while the spell is on the stack");
	assert.ok(waiting.checklist!.some((one) => one.kind === "branch" && one.available), "an instant response remains available");
	assert.match(moveQuestion(waiting, true).instructions!, /absence alone does not require a new plan/);
	assert.match(moveQuestion(waiting, true).instructions!, /does not end the phase/);
	editWork(response, 1, [{ do: "review.record", item: land.id, verdict: "hold", reason: "Wait for the spell to resolve." }], "wait-for-stack");
	apply(response, "pass", "model", "chosen");
	assert.equal(nextDecision(response)!.seat, 0);
	const pending = structuredClone(response);
	let responseCalls = 0;
	const opponent = aiSeat({ name: "Opponent", intent: startingIntent(0), onGap: assert.fail, api: { named: "fixture", async ask(request) {
		responseCalls++; const packet = request.state as unknown as Packet;
		assert.ok(packet.objects.some((one) => one.zone === "stack" && one.name === "Shock"));
		assert.deepEqual(packet.checklist, undefined, "there is no duplicate response review");
		return { pick: { type: "choice", choice: "pass", confidence: 1, probabilities: { pass: 1 } } };
	} } });
	const responseAnswer = await opponent.answer(workFrame(response, 0));
	assert.equal(responseCalls, 1, "one question chooses the response or actual pass");
	assert.equal(responseAnswer.kind, "pick"); if (responseAnswer.kind !== "pick") assert.fail();
	assert.equal(responseAnswer.option, "pass");
	await opponent.close();
	assert.deepEqual(response.cursor, pending.cursor, "the model answer still needs core to apply the pass");
	assert.deepEqual(response.ledger, pending.ledger);
	assert.match(nextDecision(response)!.options.find((one) => one.id === "pass")!.shows!, /top stack object begins resolving/);
	apply(response, "pass", "model", "chosen"); finish(response);
	const cleared = focus(workFrame(response, 1), startingIntent(1));
	assert.equal(cleared.checklist!.find((one) => one.id === land.id)?.status, "available", "resolution restores the land use without a new plan");
	assert.equal(cleared.checklist!.find((one) => one.id === land.id)?.judgment, undefined, "waiting is reassessed against the new position");
	assert.doesNotMatch(moveQuestion(cleared, true).instructions!, /absence alone does not require a new plan/, "empty-stack passes still end the step or phase");
	const playLand = checklist(workFrame(response, 1)).find((one) => one.id === land.id)!.options[0]!;
	apply(response, playLand, "model", "chosen", execution(planState(workFrame(response, 1))!, playLand));
	const complete = focus(workFrame(response, 1), startingIntent(1)), phase = complete.checklist!.find((one) => one.kind === "phase")!;
	assert.deepEqual(phase.remaining, [], "phase progress comes from recorded actions");
	assert.equal(phase.status, "recorded");
	assert.ok(complete.checklist!.some((one) => one.kind === "branch" && one.available), "completing the line does not remove response uses");

	const fetchPosition = () => { const table = matchup("review-fetch"); place(table, 0, "battlefield", "Fabled Passage"); return table; };
	const fetch = fetchPosition(); main(fetch, 0);
	editWork(fetch, 0, [{ do: "plan.put", plan: { objective: "Develop.", guidance: "Find the basic land after paying for Passage.", steps: [
		{ label: "Fetch a basic", purpose: "Choose Forest to supply the next green spell.", when: { active: "self", step: "precombat-main" }, action: { procedure: example("Crack Fabled Passage for a basic land") } },
	] } }], "old-plan");
	const fetchFrame = workFrame(fetch, 0), fetchState = planState(fetchFrame)!, fetchUse = fetchState.procedures[0]!;
	assert.ok(fetchUse);
	activate(fetch, fetchUse.activation, { picked: fetchUse.option.id, offered: [fetchUse.option.id], by: "model", why: "chosen", execution: execution(fetchState, fetchUse.option.id) });
	const originalPurpose = project(fetch, 0).purposes;
	assert.equal(originalPurpose?.[0]?.use, "Choose Forest to supply the next green spell.");
	assert.deepEqual(project(fetch, 1).purposes, [], "another seat cannot read the use's private purpose");
	assert.equal(project(fetch, "spectator").purposes, undefined);
	editWork(fetch, 0, [{ do: "plan.put", plan: { objective: "Wait.", guidance: "Stale guidance about preserving a Forest in hand.", steps: [] } }], "new-plan");
	assert.deepEqual(project(fetch, 0).purposes, originalPurpose, "replanning does not rewrite an announced use's purpose");
	passBoth(fetch);
	const resolving = focus(workFrame(fetch, 0), startingIntent(0));
	assert.ok(resolving.cards["Fabled Passage"], "a sacrificed source keeps its card text in the resolving decision");
	assert.ok(resolving.cards.Forest, "an authorized search choice carries full card text without exposing library order");
	assert.equal(resolving.resolving?.purpose, "Choose Forest to supply the next green spell.");
	const fetchJournal = open(join(dir, "fetch.jsonl"), { ...header, id: "fetch", seed: fetch.rng.seed }); save(fetchJournal, fetch);
	assert.deepEqual(project(replay(fetchJournal.path, fetchPosition).table, 0).purposes, originalPurpose, "replay recovers the announcement's purpose");
	fork(fetchJournal.path, fetch.ledger.length, "fetch-child", join(dir, "fetch-child.jsonl"));
	assert.deepEqual(project(replay(join(dir, "fetch-child.jsonl"), fetchPosition).table, 0).purposes, originalPurpose, "a clone carries only its prefix's purpose");
	assert.match(resolving.resolving!.basis, /Search your library/);
	assert.ok(resolving.objects.some((one) => one.effect?.some((line) => line.includes("Search your library"))), "accepted stack instructions survive compact projection");
	assert.equal(resolving.plan, undefined, "a new turn's casting guidance cannot displace an already resolving use");
	assert.match(moveQuestion(resolving, false).instructions, /costs are already paid/);
	assert.doesNotMatch(moveQuestion(resolving, false).instructions, /Stale guidance/);
	assert.ok(resolving.options.some((one) => one.label.includes("Decline")), "declining the search remains the seat's choice");
	const limited = structuredClone(resolving);
	const select = limited.resolution!.program[0]!.instruction;
	assert.ok(select.do === "choose");
	select.from.is = { top: 1, of: "you" };
	assert.doesNotMatch(moveQuestion(limited, false).instructions, /deliberate exception requiring a prepared reason/, "choosing from a limited library set is not a whole-library search");
	assert.deepEqual(limited.options, resolving.options, "search guidance never removes an optional decline");

	const triggerPosition = () => { const table = matchup("review-trigger");
		establish(table, 0, "Sazh's Chocobo", [{ kind: "watch", basis: "Landfall — Whenever a land you control enters, put a +1/+1 counter on this creature.",
			event: { on: "enters", of: { types: ["land"], controller: "you" } }, effect: { instructions: [{ do: "counters", on: "this", kind: "+1/+1", amount: 1 }] } }]);
		place(table, 0, "hand", "Forest"); return table; };
	const triggered = triggerPosition(); main(triggered, 0);
	const triggerPolicy = "Apply the Chocobo's landfall counter, then use the prepared response policy.";
	editWork(triggered, 0, [{ do: "plan.put", plan: { objective: "Trigger audit", guidance: "Never display this rationale", throughTurn: 2, steps: [],
		phases: [{ when: { active: "self", step: "precombat-main" }, guidance: triggerPolicy }] } }], "trigger-policy");
	apply(triggered, nextDecision(triggered)!.options.find((one) => one.label === "Play Forest")!.id, "model", "chosen");
	assert.equal(nextDecision(triggered)!.situation, "trigger-order");
	assert.deepEqual(focus(workFrame(triggered, 0), startingIntent(0)).plan!.script!.guidance, [triggerPolicy]);
	apply(triggered, nextDecision(triggered)!.options[0]!.id, "model", "chosen");
	const announced = project(triggered, 0).purposes;
	assert.equal(announced![0]!.guidance, triggerPolicy, "trigger puts recover policy just like ordinary announcements");
	assert.deepEqual(project(triggered, 1).purposes, []);
	editWork(triggered, 0, [{ do: "plan.put", plan: { objective: "Later", guidance: "Later rationale", steps: [],
		phases: [{ when: { active: "self" }, guidance: "Later trigger policy must not rewrite the stack." }] } }], "amended-trigger-policy");
	assert.deepEqual(project(triggered, 0).purposes, announced);
	passBoth(triggered);
	const resolvingTrigger = focus(workFrame(triggered, 0), startingIntent(0));
	assert.equal(resolvingTrigger.resolving!.guidance, triggerPolicy);
	assert.doesNotMatch(JSON.stringify(resolvingTrigger), /Later trigger policy|Never display this rationale/);
	const triggerJournal = open(join(dir, "trigger.jsonl"), { ...header, id: "trigger", seed: triggered.rng.seed }); save(triggerJournal, triggered);
	assert.deepEqual(project(replay(triggerJournal.path, triggerPosition).table, 0).purposes, announced);
	fork(triggerJournal.path, triggered.ledger.length, "trigger-child", join(dir, "trigger-child.jsonl"));
	assert.deepEqual(project(replay(join(dir, "trigger-child.jsonl"), triggerPosition).table, 0).purposes, announced, "clones recover the original trigger policy after amendment");
});
