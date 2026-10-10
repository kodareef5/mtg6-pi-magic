/**
 * One planner builds on the pregame brief and the seat's last plan. The same
 * short answer is used ahead of the turn, after its draw, and on an escalation.
 * Past 150 lines to keep reference tools, session orchestration and validation together.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Frame } from "../core/types.ts";
import { NoteEditsSchema, type NoteEdit, type WorkCommand } from "../core/work-language.ts";
import type { Prepared } from "./seat.ts";
import type { Objection } from "../core/player.ts";
import { planProblems, prepareWork } from "../core/work-tools.ts";
import { type Condition, type Package, type Plan, type Registration } from "../core/language.ts";
import { holds, viewWorld } from "../core/selectors.ts";
import { matches } from "../core/query.ts";
import { lookups } from "./brief.ts";
import type { Lookup, Reasoner } from "./reason.ts";
import { planReason } from "../core/planning.ts";
import { budget, castAttackers, paymentForecast } from "../core/budget.ts";
import { ChangesSchema, ResponseSchema, actions, basePlan, changedPlan, conditionProblems, equipment, labelled, responseChanges, submissionFields, selectionFields } from "./plan-edit.ts";
import { actionFacts, bindingFacts, choiceProblems, planFacts, planningChoices } from "./strategy-actions.ts";
import { chancing, initialPlan, planningFrame, type Context } from "./strategy-facts.ts";
import { findingsSection, questions, surveyPosition } from "./survey.ts";
import { growthReport, growthSection } from "./growth.ts";
import { branchReports, branchesSection } from "./branches.ts";
import { perspectiveReports, reportsSection } from "./perspectives.ts";
import { dossier } from "./dossier.ts";
import { matchupExamples } from "./dossier-strategy.ts";
import { ASSESSMENT, RESPONSE_ROLLUP, ROLLUP, coordinatorAsk, coordinatorSystem, responseSystem, workSections } from "./coordinator.ts";
import { combatLookup } from "./strategy-combat.ts";

const docs = join(import.meta.dirname, "..", "..", "docs");
export const exampleIndex = readFileSync(join(docs, "examples", "README.md"), "utf8").trim();
const examples = [...exampleIndex.matchAll(/^\| `([^`]+\.md)` \|/gm)].map((match) => match[1]!);
/** Card assessment reads the full semantics. Strategy fetches them when changing accepted terms. */
export const syntaxReference = (): string => readFileSync(join(docs, "SYNTAX.md"), "utf8").trim();
export const syntaxLookup: Lookup = {
	name: "syntax", description: "Read the full card procedure language before changing a procedure or package. Ordinary plans and conditions are already defined in your prompt; reusing accepted actions needs no lookup. Shape validation does not certify a card's interpretation.",
	parameters: { type: "object", properties: {}, additionalProperties: false },
	answer: () => `${syntaxReference()}\n${JSON.stringify(ChangesSchema)}`,
};
// Ordinary planning reads visible counts, life and history. Instruction-local
// bindings and library references belong in the full syntax lookup, not here.
const planningDefs = ChangesSchema.$defs;
export const planReference = { $ref: "#/$defs/Condition", $defs: {
	Condition: { anyOf: planningDefs.Condition.anyOf.filter((one) => !("bound" in one.properties) && !("is" in one.properties)) },
	Amount: { anyOf: planningDefs.Amount.anyOf.filter((one) => one.type === "integer" || Object.keys(one.properties ?? {}).some((key) => ["count", "life", "history", "sum", "negate", "distinct"].includes(key))) },
	Selector: { ...planningDefs.Selector, properties: Object.fromEntries(Object.entries(planningDefs.Selector.properties).filter(([key]) => !["is", "attachedTo", "linked", "other"].includes(key))) } } };
export const exampleReference: Lookup = {
	name: "example", description: "Read a worked use of the syntax. Examples describe accepted terms, not certified card interpretations.",
	parameters: { type: "object", properties: { file: { type: "string", enum: examples } }, required: ["file"], additionalProperties: false },
	answer: (args) => examples.includes(String(args.file)) ? readFileSync(join(docs, "examples", String(args.file)), "utf8") : `Choose one of: ${examples.join(", ")}.`,
};

// Recursive JSON Schema belongs in local validation and prompt text. Advertising
// it as a tool schema caused the provider to count over 430,000 input tokens.
/** Field names of the writer's assessment and rollups; none is a plan field. */
const ASSESSMENT_FIELDS = new Set(["hand", "zones", "opponents", "combat", "combinations", "rollup", "corrections", "adopted", "win", "priorities", "threat", "answers"]);

const SUBMIT = {
	name: "submit",
	description: "Update the base plan with only changed fields. Omitted fields stay; lists replace whole lists and [] clears one, except phases, which replace by window, and packages, which join by card name. Reuse an action with {reuse: its key under actions}. Optional notes edit topics in the same answer. Acceptance proves neither card meaning nor playing strength.",
	parameters: { type: "object", properties: {
		...submissionFields,
		notes: NoteEditsSchema,
		objection: { type: "object", properties: { row: { type: "integer" }, claim: { type: "string", minLength: 1 }, rule: { type: "string" } }, required: ["row", "claim"], additionalProperties: false },
	}, additionalProperties: false },
};

const SYSTEM = coordinatorSystem(JSON.stringify(planReference));
const REPAIR_SYSTEM = coordinatorSystem(JSON.stringify(planReference), false);
const RESPONSE_SYSTEM = responseSystem(JSON.stringify(ResponseSchema));
const FORECAST = "It shows your next upkeep after a normal untap, before the unknown draw and any upkeep effects. Your permanents survive and untap with their current characteristics; floating mana that does not persist is gone. It does not predict the opponent's actions or other effects before then.";

/** Interpreter checks: activated effects need procedures, and cast selectors must reach the stack. */
export function registrationProblems(packages: readonly Package[]): string[] {
	const found: string[] = [];
	const selectors = (value: unknown, card: string): void => {
		if (!value || typeof value !== "object") return;
		const term = value as { on?: string; history?: string; of?: { zones?: string[] }; spendOnly?: { zones?: string[] } };
		if (term.spendOnly && !term.spendOnly.zones?.length)
			found.push(`package ${card}: spendOnly needs explicit zones. Casting checks the spell on the stack; activation checks its source. Omitted zones silently select battlefield.`);
		if ((term.on === "cast" || term.history === "cast") && term.of && !term.of.zones?.includes("stack"))
			found.push(`package ${card}: a cast ${term.on ? "event" : "history"} selector needs zones ["stack"]. Omitted zones mean battlefield, so this selector matches no cast spell.`);
		Object.values(value).forEach((one) => selectors(one, card));
	};
	const visit = (registrations: Registration[], card: string) => {
		for (const one of registrations) {
			if (one.kind !== "mana" && /^[^."]*(\{[^}]+\}|\bSacrifice\b|\bPay \d+ life\b)[^."]*:\s/.test(one.basis))
				found.push(`package ${card}: ${JSON.stringify(one.basis)} is an activated ability; announce it as a procedure, not a registration. Only mana abilities are registered.`);
			if (one.kind === "continuous" && one.change.registers) visit(one.change.registers, card);
		}
	};
	for (const pack of packages) { visit(pack.registers, pack.card); selectors(pack, pack.card); }
	return found;
}

/** One session, with one validation path for an initial plan, preparation or amendment. */
async function write(frame: Frame, context: Context, reasoner: Pick<Reasoner, "work"> & Partial<Pick<Reasoner, "think">>, task: string, about: string,
	options: { prepared?: Prepared; nextTurn?: boolean; changed?: string[]; signal?: AbortSignal } = {}): Promise<Prepared & { objection?: Objection }> {
	const base = basePlan(frame, options.prepared?.plan, options.nextTurn, context.brief ? initialPlan(context.brief) : undefined);
	const at = frame.view.window;
	const available = actions(frame, base, options.nextTurn && at.kind === "turn" ? at.turn + 1 : undefined);
	let forecastTold = false;
	let accepted: Prepared & { objection?: Objection } | undefined;
	const carried = options.prepared?.edits ?? [];
	const baseProblems = planProblems(frame, base);
	const responding = !options.nextTurn && at.kind === "turn" && at.active !== frame.seat && !!frame.view.work?.request && !!frame.view.work.plan;
	// The current-window editor preserves other steps. It cannot repair invalid
	// inherited work there; expose the existing full editor so the seat can.
	const response = responding && !baseProblems.length;
	const fields: Record<string, unknown> = selectionFields(available, response);
	const keep = { type: "string", enum: ["keep"], description: "Retain this field from the displayed base plan exactly. Refused when there is nothing to retain; does not certify that it still fits." };
	const wholeOpponent = (plan: Plan) => plan.phases?.filter((one) => one.when.active === "opponent" && !one.when.step && !one.when.phase) ?? [];
	const submit = { ...SUBMIT, ...(response ? { description: "Repair the current decision. current actions bind to this exact turn and step; unaffected steps stay. Guidance and holds replace their old fields. This updates intent, never executes a move or certifies the strategy." } : {}),
		...(!responding ? { description: `${SUBMIT.description} steps and theirTurn are required: replace each or explicitly write \"keep\".` } : {}),
		parameters: { ...SUBMIT.parameters, properties: { assessment: response && context.survey ? RESPONSE_ROLLUP : context.survey ? ROLLUP : ASSESSMENT, ...fields,
			...(!responding ? { steps: { anyOf: [fields.steps, keep] }, theirTurn: { anyOf: [submissionFields.theirTurn, keep] } } : {}), notes: NoteEditsSchema, objection: SUBMIT.parameters.properties.objection },
			required: ["assessment", ...(response ? ["current"] : responding ? [] : ["steps", "theirTurn"])] } };
	const decision = !options.nextTurn && frame.decision ? ` The decision in front of the pilot: ${frame.decision.question}` : "";
	const request = responding ? `${frame.view.work?.request}\nRepair this response or combat decision and the rest of the opponent's turn. Your next turn is prepared separately, so do not write its line. Keep the phase policies this decision does not touch.${response ? "" : " The inherited plan is invalid. Use the full changed fields to remove or replace every invalid commitment, including steps outside this window; omitted fields stay."}${decision}`
		: `${task}${decision}`;
	const resources = paymentForecast(frame, base);
	const scoped: "preparation" | "response" | "turn" = options.nextTurn ? "preparation" : responding ? "response" : "turn";
	// Analysts judge the position before the coordinator reconciles their findings with prior intent.
	const planned = planningFrame(frame, scoped);
	const input = { frame: planned, ...(options.nextTurn ? { forecast: { from: frame, assumptions: FORECAST } } : {}),
		...(context.brief ? { brief: context.brief } : {}), ...(context.cards ? { cards: context.cards } : {}), ...(context.recaps ? { recaps: context.recaps } : {}), scope: scoped };
	const doc = dossier(input), facts = dossier(input, "analyst");
	// Own turns and preparations branch on each first action beside the focused questions; branches cover the attack and its order.
	// An invalid inherited response keeps the outlooks; a valid one asks three questions.
	const branching = !!context.survey && !responding;
	const only = response ? ["opponent", "defense", "removal"] : branching ? questions(planned).map(([source]) => source).filter((source) => !["attack", "ordering", "zones"].includes(source)) : undefined;
	const [findings, branched, growth] = await Promise.all([context.survey ? surveyPosition(planned, facts, reasoner, options.signal, only) : undefined,
		branching ? branchReports(planned, facts, available, reasoner, options.signal) : undefined,
		branching ? growthReport(facts, reasoner, options.signal) : undefined]);
	const reported = findings && !response && !branching ? await perspectiveReports(facts, findings, reasoner, options.signal) : undefined;
	const work = workSections({ base: planFacts(base), problems: [...baseProblems, ...conditionProblems(base), ...resources.conflicts],
		...(resources.responses.length ? { funding: resources.responses } : {}), bindings: bindingFacts(frame, base, options.nextTurn),
		actions: actionFacts(frame, available, options.nextTurn && at.kind === "turn" ? at.turn + 1 : undefined),
		...(options.changed ? { changed: options.changed } : {}), ...(carried.length ? { pendingNotes: carried } : {}),
		...(!options.nextTurn && frame.decision ? { choices: planningChoices(frame) } : {}), ...(frame.refused?.length ? { refused: frame.refused } : {}),
		...(findings ? { analysts: [...(growth ? [growthSection(growth)] : []), ...(branched ? [branchesSection(branched)] : []), findingsSection(findings), ...(reported ? [reportsSection(reported)] : [])] } : {}) });
	await reasoner.work(about, { system: response ? RESPONSE_SYSTEM : responding ? REPAIR_SYSTEM : SYSTEM, user: doc, task: `${work}\n\n${coordinatorAsk(request, scoped, response)}` }, {
		submit: { ...submit, check(args) {
			if (!responding) {
				const missing = ["steps", "theirTurn"].filter((key) => args[key] === undefined);
				if (missing.length) return `Explicitly keep or replace ${missing.join(" and ")}. An assessment alone cannot change the actions Jev follows. No equipment changed.`;
				if (args.steps === "keep" && !base.steps.length) return 'steps: "keep" needs unfinished steps in the displayed base plan. Write the actions instead.';
				if (args.theirTurn === "keep" && !wholeOpponent(base).length) return 'theirTurn: "keep" needs a whole-opponent-turn policy in the displayed base plan. Write {guidance, complete} instead.';
			}
			// assessment is the writer's own working: kept in the trace, never in the plan or the pilot's packet.
			// objective and guidance are audit fields the schema no longer offers; the assessment fills whichever is not written.
			// Assessment fields written beside the plan fields are still the writer's working, not plan content.
			const stray = Object.fromEntries(Object.entries(args).filter(([key]) => ASSESSMENT_FIELDS.has(key)));
			const { notes, objection: raised, assessment: written, theirTurn: disposition, objective, guidance, ...rest } = args;
			const theirTurn = !responding && disposition === "keep" ? undefined : disposition;
			if (!responding && rest.steps === "keep") delete rest.steps;
			const changes = labelled(Object.fromEntries(Object.entries(rest).filter(([key]) => !ASSESSMENT_FIELDS.has(key))), available);
			const assessment = Object.keys(stray).length ? { ...(written && typeof written === "object" ? written : {}), ...stray } : written;
			if (theirTurn !== undefined && (!theirTurn || typeof theirTurn !== "object" || Array.isArray(theirTurn))) return "theirTurn is {guidance, complete}.";
			let plan: Plan;
			try {
				const edited = response ? responseChanges(frame, base, changes) : changes as Record<string, unknown>;
				const turn = theirTurn as { guidance?: unknown; complete?: unknown } | undefined;
				const whole = turn ? [{ when: { active: "opponent" }, guidance: turn.guidance, complete: turn.complete }] : [];
				plan = changedPlan(base, { ...edited, ...audit(assessment), ...(typeof objective === "string" && objective ? { objective } : {}), ...(typeof guidance === "string" && guidance ? { guidance } : {}), ...(whole.length ? { phases: [...(Array.isArray(edited.phases) ? edited.phases : []), ...whole] } : {}) }, available);
				if (!responding && disposition === "keep" && !isDeepStrictEqual(wholeOpponent(plan), wholeOpponent(base))) return 'theirTurn: "keep" conflicts with a phases edit to the whole-opponent-turn policy. Replace theirTurn explicitly.';
			} catch (error) { return String(error); }
			plan.throughTurn = base.throughTurn;
			const objection = raised as Objection | undefined;
			const edits = [...carried, ...(Array.isArray(notes) ? notes as NoteEdit[] : [])];
			const wrong = [...planProblems(frame, plan), ...choiceProblems(frame, changes, options.nextTurn), ...registrationProblems(plan.packages ?? []),
				...stopProblems(planned, changes.askWhen)];
			if (!plan.steps.length && (options.nextTurn || !frame.view.work?.plan && !options.prepared && !plan.may?.length))
				wrong.push('This turn has no ordered actions. Write the known line, or explicitly choose passing with a step whose action is {"option":"pass"}. Conditional branches do not replace the known turn line.');
			if (notes !== undefined && !Array.isArray(notes)) wrong.push("notes is a list of {topic, note} edits.");
			if (objection && (!Number.isInteger(objection.row) || !frame.view.actions?.some((one) => one.row === objection.row) || typeof objection.claim !== "string" || !objection.claim || (objection.rule !== undefined && typeof objection.rule !== "string"))) wrong.push("An objection names a row under view.actions and says why it broke a rule.");
			if (options.nextTurn && objection) wrong.push("Preparation cannot object to an action; raise it from the current decision.");
			// Core validates the same complete answer, including notebook capacity.
			try { prepareWork(frame, putting({ plan, ...(edits.length ? { edits } : {}) })); } catch (error) { wrong.push(String(error)); }
			if (!wrong.length && !forecastTold) { const conflicts = [...budget(frame, plan), ...castAttackers(frame, plan)]; if (conflicts.length) { forecastTold = true; wrong.push(...conflicts); } }
			if (wrong.length) return `${wrong.length} problems: ${[...new Set(wrong)].join("; ")}. These describe your proposed plan. No action was executed; the position and resources in the request are unchanged.`;
			accepted = { plan, ...(edits.length ? { edits } : {}), ...(objection ? { objection } : {}) };
			return null;
		} },
		// A fourth reply lets a winning line survive a refusal over a side problem.
		lookups: [syntaxLookup, equipment(frame, available), combatLookup(frame), exampleReference, chancing(frame), matchupExamples(context.brief), ...(context.cards ? lookups(context.cards, context.rules) : [])], turns: 4,
		// Retry a stalled request without replacing its task, model, or plan. Over about 830 coordinator calls the
		// p99 was 23-28s and the slowest success 40.4s, so a call still waiting at 45s is treated as stalled.
		timeoutMs: 45_000,
		...(options.signal ? { signal: options.signal } : {}),
	});
	if (!accepted) throw new Error("Strategy returned without a checked plan.");
	return accepted;
}

/** The writer's assessment becomes the plan's audit rationale; Jev reads neither. */
function audit(assessment: unknown): { objective?: string; guidance?: string } {
	const working = assessment && typeof assessment === "object" ? assessment as Record<string, unknown> : {};
	const rollup = working.rollup && typeof working.rollup === "object" ? working.rollup as Record<string, unknown> : working;
	const first = Array.isArray(rollup.priorities) ? rollup.priorities.find((one) => typeof one === "string" && one.trim()) : undefined;
	const why = [rollup.win, rollup.threat].find((one) => typeof one === "string" && one.trim());
	return { ...(first ? { objective: first as string } : {}), ...(why ? { guidance: why as string } : {}) };
}

/** A stop that already holds where it is watched would fire at once. */
function stopProblems(frame: Frame, written: unknown): string[] {
	if (!Array.isArray(written)) return [];
	const scope = { world: viewWorld(frame.view), controller: frame.seat };
	return written.flatMap((one, at) => {
		const stop = one as { label?: string; when?: Parameters<typeof matches>[0]; if?: Condition };
		// Nothing happens between the planned upkeep and the draw but the draw, so a stop watched there is judged now too.
		const early = stop?.when?.active === "self" && (stop.when.step === "upkeep" || stop.when.step === "draw");
		if (!stop?.if || stop.when && !matches(stop.when, frame) && !early) return [];
		try { return holds(scope, stop.if) ? [`askWhen[${at}] "${stop.label ?? ""}" is already true in the planned position, so it would stop the pilot at once. A stop names a visible fact that is false now and would make the line impossible.`] : []; }
		catch { return []; }
	});
}

/** Expand to ordinary atomic work edits. The journal stores full accepted terms, never reuse keys. */
export const putting = (made: Prepared): WorkCommand[] => [{ do: "plan.put", plan: made.plan },
	...(made.edits?.length ? [{ do: "notebook.edit" as const, edits: made.edits }] : [])];

export async function planWork(frame: Frame, context: Context, reasoner: Pick<Reasoner, "work"> & Partial<Pick<Reasoner, "think">>, prepared?: Prepared, changed?: string[]): Promise<{ tools: WorkCommand[]; objection?: Objection }> {
	const request = planReason(frame);
	if (!request) throw new Error("Strategy needs an explicit request or a due turn plan.");
	const repair = !!frame.view.work?.request && !!frame.view.work.plan;
	const responding = frame.view.window.kind === "turn" && frame.view.window.active !== frame.seat;
	const task = `${request}\n${repair ? `Answer the request from the current window. Change what the conflict requires, and replace stale guidance and phase decisions along with the actions. ${responding ? "An answer with only assessment keeps the line when nothing needs to change." : 'Explicitly keep or replace steps and theirTurn.'}`
		: prepared || changed ? "Amend the plan you are editing for the listed changes since it was prepared or accepted. Keep what still fits and replace what the changes contradict." : "Build on your matchup plan from this position and write only what changes."}`;
	const about = frame.view.work?.request ? "plan on request" : prepared || changed ? "turn amendment" : "turn plan";
	const made = await write(frame, context, reasoner, task, about, { ...(prepared ? { prepared } : {}), ...(changed ? { changed } : {}) });
	return { tools: putting(made), ...(made.objection ? { objection: made.objection } : {}) };
}

/** Prepare once during the opponent's turn, without changing the table or seeing a future draw. */
export async function prepareTurn(frame: Frame, context: Context, reasoner: Pick<Reasoner, "work"> & Partial<Pick<Reasoner, "think">>, signal?: AbortSignal): Promise<Prepared> {
	const at = frame.view.window;
	if (at.kind !== "turn" || at.active === frame.seat) throw new Error("Prepare the next own turn during the opponent's turn.");
	return write(frame, context, reasoner, `Prepare your next turn: turn ${at.turn + 1} on the table counter, your own turn ${Math.ceil((at.turn + 1) / 2)}, while the opponent plays turn ${at.turn}. The table turn number is not your land count or mana.\nThe dossier is a forecast of that turn, with your known hand and no draw. Write its ordered line and useful responses. Inherited phase prose can name old cards or costs, so keep only the decisions that fit the forecast. Cover the draws that would change the line with conditions on your hand. Notes are optional; submit once.`,
		"preparation", { nextTurn: true, ...(signal ? { signal } : {}) });
}
