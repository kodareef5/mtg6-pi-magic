/** The writer for private seat equipment. Card motion has its own commit boundary. */
import { nextDecision } from "./decisions.ts";
import { project } from "./view.ts";
import { STEPS } from "./steps.ts";
import type { Frame, SeatId } from "./types.ts";
import type { Table } from "./table.ts";
import { emptyWork, type Workspace } from "./work.ts";
import { commands, type WorkCommand, type When } from "./work-language.ts";
import { checkProcedure } from "./procedures.ts";
import type { Package, Plan, PlanOption } from "./language.ts";

export function workFrame(table: Table, seat: SeatId): Frame {
	const decision = nextDecision(table);
	return { seat, version: table.cursor.clock, view: project(table, seat),
		...(decision?.seat === seat ? { decision } : {}) };
}

/** A window a plan can use: a step that has priority, in its own phase, in a turn range that does not end before it starts. */
export function checkWhen(when: When): string | null {
	if (when.step && !STEPS[when.step as keyof typeof STEPS].priority) return `${when.step} has no priority, so nothing can be done in it.`;
	if (when.step && when.phase && STEPS[when.step as keyof typeof STEPS].phase !== when.phase) return `${when.step} belongs to a different phase than ${when.phase}.`;
	if (when.fromTurn !== undefined && when.throughTurn !== undefined && when.fromTurn > when.throughTurn) return "the window ends before it starts.";
	return null;
}

/** Every problem with a plan against this seat's frame, so one answer can fix them all. Empty means it can be accepted. */
export function planProblems(frame: Frame, plan: Plan): string[] {
	const found: string[] = [];
	const visible = (ref: { id: string; incarnation: number }) => (frame.view.objects ?? []).some((object) => object.id === ref.id && object.incarnation === ref.incarnation);
	const option = (one: PlanOption, where: string) => {
		const when = checkWhen(one.when);
		if (when) found.push(`${where} (${one.label}): ${when}`);
		const action = one.action;
		if ("procedure" in action) {
			try { checkProcedure(action.procedure); } catch (error) { found.push(`${where} (${one.label}): ${error instanceof Error ? error.message : String(error)}`); }
			for (const ref of action.procedure.source.refs ?? []) if (!visible(ref)) found.push(`${where} (${one.label}): object ${ref.id}@${ref.incarnation} is not in your view.`);
		} else {
			if (!action.option && !action.prefix && !action.objects) found.push(`${where} (${one.label}): name an option id, a prefix, or objects.`);
			for (const ref of action.objects?.refs ?? []) if (!visible(ref)) found.push(`${where} (${one.label}): object ${ref.id}@${ref.incarnation} is not in your view.`);
		}
	};
	plan.steps.forEach((step, at) => option(step, `steps[${at}]`));
	(plan.may ?? []).forEach((branch, at) => option(branch, `may[${at}]`));
	for (const pack of plan.packages ?? []) { const wrong = packageProblem(frame, pack); if (wrong) found.push(wrong); }
	return found;
}

const packageProblem = (frame: Frame, pack: Package) => !frame.view.decks?.find((deck) => deck.seat === frame.seat)?.cards[pack.card] && !frame.view.printed?.[pack.card]
	? `package ${pack.card}: that card is not in your view or registered list.` : null;
const withPackages = (current: Package[] = [], added: Package[] = []) =>
	[...current.filter((entry) => !added.some((one) => one.card === entry.card)), ...structuredClone(added)];

/** Build an accepted next workspace without writing anything. Refusals are atomic. */
export function prepareWork(frame: Frame, input: unknown): Workspace {
	const tools = commands(input);
	const work = structuredClone(frame.view.work ?? emptyWork());
	for (const tool of tools) {
		switch (tool.do) {
			case "plan.put": {
				const problems = planProblems(frame, tool.plan);
				if (problems.length) throw new Error(`The plan has ${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems.join("; ")}.`);
				work.plan = structuredClone(tool.plan);
				work.planned = work.revision + 1;
				work.packages = withPackages(work.packages, tool.plan.packages);
				work.accepted = frame.version;
				delete work.request;
				break;
			}
			case "package.put": {
				const wrong = packageProblem(frame, tool.package);
				if (wrong) throw new Error(wrong);
				work.packages = withPackages(work.packages, [tool.package]);
				break;
			}
			case "plan.request": work.request = tool.reason; break;
			case "plan.each-turn": work.eachTurn = true; break;
		}
	}
	work.revision += 1;
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
