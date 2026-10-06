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
import { ChangesSchema, actions, basePlan, changedPlan, equipment } from "./plan-edit.ts";
import { actionFacts, bindingFacts, planFacts } from "./strategy-actions.ts";
import { facts, chancing, initialPlan, nextMana, type Context } from "./strategy-facts.ts";

/** Retained for comparing call policies; it does not start a session. */
export function worthPlanning(table: Table): boolean {
	const decision = nextDecision(table);
	return decision?.situation === "priority" && decision.options.length > 1;
}

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
const planReference = { $ref: ChangesSchema.$ref, $defs: { Changes: ChangesSchema.$defs.Changes, Option: ChangesSchema.$defs.Option,
	Condition: ChangesSchema.$defs.Condition, Amount: ChangesSchema.$defs.Amount, Selector: ChangesSchema.$defs.Selector } };
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
	"Organize a line using brief.policies and their worked examples. Match the position to their applicability and priorities, bind the actual sources and targets, then check their reconsider conditions. A policy is guidance, not proof it fits. Spend new strategic reasoning on changed facts or an uncovered case. Check both clocks and the last answer window before committing resources. Use registered counts and earned knowledge for odds, never assume a hidden card or order.",
	"Evaluate a win available now before development or a defensive reserve. Name the action and damage that can finish, or the visible obstacle that prevents it. A reserve must name an actual card or ability and its useful window; an unknown future draw is not itself a response. Release holds when the winning line needs them.",
	"Read view.window, view.remainingSteps, objects, mana and choices first. They describe now. base is earlier intent and can be wrong; baseProblems names known defects to repair. Completed windows cannot be used again this turn unless remainingSteps contains them. A postcombat cast cannot attack in the preceding combat. Repair contradictions across guidance, steps, phase scripts and holds together; do not preserve prose about an action already resolved or a restriction that has ended.",
	"Before submitting, check mana across the whole line, holds and spending restrictions; the order in which permanents enter and triggers happen; targets; attacks and blocks. Current offers state manaRequired and untappedSourcesAfterPayment. Use those counts; do not invent a leftover source. State resource holds and their release condition, then let Jev select the payment. The table checks physical payments and structured terms. It does not certify card meaning or expert play.",
	"Each visible creature's summoningSick is the current restriction, read from its controller's turn and haste. False does not establish that an attack is legal or useful. A watch's matchingNow names visible objects meeting its selector now, not events or guaranteed future triggers.",
	"watches lists registered triggers on visible permanents now. A permanent cannot see events that finished before it entered; its own entry can trigger it. A watch's you and this refer to its source's controller and source. Distinguish forecasts from events already recorded in view.history.",
	"",
	"YOUR ANSWER",
	"- base is your plan to update. Submit changed fields directly: no plan or changes wrapper. Omitted fields stay, a list replaces that list, [] clears it. Packages join by card name instead. Keep sound objective, guidance, phases and responses. Your new turn's base has no ordered steps; write the line for this turn. A midturn base already omits completed steps. Do not put them back.",
	"- actions describes accepted uses by their claim, quoted card meaning, source, cost and targets. Set action.reuse to the exact listed key, including its readable name. A normal cast and an alternate-cost cast are different uses. Prefer prepared: or printed: keys for spells and activations; an old step may bind an obsolete payment or target. Reuse copies the accepted executable body unchanged. equipment reads that body when an interpretation needs inspection. These terms were prepared by a model, not certified as correct.",
	"- packages persist in private work. Standing abilities are assessed before play. Some spell effects and activations remain identified in deferred until their source is available; a separate interpretation call prepares them before the pilot acts. Use accepted actions instead of rewriting their meaning as part of strategy. Correct a package only when its interpretation was wrong; a new line does not change a card's abilities. Registrations quote the card's own text. printedCast selects the shared ordinary permanent cast; set it false if a correction needs a special casting procedure.",
	"- notes is optional [{topic, note}]. Add only a useful new conclusion or correction; an empty note retires a topic. Notes do not require another call. The notebook is memory, not a task to fill. Do not restate the brief or unchanged facts.",
	"",
	"WHAT JEV NEEDS",
	"- steps: ordered actions, each with label, when and action. option is an exact listed id such as pass or attack:done. prefix matches ids beginning with land:, cast:, attack: or block:, with objects selecting the card. land and cast are not ids. Write lands, spells, attacks, blocks and responses; prose alone does not offer an action. Essential means the line fails if that step cannot be taken.",
	"- Give a step or response a purpose when its later choices need direction: for a fetch, name the land and intended landfall; for removal, name the threatened object and desired result. purpose is preserved for resolution even if you amend the plan afterward. An announcement is recorded before its effect resolves.",
	"- Acknowledge the selected policy and its concrete decision in guidance or the relevant phase script: action order, resources left, response window and exception. A holds query reserves EVERY matching object. To reserve one source, use objects.refs with its exact id and incarnation; a card-name query reserves all copies. Bind future draw branches to the visible hand after the draw, never to an unknown library object. Spending-restricted mana may develop a creature while unrestricted mana remains for a response. Check the actual restrictions. If a resource is lost, use the covered alternative before requesting another plan.",
	"- Sequence prerequisites and continuations explicitly. A landfall beneficiary must resolve before the land enters; a search carries the chosen land and trigger purpose through its resolution. Waiting for that stack to resolve is not a broken line. Do not repeat an activation already pending on the same target.",
	"- Give opening bottom, combat, search and optional-instruction choices a policy with a visible exception. Compare the hand left after bottoming. A ground blocker cannot stop a flying threat without flying or reach; a flying defender can still block a ground attacker. Use current characteristics.",
	"- Repair the unfinished line and its guidance together. history names actions already taken this turn; do not reintroduce them when the new base omits completed steps. Phase instructions should say what to do while an effect is pending and after it resolves, not keep ordering an already completed activation.",
	"- phases: [{when, goal, guidance, reevaluate}]. Give the current main phases, combat and the opponent's turn clear decisions and sequencing, including trigger targets and searches. Keep unchanged scripts. reevaluate names only an unexpected threat or opportunity that changes the line; routine events belong in guidance or branches.",
	"- may: conditional standing responses or alternative lines. Cover likely draw classes that change the line, rather than one branch per registered card. holds keeps sources for a purpose. askWhen stops on a visible fact that makes the line impossible; it must not cause routine replanning.",
	"- Use active self/opponent and step names for windows. active means whose TURN it is, not whose choice. currentWindow is the exact when for a response now: copy it for a pending-spell response. Leave absolute turn numbers out unless necessary. Untap, the turn draw and cleanup discard happen through the rules, not plan steps.",
	"- A normal non-Aura permanent is cast: for its printed cost, without targets or resolution instructions. Its abilities come from its package. Instants and sorceries need procedures. Do not give a creature spell its trigger's targets.",
	"- choices.options lists direct decisions such as land plays, blocks and passes. choices.uses describes available spell and activation modes with explicit locked costs and target bindings, without payment combinations. Use action.reuse for that mode, then state target priorities and exact resource holds. Jev selects the offered target and payment; do not copy a payment id into a reusable turn line.",
	"- cards gives the full text of visible cards. Registered lists remain in view.decks; use card or equipment for an absent card when it matters. Use syntax only before changing a procedure or package; ordinary sequencing and conditions are defined below and need no card reinterpretation.",
	"- Combat is sequential: attack: or block: per creature, then attack:done or block:done. Jev handles listed trigger, resolution and damage choices with your phase guidance. It escalates if the plan cannot answer them.",
	"",
	"Object only to a listed opponent action that broke a rule or misread a card: objection {row, claim, rule}. Poor play is not grounds. A judge may rewind the game.",
	"Call submit once with the updates. You may look up a needed fact first. If refused, correct all named problems together. Give Jev the final consistent conclusion, not a running calculation followed by a correction. Remove superseded statements before submitting.",
	"",
	"The definitions below cover ordinary plans and conditions. Procedure and Package definitions are available through syntax when you need to change card terms. The complete schema is checked locally.",
	JSON.stringify(planReference),
].join("\n");

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
async function write(frame: Frame, context: Context, reasoner: Pick<Reasoner, "work">, task: string, about: string,
	options: { prepared?: Prepared; nextTurn?: boolean; changed?: string[]; signal?: AbortSignal } = {}): Promise<Prepared & { objection?: Objection }> {
	const base = !options.prepared && !frame.view.work?.plan && context.brief ? initialPlan(context.brief)
		: basePlan(frame, options.prepared?.plan, options.nextTurn);
	const available = actions(frame, base);
	const visible = new Set((frame.view.objects ?? []).flatMap((one) => one.card ? [one.card] : []));
	const relevant = Object.fromEntries(Object.entries(available).filter(([, one]) => {
		const card = "procedure" in one.action ? one.action.procedure.source.card : one.action.objects?.card;
		return !card || visible.has(card);
	}));
	let forecastTold = false;
	let accepted: Prepared & { objection?: Objection } | undefined;
	const carried = options.prepared?.edits ?? [];
	const at = frame.view.window;
	const response = !options.nextTurn && at.kind === "turn" && at.active !== frame.seat && !!frame.view.work?.request;
	const current = at.kind === "turn" ? `Current decision: ${at.active === frame.seat ? "your" : "the opponent's"} turn ${at.turn}, ${at.step}. You are seat ${frame.seat}. ${frame.decision?.question ?? "You are preparing while the other seat acts."}` : "";
	const scope = response ? "Repair this response or combat decision and the affected remainder of the opponent's current turn. Do not write the next own turn's line: its scheduled preparation and draw amendment handle that. Keep unaffected phase policies; change the actions, holds and guidance needed for this decision." : task;
	await reasoner.work(about, { system: SYSTEM, user: facts(frame, context, { base: planFacts(base), baseProblems: [...planProblems(frame, base), ...budget(frame, base)], bindings: bindingFacts(frame, base), actions: actionFacts(frame, relevant),
		...(options.nextTurn ? { forecast: { assumes: "Normal untap, current abilities retained, and no opponent action changes these sources. Creatures you retain cease to be summoning-sick when your next turn begins. Nonpersistent floating mana expires. The draw is unknown.", mana: nextMana(frame) } } : {}),
		...(options.changed ? { changed: options.changed } : {}), ...(carried.length ? { pendingNotes: carried } : {}), examples }, response ? "response" : "turn"),
		task: `${response ? `YOUR TASK: ${frame.view.work?.request}\n` : ""}${scope}\n${current}` }, {
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
			if (wrong.length) return `${wrong.length} problems: ${[...new Set(wrong)].join("; ")}. These describe your proposed plan. No action was executed; the position and resources in the request are unchanged.`;
			accepted = { plan, ...(edits.length ? { edits } : {}), ...(objection ? { objection } : {}) };
			return null;
		} },
		lookups: [syntaxLookup, equipment(frame, available), exampleReference, chancing(frame), ...(context.cards ? lookups(context.cards, context.rules) : [])], turns: 3,
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
	const task = `YOUR TASK: ${request}\n${prepared ? "Amend the prepared base for the revealed draw and the changes. Keep what still fits." : frame.view.work?.request && frame.view.work.plan ? "Repair the unfinished line from the current window. Replace stale guidance and affected phase decisions along with the actions; keep only what still agrees with the position." : "Advance the pregame strategy from this position; write only what changes."}\nSubmit the line, mana commitments and phase decisions through the opponent's next turn. Check them together before submitting.`;
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
