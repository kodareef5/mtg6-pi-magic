/**
 * One planner builds on the pregame brief and the seat's last plan. The same
 * short answer is used ahead of the turn, after its draw, and on an escalation.
 * Past 150 lines to keep its prompt, reference tools and validation together.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Table } from "../core/table.ts";
import { nextDecision } from "../core/decisions.ts";
import type { Frame } from "../core/types.ts";
import { NoteEditsSchema, type NoteEdit, type WorkCommand } from "../core/work-language.ts";
import type { Prepared } from "./seat.ts";
import type { Objection } from "../core/player.ts";
import { planProblems, prepareWork } from "../core/work-tools.ts";
import { type Package, type Plan, type Registration } from "../core/language.ts";
import { lookups } from "./brief.ts";
import type { Lookup, Reasoner } from "./reason.ts";
import { planReason } from "../core/planning.ts";
import { budget } from "../core/budget.ts";
import { ChangesSchema, actions, basePlan, changedPlan } from "./plan-edit.ts";
import { facts, chancing, initialPlan, nextMana, type Context } from "./strategy-facts.ts";

/** Retained for comparing call policies; it does not start a session. */
export function worthPlanning(table: Table): boolean {
	const decision = nextDecision(table);
	return decision?.situation === "priority" && decision.options.length > 1;
}

const docs = join(import.meta.dirname, "..", "..", "docs");
export const exampleIndex = readFileSync(join(docs, "examples", "README.md"), "utf8").trim();
const examples = [...exampleIndex.matchAll(/^\| `([^`]+\.md)` \|/gm)].map((match) => match[1]!);
/** The language's semantics stay in the cached prefix; worked examples are fetched only when needed. */
export const syntaxReference = (): string => readFileSync(join(docs, "SYNTAX.md"), "utf8").trim();
export const exampleReference: Lookup = {
	name: "example", description: "Read a worked use of the syntax. Examples describe accepted terms, not certified card interpretations.",
	parameters: { type: "object", properties: { file: { type: "string", enum: examples } }, required: ["file"], additionalProperties: false },
	answer: (args) => examples.includes(String(args.file)) ? readFileSync(join(docs, "examples", String(args.file)), "utf8") : `Choose one of: ${examples.join(", ")}.`,
};

// Recursive JSON Schema belongs in local validation and prompt text. Advertising
// it as a tool schema caused the provider to count over 430,000 input tokens.
const SUBMIT = {
	name: "submit",
	description: "Update the base plan with only changed fields. Omitted fields stay; lists replace whole lists and [] clears one, except packages join by card name. {} keeps the base. Reuse an action with {reuse: its key under actions}. Optional notes edit topics in the same answer. Acceptance proves neither card meaning nor playing strength.",
	parameters: { type: "object", properties: {
		objective: { type: "string" }, guidance: { type: "string" },
		...Object.fromEntries(["steps", "may", "askWhen", "holds", "phases", "packages"].map((name) => [name, { type: "array", items: { type: "object" } }])),
		notes: NoteEditsSchema,
		objection: { type: "object", properties: { row: { type: "integer" }, claim: { type: "string", minLength: 1 }, rule: { type: "string" } }, required: ["row", "claim"], additionalProperties: false },
	}, additionalProperties: false },
};

const SYSTEM = [
	"You strategize for one Magic seat. A small, fast pilot, Jev, executes your plan. The pregame brief is your matchup analysis: build on it instead of researching the deck again.",
	"Choose the best line from the current position. Check both clocks, the opponent's best reply, and the last window to answer its threats. Compare developing now with keeping a response. Use registered counts and earned knowledge for odds, never assume a hidden card or order.",
	"Before submitting, check mana across the whole line, holds and spending restrictions; the order in which permanents enter and triggers happen; targets; attacks and blocks. The table checks physical payments and structured terms. It does not certify card meaning or expert play.",
	"",
	"YOUR ANSWER",
	"- base is your plan to update. Submit changed fields directly: no plan or changes wrapper. Omitted fields stay, a list replaces that list, [] clears it. Packages join by card name instead. Keep sound objective, guidance, phases and responses. Your new turn's base has no ordered steps; write the line for this turn. A midturn base already omits completed steps. Do not put them back.",
	"- actions holds accepted card procedures from preparation, your current line and earlier executed actions. A step's action can be {\"reuse\":\"prepared:0\"}, {\"reuse\":\"worked:0\"} or another listed key. It copies that action exactly, including selectors and costs. Choose among the prepared uses; write a changed action only when its targets, cost or effect actually differ. These are model-authored terms, not certified card interpretations.",
	"- packages persist in private work. Card abilities are assessed before play, including flying, haste, mana, entry counters, triggers and static permissions. Use that accepted equipment. Submit a corrected package only when its interpretation was wrong; changing a strategic line does not change a card's abilities. Registrations quote the card's own text. A package does not choose an activated ability: announce that as a procedure when you intend to pay for it; mana abilities can be registered.",
	"- notes is optional [{topic, note}]. Add only a useful new conclusion or correction; an empty note retires a topic. Notes do not require another call. The notebook is memory, not a task to fill. Do not restate the brief or unchanged facts.",
	"",
	"WHAT JEV NEEDS",
	"- steps: ordered actions, each with label, when and action. option is an exact listed id such as pass or attack:done. prefix matches ids beginning with land:, cast:, attack: or block:, with objects selecting the card. land and cast are not ids. Write lands, spells, attacks, blocks and responses; prose alone does not offer an action. Essential means the line fails if that step cannot be taken.",
	"- phases: [{when, goal, guidance, reevaluate}]. Give the current main phases, combat and the opponent's turn clear decisions and sequencing, including trigger targets and searches. Keep unchanged scripts. reevaluate names only an unexpected threat or opportunity that changes the line; routine events belong in guidance or branches.",
	"- may: conditional standing responses or alternative lines. Cover likely draw classes that change the line, rather than one branch per registered card. holds keeps sources for a purpose. askWhen stops on a visible fact that makes the line impossible; it must not cause routine replanning.",
	"- Use active self/opponent and step names for windows. Leave absolute turn numbers out unless necessary. Untap, the turn draw and cleanup discard happen through the rules, not plan steps.",
	"- A normal non-Aura permanent is cast: for its printed cost, without targets or resolution instructions. Its abilities come from its package. Instants and sorceries need procedures. Do not give a creature spell its trigger's targets.",
	"- cards already gives the full text of the cards in this position and registered lists. Do not look those cards up again. A procedure states source, claim, basis, timing, any alternative or added cost, targets and instructions. Copy basis from the card. Do not invent a simpler effect. Look up a rule or example only when needed to resolve uncertainty.",
	"- Combat is sequential: attack: or block: per creature, then attack:done or block:done. Jev handles listed trigger, resolution and damage choices with your phase guidance. It escalates if the plan cannot answer them.",
	"",
	"Object only to a listed opponent action that broke a rule or misread a card: objection {row, claim, rule}. Poor play is not grounds. A judge may rewind the game.",
	'An example of the answer shape: {"guidance":"Play the land before the permanent.","steps":[{"label":"Play Forest","when":{"active":"self","step":"precombat-main"},"action":{"prefix":"land:","objects":{"zones":["hand"],"controller":"self","card":"Forest"}}},{"label":"Cast Llanowar Elves","when":{"active":"self","step":"precombat-main"},"action":{"prefix":"cast:","objects":{"zones":["hand"],"controller":"self","card":"Llanowar Elves"}}}]}. Choose steps for your actual hand and resources. The accepted card package already supplies the mana ability.',
	"Call submit once with the updates. You may look up a needed fact first. If refused, correct all named problems together. Keep the answer short because Jev reads the conclusions, not your analysis.",
	"",
	syntaxReference(),
	"",
	"The complete update schema below is checked locally. The tool advertises only its top-level fields. Follow these definitions for nested terms; a schema match does not certify card meaning.",
	JSON.stringify(ChangesSchema),
].join("\n");

/** Interpreter checks: activated effects need procedures, and cast selectors must reach the stack. */
export function registrationProblems(packages: readonly Package[]): string[] {
	const found: string[] = [];
	const selectors = (value: unknown, card: string): void => {
		if (!value || typeof value !== "object") return;
		const term = value as { on?: string; history?: string; of?: { zones?: string[] } };
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
async function write(frame: Frame, context: Context, reasoner: Pick<Reasoner, "work">, task: string, about: string,
	options: { prepared?: Prepared; nextTurn?: boolean; changed?: string[]; signal?: AbortSignal } = {}): Promise<Prepared & { objection?: Objection }> {
	const base = !options.prepared && !frame.view.work?.plan && context.brief ? initialPlan(context.brief)
		: basePlan(frame, options.prepared?.plan, options.nextTurn);
	const available = actions(frame, options.prepared?.plan);
	let forecastTold = false;
	let accepted: Prepared & { objection?: Objection } | undefined;
	const carried = options.prepared?.edits ?? [];
	await reasoner.work(about, { system: SYSTEM, user: facts(frame, context, { base, actions: available,
		...(options.nextTurn ? { forecast: { assumes: "Normal untap, current abilities retained, and no opponent action changes these sources. Nonpersistent floating mana expires. The draw is unknown.", mana: nextMana(frame) } } : {}),
		...(options.changed ? { changed: options.changed } : {}), ...(carried.length ? { pendingNotes: carried } : {}), examples }), task }, {
		submit: { ...SUBMIT, check(args) {
			const { notes, objection: raised, ...changes } = args;
			let plan: Plan;
			try { plan = changedPlan(base, changes, available); } catch (error) { return String(error); }
			const objection = raised as Objection | undefined;
			const edits = [...carried, ...(Array.isArray(notes) ? notes as NoteEdit[] : [])];
			const wrong = [...planProblems(frame, plan), ...registrationProblems(plan.packages ?? [])];
			if (!frame.view.work?.plan && !options.prepared && !plan.steps.length && !plan.may?.length)
				wrong.push('The initial plan has no actions. Write the line, or explicitly choose passing with a step whose action is {"option":"pass"}.');
			if (notes !== undefined && !Array.isArray(notes)) wrong.push("notes is a list of {topic, note} edits.");
			if (objection && (!Number.isInteger(objection.row) || !frame.view.actions?.some((one) => one.row === objection.row) || typeof objection.claim !== "string" || !objection.claim || (objection.rule !== undefined && typeof objection.rule !== "string"))) wrong.push("An objection names a row under view.actions and says why it broke a rule.");
			if (options.nextTurn && objection) wrong.push("Preparation cannot object to an action; raise it from the current decision.");
			// Core validates the same complete answer, including notebook capacity.
			try { prepareWork(frame, putting({ plan, ...(edits.length ? { edits } : {}) })); } catch (error) { wrong.push(String(error)); }
			if (!wrong.length && !forecastTold) { const conflicts = budget(frame, plan); if (conflicts.length) { forecastTold = true; wrong.push(...conflicts); } }
			if (wrong.length) return `${wrong.length} problems: ${[...new Set(wrong)].join("; ")}.`;
			accepted = { plan, ...(edits.length ? { edits } : {}), ...(objection ? { objection } : {}) };
			return null;
		} },
		lookups: [exampleReference, chancing(frame), ...(context.cards ? lookups(context.cards, context.rules) : [])], turns: 3,
		...(options.signal ? { signal: options.signal } : {}),
	});
	if (!accepted) throw new Error("Strategy returned without a checked plan.");
	return accepted;
}

/** Expand to ordinary atomic work edits. The journal stores full accepted terms, never reuse keys. */
export const putting = (made: Prepared): WorkCommand[] => [{ do: "plan.put", plan: made.plan },
	...(made.edits?.length ? [{ do: "notebook.edit" as const, edits: made.edits }] : [])];

export async function planWork(frame: Frame, context: Context, reasoner: Pick<Reasoner, "work">, prepared?: Prepared, changed?: string[]): Promise<{ tools: WorkCommand[]; objection?: Objection }> {
	const request = planReason(frame);
	if (!request) throw new Error("Strategy needs an explicit request or a due turn plan.");
	const task = `YOUR TASK: ${request}\n${prepared ? "Amend the prepared base for the revealed draw and the changes. Keep what still fits." : "Advance the pregame strategy from this position; write only what changes."}\nSubmit the line, mana commitments and phase decisions through the opponent's next turn. Check them together before submitting.`;
	const about = frame.view.work?.request ? "plan on request" : prepared ? "turn amendment" : "turn plan";
	const made = await write(frame, context, reasoner, task, about, { ...(prepared ? { prepared } : {}), ...(changed ? { changed } : {}) });
	return { tools: putting(made), ...(made.objection ? { objection: made.objection } : {}) };
}

/** Prepare once during the opponent's turn, without changing the table or seeing a future draw. */
export async function prepareTurn(frame: Frame, context: Context, reasoner: Pick<Reasoner, "work">, signal?: AbortSignal): Promise<Prepared> {
	const at = frame.view.window;
	if (at.kind !== "turn" || at.active === frame.seat) throw new Error("Prepare the next own turn during the opponent's turn.");
	return write(frame, context, reasoner, `YOUR TASK: PREPARE YOUR NEXT TURN, ${at.turn + 1}, during the opponent's turn ${at.turn}.\nBuild on the brief and your standing defaults. Write the next line, allocate mana and retained responses, and keep phase decisions ready for Jev. Anticipate normal opposing play and likely draw classes with conditional branches. The next draw is unknown. Notes are optional; submit once, with no separate research or note-taking pass.`,
		"preparation", { nextTurn: true, ...(signal ? { signal } : {}) });
}
