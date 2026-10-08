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
import { focus, STATUS, type Packet } from "../src/context/packet.ts";
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
	drawFrame.view.remainingSteps = ["draw", "precombat-main", "begin-combat", "declare-attackers", "end"];
	for (const inspection of [undefined, {}]) {
		const draw = focus(drawFrame, startingIntent(0), { ...(inspection ? { inspection } : {}) });
		assert.deepEqual(draw.plan!.next.map((one) => [one.label, one.when.step, one.status]), [
			["Play Forest", "precombat-main", "outside-window"], ["Cast Hydra", "precombat-main", "outside-window"],
		], "a pilot waiting for main phase sees the required windows even without a current checklist");
		assert.deepEqual(draw.plan!.next.map((one) => one.scheduled), [0, 1].map(() => ({ turn: 1, active: 0, step: "precombat-main", phase: "precombat-main" })));
		assert.doesNotMatch(moveQuestion(draw, true).instructions!, /window is closed/);
		assert.match(moveQuestion(draw, true).instructions!, /plan.next lists later steps with their windows/);
		assert.match(moveQuestion(draw, true).instructions!, /an unrelated option taken now can spend what they need/);
		assert.deepEqual(drawFrame.view.work!.plan!.steps, table.work[0]!.plan!.steps, "slicing pending windows changes no intent");
	}
	const later = focus(drawFrame, startingIntent(0));
	for (const remainingSteps of [undefined, ["draw", "end"], ["draw"]] as const) {
		const missing = structuredClone(drawFrame);
		missing.view.remainingSteps = remainingSteps && [...remainingSteps];
		const packet = focus(missing, startingIntent(0));
		assert.ok(packet.plan!.next.every((one) => !one.scheduled), "no projected matching occurrence means no schedule hint");
		assert.deepEqual(packet.options, later.options, "a skipped window never filters physical options");
	}
	const repeated = structuredClone(drawFrame);
	repeated.view.remainingSteps = ["draw", "draw", "precombat-main", "draw", "precombat-main"];
	assert.deepEqual(focus(repeated, startingIntent(0)).plan!.next, later.plan!.next, "remaining occurrences are searched in order");
	const phaseOnly = structuredClone(drawFrame);
	phaseOnly.view.work!.plan!.steps[0]!.when = { active: "self", phase: "combat" };
	phaseOnly.view.work!.plan!.steps[0]!.action = { option: "pass" };
	assert.equal(focus(phaseOnly, startingIntent(0)).plan!.next[0]!.scheduled!.step, "begin-combat", "phase matching uses the first remaining step of that phase");
	for (const when of [{ active: "opponent" as const, step: "precombat-main" as const }, { fromTurn: 2 }, { throughTurn: 0 }]) {
		const other = structuredClone(drawFrame);
		other.view.work!.plan!.steps[0]!.when = when;
		assert.equal(focus(other, startingIntent(0)).plan!.next[0]!.scheduled, undefined, "another turn is not invented");
	}
	const falseStep = workFrame(table, 0);
	falseStep.view.work!.plan!.steps[0]!.if = { amount: 0, atLeast: 1 };
	falseStep.view.remainingSteps = ["precombat-main", "precombat-main", "end"];
	assert.deepEqual(focus(falseStep, startingIntent(0)).plan!.next.map((one) => [one.status, one.scheduled]), [["condition-false", undefined]], "current false conditions are not reclassified as future work");
	const physical = () => JSON.stringify({ things: [...table.things], cursor: table.cursor, ledger: table.ledger, log: table.log });
	const before = physical(), offered = nextDecision(table), prompts: string[] = [];
	const pilot = aiSeat({ name: "Green", intent: startingIntent(0), onGap: assert.fail, api: { named: "fixture", async ask(request) {
		const question = request.questions.pick!;
		assert.equal(question.type, "choice");
		if (question.type !== "choice") assert.fail();
		prompts.push(question.instructions ?? "");
		const packet = request.state as unknown as Packet;
		assert.equal(Object.hasOwn(question.criteria, "review:hold"), false, "the physical question includes the completion check");
		assert.equal(packet.checklist!.find((one) => one.label === "Play Forest")!.status, STATUS.available);
		assert.equal(packet.checklist!.find((one) => one.label === "Cast Hydra")!.status, STATUS.later);
		assert.equal(packet.checklist!.find((one) => one.kind === "branch")!.status, STATUS["condition-false"]);
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
	for (const [item, verdict] of [["step:0", "act"], ["step:1", "skip"], ["phase:0", "act"]] as const) {
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
	const shownPhase = packet.checklist!.find((one) => one.kind === "phase")!;
	assert.equal(shownPhase.status, STATUS.open);
	assert.equal(shownPhase.judgment!.verdict, "act", "phase assessments remain available without earning action credit");
	assert.equal(Object.hasOwn(shownPhase, "available"), false, "unbound physical options are not phase availability");
	assert.equal(Object.hasOwn(shownPhase, "cards"), false, "unrelated options supply no phase card list");
	assert.ok(checklist(frame).find((one) => one.kind === "phase")!.options.length, "core keeps its private assessment options");
	assert.deepEqual(packet.checklist!.filter((one) => one.kind !== "phase"), checklist(frame).filter((one) => one.kind !== "phase")
		.map(({ options, ...item }) => ({ ...item, status: STATUS[item.status], available: options.length })), "step and branch presentation stays exact, in plain status words");
	const missing = packet.checklist!.find((one) => one.label === "Cast Hydra")!;
	assert.equal(missing.judgment!.verdict, "skip");
	assert.equal(missing.status, STATUS.later, "a recorded skip cannot complete or remove the planned use");
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
	assert.equal(afterLand.checklist!.find((one) => one.label === "Cast Hydra")!.status, STATUS.unavailable);
	assert.deepEqual(afterLand.checklist!.map((one) => one.kind), ["phase", "step", "branch"], "unmentioned cards do not create strategic review jobs");
	assert.ok(afterLand.cards["Mossborn Hydra"], "a completion check retains the unavailable planned card's actual text");
	let asks = 0;
	const help = aiSeat({ name: "Help", intent: startingIntent(0), onGap: assert.fail,
		plan: async () => { throw new Error("Only the help request is being tested"); }, api: { named: "fixture", async ask(request) {
			const question = request.questions.pick!;
			if (question.type !== "choice") assert.fail();
			if (asks++) {
				assert.ok(!Object.hasOwn(question.criteria, "ask:help"), "an answered request is not offered again at the same decision");
				const first = Object.keys(question.criteria).find((id) => id === "pass") ?? Object.keys(question.criteria)[0]!;
				return { pick: { type: "choice", choice: first, confidence: 1, probabilities: { [first]: 1 } } };
			}
			assert.ok(Object.hasOwn(question.criteria, "ask:help"));
			return { pick: { type: "choice", choice: "ask:help", confidence: 1, probabilities: { "ask:help": 1 } } };
		} } });
	const requested = await help.answer(workFrame(table, 0));
	assert.equal(requested.kind, "work"); if (requested.kind !== "work") assert.fail();
	assert.equal(requested.tools[0]!.do, "plan.request");
	const reason = (requested.tools[0] as { reason: string }).reason;
	assert.match(reason, /asked for help at your turn \d+, precombat-main/, "the request names the window the pilot saw");
	assert.match(reason, /The stack is empty\./);
	assert.match(reason, /Cast Hydra/, "the unfinished line is named, not left for the writer to guess");
	assert.equal((await help.answer(workFrame(table, 0))).kind, "pick", "the pilot chooses an actual option after its one request");
	const passing = workFrame(table, 0);
	passing.decision = { ...passing.decision!, options: passing.decision!.options.filter((one) => one.id === "pass") };
	const idle = aiSeat({ name: "Idle", intent: startingIntent(0), onGap: assert.fail, plan: async () => { throw new Error("No plan is asked for"); }, api: { named: "fixture", async ask(request) {
		const question = request.questions.pick!;
		if (question.type !== "choice") assert.fail();
		assert.ok(!Object.hasOwn(question.criteria, "ask:help"), "a decision that can only pass offers no help: no revised plan changes it");
		return { pick: { type: "choice", choice: "pass", confidence: 1, probabilities: { pass: 1 } } };
	} } });
	assert.equal((await idle.answer(passing)).kind, "pick");
	await idle.close();
	await help.close();
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "Wait.", guidance: "Retain the cards.", steps: [] } }], "amend");
	assert.equal(table.work[0]!.reviews, undefined, "a changed plan cannot inherit the old judgment");
	await pilot.close();
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "Keep resources.", guidance: "Use the current policy.", throughTurn: 1, steps: [],
		phases: [{ when: { active: "self", step: "precombat-main" }, guidance: "Keep the hand; reassess a listed response if needed." }] } }], "prose-policy");
	const policyFrame = workFrame(table, 0), policyBefore = structuredClone(policyFrame), corePolicy = checklist(policyFrame);
	const policy = focus(policyFrame, startingIntent(0));
	assert.equal(policy.checklist!.find((one) => one.kind === "phase")!.status, STATUS.policy);
	assert.deepEqual(policy.plan!.script!.guidance, ["Keep the hand; reassess a listed response if needed."]);
	assert.equal(policy.plan!.script!.askWhenDone, undefined);
	assert.doesNotMatch(moveQuestion(policy, true).instructions!, /grants? (no )?pass|passing policy|withholds a pass/, "the pilot is never told when it may pass; the pass option says what passing does");
	assert.deepEqual(policyFrame, policyBefore, "display changes no facts or physical menu");
	assert.deepEqual(checklist(policyFrame), corePolicy, "context does not change the core checklist");
	for (const remainingSteps of [["precombat-main", "declare-attackers"], ["precombat-main", "precombat-main", "end"], ["precombat-main", "end"]] as const) {
		const scheduled = structuredClone(policyFrame);
		scheduled.view.remainingSteps = [...remainingSteps];
		assert.deepEqual(focus(scheduled, startingIntent(0)), policy, "repeated or skipped future steps do not alter current binding status");
	}
	const falseBranch = structuredClone(policyFrame);
	falseBranch.view.work!.plan!.may = structuredClone(frame.view.work!.plan!.may);
	const conditional = focus(falseBranch, startingIntent(0));
	assert.equal(conditional.checklist!.find((one) => one.kind === "phase")!.status, STATUS.open, "a false branch is still an explicit binding");
	assert.equal(conditional.checklist!.find((one) => one.kind === "branch")!.status, STATUS["condition-false"]);
	const expired = structuredClone(policyFrame);
	if (expired.view.window.kind !== "turn") assert.fail();
	expired.view.window.turn = 2;
	assert.equal(focus(expired, startingIntent(0)).checklist, undefined, "expired guidance has no policy row");

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
	assert.equal(land.status, STATUS.waiting);
	assert.equal(land.available, 0, "the land stays unfinished while the spell is on the stack");
	assert.ok(waiting.checklist!.some((one) => one.kind === "branch" && one.available), "an instant response remains available");
	assert.match(moveQuestion(waiting, true).instructions!, /their absence now is no reason to ask for help/);
	const waitingQuestion = moveQuestion(waiting, true);
	assert.match(waitingQuestion.type === "choice" ? waitingQuestion.criteria.pass! : "", /Shock begins resolving/, "the pass option says what passing does while the stack waits");
	const futureOnStack = workFrame(response, 1);
	futureOnStack.view.work!.plan!.steps.push({ label: "Finish attackers", when: { active: "self", step: "declare-attackers" }, action: { option: "attack:done" } });
	const scheduledOnStack = focus(futureOnStack, startingIntent(1));
	assert.equal(scheduledOnStack.plan!.next[0]!.scheduled!.step, "declare-attackers");
	assert.deepEqual(scheduledOnStack.checklist, waiting.checklist, "a future hint leaves current waits and response bindings intact");
	assert.deepEqual(scheduledOnStack.options, waiting.options);
	assert.deepEqual(moveQuestion(scheduledOnStack, true).criteria, moveQuestion(waiting, true).criteria, "the hint grants no new passing policy");
	assert.match(moveQuestion(scheduledOnStack, true).instructions!, /The stack is not empty/);
	const stackPolicyFrame = workFrame(response, 1);
	stackPolicyFrame.view.work!.plan!.steps = []; stackPolicyFrame.view.work!.plan!.may = [];
	const stackPolicy = focus(stackPolicyFrame, startingIntent(1));
	assert.equal(stackPolicy.checklist![0]!.status, STATUS.policy);
	assert.match(moveQuestion(stackPolicy, true).instructions!, /The stack is not empty/);
	assert.deepEqual(stackPolicy.plan!.script!.guidance, waiting.plan!.script!.guidance, "response prose survives policy display");
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
	assert.match(nextDecision(response)!.options.find((one) => one.id === "pass")!.shows!, /Shock begins resolving/);
	apply(response, "pass", "model", "chosen"); finish(response);
	const cleared = focus(workFrame(response, 1), startingIntent(1));
	assert.equal(cleared.checklist!.find((one) => one.id === land.id)?.status, STATUS.available, "resolution restores the land use without a new plan");
	assert.equal(cleared.checklist!.find((one) => one.id === land.id)?.judgment, undefined, "waiting is reassessed against the new position");
	assert.doesNotMatch(moveQuestion(cleared, true).instructions!, /their absence now is no reason to ask for help/, "empty-stack passes still end the step or phase");
	const playLand = checklist(workFrame(response, 1)).find((one) => one.id === land.id)!.options[0]!;
	apply(response, playLand, "model", "chosen", execution(planState(workFrame(response, 1))!, playLand));
	const complete = focus(workFrame(response, 1), startingIntent(1)), phase = complete.checklist!.find((one) => one.kind === "phase")!;
	assert.deepEqual(phase.remaining, [], "phase progress comes from recorded actions");
	assert.equal(phase.status, STATUS.recorded);
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
	assert.match(moveQuestion(resolving, false).instructions, /whose costs are paid/);
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
