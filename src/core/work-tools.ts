/** The writer for private seat equipment. Card motion has its own commit boundary.
 * Past 150 lines because validation and application are one atomic tool batch.
 */
import { occurrence, overdue, review, positionStamp } from "./agenda.ts";
import { candidates, brokenReserves } from "./draft.ts";
import { nextDecision } from "./decisions.ts";
import { project } from "./view.ts";
import { STEPS } from "./steps.ts";
import type { Frame, SeatId } from "./types.ts";
import type { Table } from "./table.ts";
import { emptyWork, type Workspace } from "./work.ts";
import { commands, type DraftStep, type WorkCommand, type When } from "./work-language.ts";
import { checkProcedure } from "./procedures.ts";

export function workFrame(table: Table, seat: SeatId): Frame {
	const decision = nextDecision(table);
	return { seat, version: table.cursor.clock, view: project(table, seat),
		...(decision?.seat === seat ? { decision } : {}) };
}

function checkWhen(when: When): void {
	if (when.step && !STEPS[when.step as keyof typeof STEPS].priority) throw new Error("Seat checks require a step with priority.");
	if (when.step && when.phase && STEPS[when.step as keyof typeof STEPS].phase !== when.phase) throw new Error("The scheduled step belongs to a different phase.");
	if (when.fromTurn !== undefined && when.throughTurn !== undefined && when.fromTurn > when.throughTurn) throw new Error("The schedule ends before it starts.");
}

/** Build an accepted next workspace without writing anything. Refusals are atomic. */
export function prepareWork(frame: Frame, input: unknown): Workspace {
	const tools = commands(input);
	const work = structuredClone(frame.view.work ?? emptyWork());
	const visibleRef = (ref: { id: string; incarnation: number }) => {
		if (!(frame.view.objects ?? []).some((object) => object.id === ref.id && object.incarnation === ref.incarnation)) {
			throw new Error(`Object ${ref.id}@${ref.incarnation} is not in this seat's view.`);
		}
	};
	const checkStep = (step: DraftStep) => {
		checkWhen(step.when);
		if ("procedure" in step.action) {
			checkProcedure(step.action.procedure);
			step.action.procedure.source.refs?.forEach(visibleRef);
		} else step.action.objects?.refs?.forEach(visibleRef);
	};
	for (const tool of tools) {
		switch (tool.do) {
			case "task.put": {
				checkWhen(tool.task.when);
				tool.task.scope.refs?.forEach(visibleRef);
				if (new Set(tool.task.concerns).size !== tool.task.concerns.length || new Set(tool.task.concepts).size !== tool.task.concepts.length) throw new Error("A review cannot repeat a concern or concept.");
				work.tasks = work.tasks.filter((task) => task.id !== tool.task.id);
				work.tasks.push({ ...tool.task, runs: [] });
				break;
			}
			case "task.cancel": {
				const task = work.tasks.find((task) => task.id === tool.id);
				if (!task) throw new Error(`No scheduled check ${tool.id}.`);
				task.cancelled = true;
				break;
			}
			case "recipe.put":
				tool.recipe.steps.forEach(checkStep);
				tool.recipe.reserves.forEach((reserve) => visibleRef(reserve.object));
				work.recipes = work.recipes.filter((recipe) => recipe.id !== tool.recipe.id);
				work.recipes.push(tool.recipe);
				break;
			case "label.put":
				visibleRef(tool.object);
				work.labels = work.labels.filter((label) => !(label.object.id === tool.object.id && label.object.incarnation === tool.object.incarnation && label.role === tool.role));
				work.labels.push({ object: tool.object, role: tool.role, purpose: tool.purpose });
				break;
			case "label.remove":
				work.labels = work.labels.filter((label) => !(label.object.id === tool.object.id && label.object.incarnation === tool.object.incarnation && label.role === tool.role));
				break;
			case "review.answer": {
				const task = work.tasks.find((task) => task.id === tool.task);
				const due = task && review(task, frame, work);
				if (!task || !due || due.occurrence !== tool.occurrence || due.stamp !== tool.stamp) throw new Error("This review is no longer the pending assessment.");
				const ids = due.items.map((item) => item.id);
				if (Object.keys(tool.answers).length !== ids.length || ids.some((id) => !due.choices.some((choice) => choice.id === tool.answers[id]))) throw new Error("A review needs one listed disposition for every concern; none were recorded.");
				if (Object.values(tool.answers).includes("rethink")) {
					work.request = `${task.label}: the prepared guidance did not settle ${Object.entries(tool.answers).filter(([, choice]) => choice === "rethink").map(([id]) => id).join(", ")}`;
					break;
				}
				task.runs = task.runs.filter((run) => run.occurrence !== due.occurrence);
				task.runs.push({ occurrence: due.occurrence, stamp: due.stamp, answers: tool.answers });
				for (const choice of Object.values(tool.answers)) {
					if (choice.startsWith("recipe:") && !work.suggested.includes(choice.slice(7))) work.suggested.push(choice.slice(7));
				}
				break;
			}
			case "task.expire": {
				const task = work.tasks.find((task) => task.id === tool.id);
				if (!task || !overdue(task, frame)) throw new Error("This check has not missed its deadline.");
				task.expired = true;
				break;
			}
			case "draft.start": {
				if (work.draft && work.draft.next < work.draft.steps.length) throw new Error("Parked or active work must be cancelled before replacing its draft.");
				const recipe = work.recipes.find((recipe) => recipe.id === tool.recipe);
				if (!recipe) throw new Error(`No recipe ${tool.recipe}.`);
				work.draft = { ...structuredClone(recipe), id: `${recipe.id}-${work.revision + 1}`, recipe: recipe.id, next: 0, status: "editing" };
				work.suggested = work.suggested.filter((id) => id !== recipe.id);
				break;
			}
			case "draft.bind": {
				const option = work.draft && candidates(work.draft, frame).find((option) => option.id === tool.option);
				if (!work.draft || !option) throw new Error("This binding is not a candidate for the current draft step.");
				work.draft.bound = tool.option;
				work.draft.boundObjects = structuredClone(option.objects ?? []);
				work.draft.status = "editing";
				delete work.draft.parked;
				break;
			}
			case "draft.edit":
				if (!work.draft) throw new Error("There is no draft to edit.");
				tool.steps.forEach(checkStep);
				work.draft.steps = [...work.draft.steps.slice(0, work.draft.next), ...tool.steps];
				if (tool.reserves) { tool.reserves.forEach((reserve) => visibleRef(reserve.object)); work.draft.reserves = tool.reserves; }
				if (tool.guidance) work.draft.guidance = tool.guidance;
				delete work.draft.bound;
				delete work.draft.boundObjects;
				delete work.draft.parked;
				work.draft.status = "editing";
				break;
			case "draft.ready":
				if (!work.draft || brokenReserves(work.draft, frame).length || !candidates(work.draft, frame).some((option) => option.id === work.draft!.bound)) throw new Error("Ready requires a current binding and intact reserves.");
				work.draft.status = "ready";
				work.draft.readyStamp = positionStamp(frame);
				break;
			case "draft.park":
				if (!work.draft) throw new Error("There is no draft to park.");
				work.draft.parked = occurrence(frame);
				break;
			case "draft.cancel":
				delete work.draft;
				break;
			case "suggestion.dismiss":
				if (!work.suggested.includes(tool.recipe)) throw new Error("This recipe has not been nominated.");
				work.suggested = work.suggested.filter((id) => id !== tool.recipe);
				break;
			case "interpretation.put": {
				const { procedure } = tool.interpretation, card = procedure.source.card;
				checkProcedure(procedure);
				if (!card || procedure.source.refs) throw new Error("An interpretation selects its card by name, not a particular object.");
				if (!frame.view.decks?.find((deck) => deck.seat === frame.seat)?.cards[card] && !frame.view.printed?.[card]) throw new Error(`${card} is not in this seat's view or registered list.`);
				work.interpretations = [...(work.interpretations ?? []).filter((entry) => entry.id !== tool.interpretation.id), structuredClone(tool.interpretation)];
				break;
			}
			case "interpretation.missing":
				work.missing = [...(work.missing ?? []).filter((entry) => entry.card !== tool.card), { card: tool.card, text: tool.text }];
				break;
			case "plan.request": work.request = tool.reason; break;
			case "plan.accept": work.objective = tool.objective; delete work.request; break;
		}
	}
	for (const task of work.tasks) for (const id of task.recipes) {
		if (!work.recipes.some((recipe) => recipe.id === id)) throw new Error(`Check ${task.id} names missing recipe ${id}.`);
	}
	work.revision += 1;
	for (const task of work.tasks) {
		const seen = new Set<string>([task.id]);
		let dependency = task.after;
		while (dependency) {
			if (seen.has(dependency.task)) throw new Error("Scheduled checks cannot depend on each other in a cycle.");
			seen.add(dependency.task);
			const predecessor = work.tasks.find((other) => other.id === dependency!.task);
			if (!predecessor) throw new Error(`No predecessor check ${dependency.task}.`);
			dependency = predecessor.after;
		}
	}
	return work;
}

/** Record an accepted edit. The caller never writes private state directly. */
export function recordWork(table: Table, seat: SeatId, workspace: Workspace, actionId: string, note: string, tools?: WorkCommand[]): void {
	table.work[seat] = structuredClone(workspace);
	table.workLog.push({ seq: table.workLog.length, at: table.ledger.length, clock: table.cursor.clock, seat, actionId, note, ...(tools ? { tools: structuredClone(tools) } : {}), workspace: structuredClone(workspace) });
}

export function editWork(table: Table, seat: SeatId, tools: WorkCommand[], actionId: string, revision = table.work[seat]?.revision ?? 0): boolean {
	if (!table.seats.some((at) => at.id === seat)) throw new Error(`No seat ${seat}.`);
	const previous = table.workLog.find((entry) => entry.seat === seat && entry.actionId === actionId);
	if (previous) {
		if (JSON.stringify(previous.tools) !== JSON.stringify(tools)) throw new Error("This actionId already names different seat tools.");
		return false;
	}
	if ((table.work[seat]?.revision ?? 0) !== revision) throw new Error("The seat equipment changed before this answer; inspect it again.");
	recordWork(table, seat, prepareWork(workFrame(table, seat), tools), actionId, tools.map((tool) => tool.do).join(", "), tools);
	return true;
}

/** Called only after the listed action actually committed. */
export function completedStep(table: Table, seat: SeatId, actionId: string): void {
	const work = advanceDraft(table.work[seat]!);
	recordWork(table, seat, work, actionId, `Executed step ${work.draft!.next} of ${work.draft!.label}`);
}

/** Progress is attributable to an executed ledger row, not a readiness answer. */
export function advanceDraft(current: Workspace): Workspace {
	const work = structuredClone(current);
	if (!work?.draft) throw new Error("No executing draft.");
	work.draft.next += 1;
	delete work.draft.bound;
	delete work.draft.boundObjects;
	delete work.draft.parked;
	work.draft.status = "editing";
	work.revision += 1;
	return work;
}
