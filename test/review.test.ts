/** Considered: reviewing each use guides a seat without moving cards or hiding options. */
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
import { reviewQuestion } from "../src/context/review.ts";
import { announce, example, finish, main, matchup, passBoth, place } from "./play.ts";
import { question as moveQuestion } from "../src/context/seat.ts";

test("a pilot reviews unfinished uses before acting, with private judgments that expire and replay", async () => {
	const position = () => {
		const table = matchup("review");
		place(table, 0, "hand", "Forest", "Forest");
		return table;
	};
	const table = position();
	main(table, 0);
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "Develop and keep protection.", guidance: "Play a Forest. Cast Hydra when affordable.", steps: [
		{ label: "Play Forest", when: { active: "self", step: "precombat-main" }, action: { prefix: "land:", objects: { card: "Forest", zones: ["hand"] } } },
		{ label: "Cast Hydra", when: { active: "self", step: "precombat-main" }, action: { prefix: "cast:", objects: { card: "Mossborn Hydra", zones: ["hand"] } } },
	], phases: [{ when: { active: "self", step: "precombat-main" }, goal: "Develop without spending protection.", guidance: "Play Forest; do not invent extra mana." }] } }], "plan");
	const physical = () => JSON.stringify({ things: [...table.things], cursor: table.cursor, ledger: table.ledger, log: table.log });
	const before = physical(), offered = nextDecision(table), prompts: string[] = [];
	const pilot = aiSeat({ name: "Green", intent: startingIntent(0), onGap: assert.fail, api: { named: "fixture", async ask(request) {
		const question = request.questions.pick!;
		assert.equal(question.type, "choice");
		if (question.type !== "choice") assert.fail();
		prompts.push(question.instructions ?? "");
		const packet = request.state as unknown as Packet;
		const pending = packet.checklist?.find((one) => !one.judgment);
		const review = Object.hasOwn(question.criteria, "review:hold");
		if (!review && pending) {
			assert.ok(packet.checklist!.some((one) => one.label === "Play Forest" && one.judgment?.verdict === "act"));
			assert.ok(packet.checklist!.some((one) => one.label === "Cast Hydra" && !one.judgment), "the first action is offered before reviewing a later unavailable step");
		}
		const choice = review ? pending!.options.length ? "review:act" : "review:skip" : pending ? "pass" : packet.options.find((one) => one.id.startsWith("land:"))!.id;
		assert.ok(Object.hasOwn(question.criteria, choice));
		return { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } };
	} } });
	const items = checklist(workFrame(table, 0));
	assert.ok(items.some((one) => one.label === "Cast Hydra" && !one.options.length), "an unavailable planned use stays visible");
	assert.ok(items.some((one) => one.kind === "phase"), "the phase strategy itself receives a judgment");
	assert.throws(() => editWork(table, 0, [{ do: "review.record", item: "step:1", verdict: "act", reason: "Use Hydra" }], "unavailable"), /has no current option/);
	assert.throws(() => editWork(table, 0, [{ do: "review.record", item: "made-up", verdict: "skip", reason: "Skip" }], "unknown"), /No checklist item/);
	assert.equal(JSON.stringify(items).includes('"zone":"library"'), false);
	for (let at = 0; checklist(workFrame(table, 0)).some((one) => !one.judgment); at++) {
		assert.ok(at <= items.length, "reviews and one completion request are finite");
		const answer = await pilot.answer(workFrame(table, 0));
		assert.equal(answer.kind, "work");
		if (answer.kind !== "work") assert.fail();
		editWork(table, 0, answer.tools, answer.actionId, answer.revision);
		assert.equal(editWork(table, 0, answer.tools, answer.actionId, answer.revision), false, "redelivery is idempotent");
		assert.equal(physical(), before, "review moves no cards, clock, priority or ledger");
		assert.deepEqual(nextDecision(table), offered, "every physical option remains available");
	}
	assert.equal(checklist(workFrame(table, 0)).filter((one) => !one.judgment).length, 0);
	assert.equal(table.work[0]!.finishReview, table.cursor.clock, "asking to pass first requests completion review");
	assert.deepEqual(workFrame(table, 0).view.done, [], "a review never completes a step");
	assert.equal(project(table, 1).work?.reviews, undefined, "another seat cannot read these judgments");
	assert.equal(project(table, "spectator").work, undefined);
	assert.throws(() => editWork(table, 0, [{ do: "review.record", item: "step:0", verdict: "act", reason: "Again" }], "duplicate-review"), /already reviewed/);
	const frame = workFrame(table, 0), packet = focus(frame, startingIntent(0));
	const missing = packet.checklist!.find((one) => one.label === "Cast Hydra")!;
	assert.equal(missing.judgment!.verdict, "skip");
	assert.match(reviewQuestion(packet, missing, true).instructions!, /unfinished, not completed/);
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
	assert.equal(prompts.length, items.length + 2, "one call per review, a completion request, then a separate physical choice");
	apply(table, answer.option, "model", "chosen", execution(planState(frame)!, answer.option));
	assert.ok(checklist(workFrame(table, 0)).every((one) => !one.judgment), "an action invalidates judgments from the old position");
	const afterLand = focus(workFrame(table, 0), startingIntent(0));
	assert.match(reviewQuestion(afterLand, afterLand.checklist![0]!, true).instructions!, /Recorded plan actions: Play Forest/, "reviews carry execution progress alongside the unchanged phase guidance");
	const unused = afterLand.checklist!.find((one) => one.kind === "card" && one.cards.includes("Forest") && !one.options.length)!;
	assert.ok(unused, "the spare Forest stays on the checklist after spending the land play");
	assert.match(reviewQuestion(afterLand, unused, true).instructions!, /not itself an unfinished plan step/, "a card review does not invent an obligation to use it");
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "Wait.", guidance: "Retain the cards.", steps: [] } }], "amend");
	assert.equal(table.work[0]!.reviews, undefined, "a changed plan cannot inherit the old judgment");
	await pilot.close();

	const response = matchup("review-response");
	place(response, 1, "hand", "Shock", "Shock", "Mountain"); place(response, 1, "battlefield", "Mountain", "Mountain");
	main(response, 1, 2);
	editWork(response, 1, [{ do: "plan.put", plan: { objective: "Use Shock before the land play.", guidance: "Let Shock resolve, then play Mountain. Keep the other Shock for a response.", steps: [
		{ label: "Play Mountain", when: { active: "self", step: "precombat-main" }, action: { prefix: "land:", objects: { card: "Mountain", zones: ["hand"] } } },
	], may: [{ label: "Respond with Shock", when: { active: "any" }, action: { procedure: example("Cast Shock") } }] } }], "land-after-spell");
	editWork(response, 0, [{ do: "plan.put", plan: { objective: "Keep resources.", guidance: "Respond if needed.", steps: [] } }], "respond");
	announce(response, example("Cast Shock"), (one) => one.activation.targets[0]!.some((target) => "player" in target && target.player === 0));
	const waiting = focus(workFrame(response, 1), startingIntent(1)), land = waiting.checklist!.find((one) => one.id === "step:0")!;
	assert.equal(waiting.checklist![0]!.kind, "response", "consider the stack before the next land play");
	assert.deepEqual(land.options, [], "the land stays unfinished while the spell is on the stack");
	assert.ok(waiting.checklist!.some((one) => one.kind === "branch" && one.options.length), "an instant response remains available");
	assert.match(reviewQuestion(waiting, land, true).instructions!, /absence alone does not require a new plan/);
	assert.ok(Object.hasOwn(reviewQuestion(waiting, land, true).criteria, "ask:help"), "waiting does not prevent reporting a separate conflict");
	assert.match(moveQuestion(waiting, true).instructions!, /does not end the phase/);
	editWork(response, 1, [{ do: "review.record", item: land.id, verdict: "hold", reason: "Wait for the spell to resolve." }], "wait-for-stack");
	apply(response, "pass", "model", "chosen");
	assert.equal(nextDecision(response)!.seat, 0);
	assert.ok(checklist(workFrame(response, 0)).some((one) => one.kind === "response" && one.cards.includes("Shock")), "the nonactive seat explicitly considers a stack response");
	const pending = structuredClone(response);
	editWork(response, 0, [{ do: "review.record", item: "response", verdict: "skip", reason: "Let this spell resolve." }], "let-resolve");
	assert.deepEqual(response.cursor, pending.cursor, "agreeing in the review does not pass priority");
	assert.deepEqual(response.ledger, pending.ledger);
	assert.match(nextDecision(response)!.options.find((one) => one.id === "pass")!.shows!, /top stack object begins resolving/);
	apply(response, "pass", "model", "chosen"); finish(response);
	const cleared = focus(workFrame(response, 1), startingIntent(1));
	assert.ok(cleared.checklist!.find((one) => one.id === land.id)?.options.length, "resolution restores the land use without a new plan");
	assert.equal(cleared.checklist!.find((one) => one.id === land.id)?.judgment, undefined, "waiting is reassessed against the new position");
	assert.doesNotMatch(moveQuestion(cleared, true).instructions!, /absence alone does not require a new plan/, "empty-stack passes still end the step or phase");

	const fetch = matchup("review-fetch");
	place(fetch, 0, "battlefield", "Fabled Passage"); main(fetch, 0);
	editWork(fetch, 0, [{ do: "plan.put", plan: { objective: "Develop.", guidance: "Stale guidance about preserving a Forest in hand.", steps: [] } }], "old-plan");
	announce(fetch, example("Crack Fabled Passage for a basic land")); passBoth(fetch);
	const resolving = focus(workFrame(fetch, 0), startingIntent(0));
	assert.ok(resolving.cards["Fabled Passage"], "a sacrificed source keeps its card text in the resolving decision");
	assert.match(resolving.resolving!.basis, /Search your library/);
	assert.ok(resolving.objects.some((one) => one.effect?.some((line) => line.includes("Search your library"))), "accepted stack instructions survive compact projection");
	assert.equal(resolving.plan, undefined, "a new turn's casting guidance cannot displace an already resolving use");
	assert.match(moveQuestion(resolving, false).instructions, /already resolving and its costs were paid/);
	assert.doesNotMatch(moveQuestion(resolving, false).instructions, /Stale guidance/);
	assert.ok(resolving.options.some((one) => one.label.includes("Decline")), "declining the search remains the seat's choice");
});
