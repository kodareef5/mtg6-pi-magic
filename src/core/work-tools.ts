/** The writer for private seat equipment. Card motion has its own commit boundary. */
import { printedTargetless } from "./printed.ts";
import { nextDecision } from "./decisions.ts";
import { project } from "./view.ts";
import { STEPS } from "./steps.ts";
import type { Frame, SeatId } from "./types.ts";
import type { Table } from "./table.ts";
import { emptyWork, type Workspace } from "./work.ts";
import { commands, type WorkCommand, type When } from "./work-language.ts";
import { checkProcedure } from "./procedures.ts";
import type { Package, Plan, PlanOption } from "./language.ts";
import { holds, viewWorld } from "./selectors.ts";
import { matches } from "./query.ts";

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

/**
 * Every problem with a plan against this seat's frame, so one answer can fix them all. Empty means it can be accepted.
 * The arithmetic of costs and land plays is a forecast and not among them: `budget` tells the writer, and the table's payment decides.
 */
export function planProblems(frame: Frame, plan: Plan): string[] {
	const found: string[] = [];
	const visible = (ref: { id: string; incarnation: number }) => (frame.view.objects ?? []).some((object) => object.id === ref.id && object.incarnation === ref.incarnation);
	const option = (one: PlanOption, where: string) => {
		const when = checkWhen(one.when);
		if (when) found.push(`${where} (${one.label}): ${when}`);
		const action = one.action;
		if ("procedure" in action) {
			try { checkProcedure(action.procedure); } catch (error) { found.push(`${where} (${one.label}): ${error instanceof Error ? error.message : String(error)}`); }
			const card = action.procedure.source.card;
			if (action.procedure.timing === "spell" && action.procedure.targets?.length && card && printedTargetless(frame.view.printed?.[card]))
				found.push(`${where} (${one.label}): ${card} is a permanent spell, which has no targets; leave targets out of casting it, and give them to the triggered ability in its package`);
			for (const ref of action.procedure.source.refs ?? []) if (!visible(ref)) found.push(`${where} (${one.label}): object ${ref.id}@${ref.incarnation} is not in your view.`);
		} else {
			if (!action.option && !action.prefix && !action.objects) found.push(`${where} (${one.label}): name an option id, a prefix, or objects.`);
			const misplaced = placement(action.option ?? action.prefix ?? "", one.when);
			if (misplaced) found.push(`${where} (${one.label}): ${misplaced}`);
			for (const ref of action.objects?.refs ?? []) if (!visible(ref)) found.push(`${where} (${one.label}): object ${ref.id}@${ref.incarnation} is not in your view.`);
		}
	};
	plan.steps.forEach((step, at) => option(step, `steps[${at}]`));
	// A window for one turn names whose turn it is; the wrong seat's never opens.
	const at = frame.view.window;
	const whose = (turn: number) => at.kind === "turn" && (frame.view.players?.length ?? 2) === 2 ? ((turn - at.turn) % 2 === 0 ? at.active : 1 - at.active) : undefined;
	const named = [...plan.steps.map((one, n) => [`steps[${n}]`, one] as const), ...(plan.may ?? []).map((one, n) => [`may[${n}]`, one] as const),
		...(plan.askWhen ?? []).flatMap((one, n) => one.when ? [[`askWhen[${n}]`, { label: one.label, when: one.when }] as const] : [])];
	for (const [where, one] of named) {
		const { active, fromTurn, throughTurn } = one.when;
		if (fromTurn === undefined || fromTurn !== throughTurn || (active !== "self" && active !== "opponent")) continue;
		const owner = whose(fromTurn);
		if (owner !== undefined && (owner === frame.seat) !== (active === "self")) found.push(`${where} (${one.label}): turn ${fromTurn} is ${owner === frame.seat ? "your" : "the opponent's"} turn, so a window for ${active === "self" ? "your" : "the opponent's"} turn on it never opens`);
	}
	const scope = { world: viewWorld(frame.view), controller: frame.seat };
	for (const stop of plan.askWhen ?? []) {
		try { holds(scope, stop.if); } catch (error) { found.push(`askWhen "${stop.label}": ${error instanceof Error ? error.message : String(error)}`); }
		const window = stop.when && checkWhen(stop.when);
		if (window) found.push(`askWhen "${stop.label}": ${window}`);
	}
	(plan.may ?? []).forEach((branch, at) => option(branch, `may[${at}]`));
	for (const pack of plan.packages ?? []) { const wrong = packageProblem(frame, pack); if (wrong) found.push(wrong); }
	return found;
}

/**
 * Where the table lists each kind of option, so a step cannot wait for an
 * option its window never offers. Mulligan choices are never part of a plan.
 */
const PLACES: { prefix: string; steps?: string[]; active?: "self" | "opponent"; never?: string }[] = [
	{ prefix: "keep", never: "the mulligan is decided before any plan, from the brief's opening policy" },
	{ prefix: "mulligan", never: "the mulligan is decided before any plan, from the brief's opening policy" },
	{ prefix: "bottom", never: "the mulligan is decided before any plan, from the brief's opening policy" },
	{ prefix: "discard:", never: "discarding to hand size happens in cleanup, which has no priority" },
	{ prefix: "attack:", steps: ["declare-attackers"], active: "self" },
	{ prefix: "block:", steps: ["declare-blockers"], active: "opponent" },
	{ prefix: "assign:", steps: ["combat-damage"] },
	{ prefix: "land:", steps: ["precombat-main", "postcombat-main"], active: "self" },
	{ prefix: "cast:", steps: ["precombat-main", "postcombat-main"], active: "self" },
];
function placement(id: string, when: When): string | null {
	const place = PLACES.find((one) => id.startsWith(one.prefix));
	if (!place) return null;
	if (place.never) return `${id} is never a plan step: ${place.never}.`;
	if (!when.step || !place.steps!.includes(when.step)) return `${place.prefix} options are listed only in ${place.steps!.join(" or ")}; give the step that window.`;
	if (place.active && when.active !== place.active) return `${place.prefix} options are listed only on ${place.active === "self" ? "your own" : "the opponent's"} turn; set when.active to "${place.active}".`;
	return null;
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
				// A stop fires when its fact becomes true in its window: one that holds there already waits until it has been false, or the window has closed.
				const scope = { world: viewWorld(frame.view), controller: frame.seat };
				const waiting = (tool.plan.askWhen ?? []).filter((stop) => (!stop.when || matches(stop.when, frame)) && holds(scope, stop.if)).map((stop) => stop.label);
				if (waiting.length) work.unarmed = waiting; else delete work.unarmed;
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
			case "plan.keep": work.accepted = frame.version; delete work.request; break;
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
