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
import { budget, paymentForecast } from "../core/budget.ts";
import { ChangesSchema, ResponseSchema, actions, basePlan, changedPlan, conditionProblems, equipment, responseChanges, submissionFields, selectionFields } from "./plan-edit.ts";
import { actionFacts, bindingFacts, choiceProblems, planFacts } from "./strategy-actions.ts";
import { facts, chancing, initialPlan, type Context } from "./strategy-facts.ts";
import { combatLookup } from "./strategy-combat.ts";
import { policyExamples } from "./playbook.ts";

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
const SUBMIT = {
	name: "submit",
	description: "Update the base plan with only changed fields. Omitted fields stay; lists replace whole lists and [] clears one, except packages join by card name. {} keeps the base. Reuse an action with {reuse: its key under actions}. Optional notes edit topics in the same answer. Acceptance proves neither card meaning nor playing strength.",
	parameters: { type: "object", properties: {
		...submissionFields,
		notes: NoteEditsSchema,
		objection: { type: "object", properties: { row: { type: "integer" }, claim: { type: "string", minLength: 1 }, rule: { type: "string" } }, required: ["row", "claim"], additionalProperties: false },
	}, additionalProperties: false },
};

const SYSTEM = [
	"You strategize for one Magic seat. A small, fast pilot, Jev, executes your plan. The pregame brief is your matchup analysis: build on it instead of researching the deck again.",
	"Organize a line using brief.policies and their worked examples. Match the position to their applicability and priorities, bind the actual sources and targets, then check their reconsider conditions. A policy is guidance, not proof it fits. Spend new strategic reasoning on changed facts or an uncovered case. Check both clocks and the last answer window before committing resources. Use registered counts and earned knowledge for odds, never assume a hidden card or order.",
	"Evaluate a win available now before development or a defensive reserve. Name the action and damage that can finish, or the visible obstacle that prevents it. A reserve must name an actual card or ability and its useful window; an unknown future draw is not itself a response. Release holds when the winning line needs them.",
	"Bind the line to decisionFacts: the complete current creature roster, your hand, untapped mana sources and land allowance under positionBasis. Empty lists mean none. Use view.window and remainingSteps for timing; objects, watches and choices carry the full detail and restrictions. base is earlier intent, not a record of current facts. Recheck its combat and response commitments against decisionFacts, including steps whose labels name an old creature or response. Replace contradicted steps, guidance, phase scripts and holds together. Completed windows cannot be used again unless remainingSteps contains them.",
	"positionBasis distinguishes an observed position from a next-turn forecast. In a forecast, window, objects and mana describe the stated upcoming turn under its assumptions; choose that turn's actual line, not actions during the opponent's current turn. Check every inherited card, cost and combat claim against those facts. A creature already in play does not need another cast. Summoning sickness restricts attacking and tap-symbol abilities, not blocking.",
	"objects groups the current position by zone and controller. Movement actions bind selectedNow to current characteristics and obstaclesNow; their labels are earlier intent, not facts. An attack or block needs a creature, with any transformation or entry occurring first. Holds show releasedNow under their recorded conditions. Check these bindings before carrying a commitment forward; a later prerequisite can change them, but merely naming it does not execute it.",
	"Before submitting, check mana across the whole line, holds and spending restrictions; the order in which permanents enter and triggers happen; targets; attacks and blocks. Current offers state manaRequired and untappedSourcesAfterPayment. Use those counts; do not invent a leftover source. State resource holds and their release condition, then let Jev select the payment. The table checks physical payments and structured terms. It does not certify card meaning or expert play.",
	"Each visible creature's summoningSick is the current restriction, read from its controller's turn and haste. False does not establish that an attack is legal or useful. A watch's matchingNow names visible objects meeting its selector now, not events or guaranteed future triggers.",
	"watches lists registered triggers on visible permanents now. A permanent cannot see events that finished before it entered; its own entry can trigger it. A watch's you and this refer to its source's controller and source. Distinguish forecasts from events already recorded in view.history.",
	"",
	"YOUR ANSWER",
	"- Update base with changed fields directly: no plan or changes wrapper. Omitted fields stay; lists replace, [] clears. Packages join by card name. Fresh turns start from pregame policies, never prior tactical prose. Amendments retain unfinished work within base.throughTurn, which context sets. Do not restore completed steps. objective and guidance are audit rationale, not pilot instructions.",
	"- actions describes accepted uses by their claim, quoted card meaning, source, cost and targets. Set action.reuse to the exact listed key, including its readable name. sameAs refers to another complete action description; both keys are usable. A normal cast and an alternate-cost cast are different uses. Prefer prepared: or printed: keys for spells and activations; an old step may bind an obsolete payment or target. Reuse copies the accepted executable body unchanged. equipment reads that body when an interpretation needs inspection. These terms were prepared by a model, not certified as correct.",
	"- packages persist in private work. Standing abilities are assessed before play. Some spell effects and activations remain identified in deferred until their source is available; a separate interpretation call prepares them before the pilot acts. Use accepted actions instead of rewriting their meaning as part of strategy. Correct a package only when its interpretation was wrong; a new line does not change a card's abilities. Registrations quote the card's own text. printedCast selects the shared ordinary permanent cast; set it false if a correction needs a special casting procedure.",
	"- notes is optional [{topic, note}]. Add only a useful new conclusion or correction; an empty note retires a topic. Notes do not require another call. The notebook is memory, not a task to fill. Do not restate the brief or unchanged facts.",
	"",
	"WHAT JEV NEEDS",
	"- steps: ordered actions, each with label, when and action. Reuse the supplied land and combat actions as well as accepted spells and activations. Movement selectors name candidates, not promises that they can move now: check sickness, windows and land plays. For a creature entering later, write prefix attack: with objects naming that future battlefield creature only if it will be eligible. Essential means the line fails if that step cannot be taken.",
	'- action.option is an exact listed button id, or pass, attack:done, block:done. Never construct it from a card name. A future land uses {"prefix":"land:","objects":{"zones":["hand"],"card":"<visible card name>"}} or a supplied reusable action. objects is a query with card, zones, controller, types, tapped or refs. types matches any listed current type.',
	"- purpose is the step or response's execution policy: targets, payment preferences, search and optional choices. Jev reads it at announcement, target and payment selection, and resolution. A later amendment cannot rewrite an announced use. Put rationale in guidance. Keep purpose consistent with holds; a contradiction needs repair.",
	"- Phase guidance supplies responses, trigger choices and exceptions for its window. Context derives action order and progress from steps. A holds query reserves EVERY match. Use refs for one incarnation or ids to follow an identified physical card across zone changes. Bind draw branches to the visible hand, never an unknown library object. Check restrictions when preserving response mana; name the covered alternative if a resource is lost.",
	"- Steps order announcements. Set waitFor: empty-stack when the commitment must wait for the whole stack to resolve, including landfall before a fetch. Absence adds no prerequisite. Carry the chosen search and trigger policy through resolution; do not repeat a pending activation.",
	"- Give opening bottom, combat, search and optional-instruction choices a policy with a visible exception. Compare the hand left after bottoming. A ground blocker cannot stop a flying threat without flying or reach; a flying defender can still block a ground attacker. Use current characteristics.",
	"- Repair the unfinished line and its guidance together. history names actions already taken this turn; do not reintroduce them when the new base omits completed steps. Phase instructions should say what to do while an effect is pending and after it resolves, not keep ordering an already completed activation.",
	"- phases: [{when, guidance, complete?, reevaluate?}]. Cover relevant upkeep, draw, main, combat, end and opponent windows, including responses, trigger targets, searches and optional instructions. complete is pass or ask after that window's commitments finish; absence grants no pass. Waiting for the stack uses the response policy separately. reevaluate names uncovered changes, not routine events.",
	"- may: conditional standing responses or alternative lines. Cover likely draw classes that change the line, rather than one branch per registered card. holds keeps sources for a purpose. askWhen stops on a visible fact that makes the line impossible; it must not cause routine replanning.",
	'- Conditions count visible objects: {"amount":{"count":{"zones":["hand"],"controller":"you","types":["creature"]}},"atLeast":1} tests a creature in your hand after the draw. A battlefield threat uses zones ["battlefield"], controller "opponent" and its name or characteristics. Combine tests with all/any/not. top refers only to library objects; it never means a card in hand or in play. Query objects use controller "self"; condition selectors accept "you" or "self". An unconditional known action needs no presence condition: its options already require the source.',
	"- Use active self/opponent and step names for windows. active means whose TURN it is, not whose choice. currentWindow is the exact when for a response now: copy it for a pending-spell response. Leave absolute turn numbers out unless necessary. Untap, the turn draw and cleanup discard happen through the rules, not plan steps.",
	"- A normal non-Aura permanent is cast: for its printed cost, without targets or resolution instructions. Its abilities come from its package. Instants and sorceries need procedures. Do not give a creature spell its trigger's targets.",
	"- choices.options lists direct decisions such as land plays, blocks and passes. choices.uses describes available spell and activation modes with explicit locked costs and target bindings, without payment combinations. Use action.reuse for that mode, then state target priorities and exact resource holds. Jev selects the offered target and payment; do not copy a payment id into a reusable turn line.",
	"- Printed definitions appear beside your hand cards in decisionFacts.yourHand[].printed; cards holds the other visible definitions. Battlefield traits describe current characteristics; off-field baseCharacteristics describe base types and stats, not installed battlefield abilities. Read printed text for a cast's abilities, never infer their absence from an uninstalled package. Registered lists remain in view.decks; card or equipment reads an absent card. Use syntax only before changing card terms; ordinary sequencing needs no reinterpretation.",
	'- Combat is sequential: attack: or block: per creature, then finish. Finish your attacks with {"label":"Finish attackers","when":{"active":"self","step":"declare-attackers"},"action":{"option":"attack:done"}}. Finish blocks on their turn with {"label":"Finish blockers","when":{"active":"opponent","step":"declare-blockers"},"action":{"option":"block:done"}}. Your own turn never needs a block step. Jev handles listed trigger, resolution and damage choices with your phase guidance.',
	"",
	"Object only to a listed opponent action that broke a rule or misread a card: objection {row, claim, rule}. Poor play is not grounds. A judge may rewind the game.",
	"Call submit once with the updates. You may look up a needed fact first. If refused, correct all named problems together. Give Jev the final consistent conclusion, not a running calculation followed by a correction. Remove superseded statements before submitting.",
	"",
	"The submit tool defines ordinary plan fields, object queries and windows. The definitions below cover its conditions and amounts. Procedure and Package definitions are available through syntax when you need to change card terms. The complete schema is checked locally.",
	JSON.stringify(planReference),
].join("\n");

const RESPONSE_SYSTEM = [
	"You repair one current Magic response or combat decision for a seat. Jev executes the resulting actions and every voluntary pass. Use the supplied pregame policies, current facts and accepted action claims; do not research or plan the next own turn.",
	"Prior intent can be stale. The current window, objects, mana and choices are facts. Read the actual hand and available sources before reserving a response; a card named in a policy is not necessarily in hand. Arithmetic attached to a block or payment is a fact under its stated assumptions, not a prediction of responses or later triggers.",
	"Choose the line that wins now, otherwise prevents a concrete loss, otherwise preserves the relevant engine and response resources. For blocks, name the creature preserved or lost; a blocker dying does not imply it kills the attacker. Use damage and survival facts in the offered choice.",
	"Submit current: an ordered list of {label, action, purpose?}. action is {reuse: exact action key} for an accepted use, or a listed {option: id}, or {prefix, objects}. Include the intended pass or block:done when needed. The context builder binds every current action to this turn and step. Do not write when or a next-turn line. Unaffected steps stay.",
	"purpose carries each action's target, payment and resolution choices. Optional phases replaces execution policies; keep unaffected windows and fix contradicted policies. complete is pass or ask after commitments finish; absent means unspecified. guidance is audit rationale Jev does not read. holds replaces reserves; [] releases them. Use exact refs for one source. notes and objection use the schema; equipment reads accepted terms without rewriting them.",
	"The table validates resources and syntax, not card meaning or playing strength. You can object to a listed opposing action that broke a rule; strategic disagreement is not an objection. If refused, fix all named problems without pretending an action was executed.",
	JSON.stringify(ResponseSchema),
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
	const base = basePlan(frame, options.prepared?.plan, options.nextTurn, context.brief ? initialPlan(context.brief) : undefined);
	const at = frame.view.window;
	const available = actions(frame, base, options.nextTurn && at.kind === "turn" ? at.turn + 1 : undefined);
	let forecastTold = false;
	let accepted: Prepared & { objection?: Objection } | undefined;
	const carried = options.prepared?.edits ?? [];
	const response = !options.nextTurn && at.kind === "turn" && at.active !== frame.seat && !!frame.view.work?.request && !!frame.view.work.plan;
	const submit = { ...SUBMIT, ...(response ? { description: "Repair the current decision. current actions bind to this exact turn and step; unaffected steps stay. Guidance and holds replace their old fields. This updates intent, never executes a move or certifies the strategy." } : {}),
		parameters: { ...SUBMIT.parameters, properties: { ...selectionFields(available, response), notes: NoteEditsSchema, objection: SUBMIT.parameters.properties.objection }, ...(response ? { required: ["current"] } : {}) } };
	const current = at.kind === "turn" ? options.nextTurn ? `Planning target: your turn ${at.turn + 1}, from upkeep through the opponent's following turn. You are seat ${frame.seat}. Use the forecast position; you are not answering the opponent's current priority decision.`
		: `Current decision: ${at.active === frame.seat ? "your" : "the opponent's"} turn ${at.turn}, ${at.step}. You are seat ${frame.seat}. ${frame.decision?.question ?? "You are preparing while the other seat acts."}` : "";
	const scope = response ? "Repair this response or combat decision and the affected remainder of the opponent's current turn. Do not write the next own turn's line: its scheduled preparation and draw amendment handle that. Keep unaffected phase policies; change the actions, holds and guidance needed for this decision." : task;
	const resources = paymentForecast(frame, base);
	await reasoner.work(about, { system: response ? RESPONSE_SYSTEM : SYSTEM, user: facts(frame, context, { base: planFacts(base), baseProblems: [...planProblems(frame, base), ...conditionProblems(base), ...resources.conflicts],
		...(resources.responses.length ? { optionalResponseFunding: resources.responses } : {}), bindings: bindingFacts(frame, base, options.nextTurn), actions: actionFacts(frame, available, options.nextTurn && at.kind === "turn" ? at.turn + 1 : undefined),
		...(options.changed ? { changed: options.changed } : {}), ...(carried.length ? { pendingNotes: carried } : {}), examples }, options.nextTurn ? "preparation" : response ? "response" : "turn"),
		task: `${response ? `YOUR TASK: ${frame.view.work?.request}\n` : ""}${scope}\n${current}` }, {
		submit: { ...submit, check(args) {
			const { notes, objection: raised, ...changes } = args;
			let plan: Plan;
			try { plan = changedPlan(base, response ? responseChanges(frame, base, changes) : changes, available); } catch (error) { return String(error); }
			plan.throughTurn = base.throughTurn;
			const objection = raised as Objection | undefined;
			const edits = [...carried, ...(Array.isArray(notes) ? notes as NoteEdit[] : [])];
			const wrong = [...planProblems(frame, plan), ...choiceProblems(frame, changes, options.nextTurn), ...registrationProblems(plan.packages ?? [])];
			if (!plan.steps.length && (options.nextTurn || !frame.view.work?.plan && !options.prepared && !plan.may?.length))
				wrong.push('This turn has no ordered actions. Write the known line, or explicitly choose passing with a step whose action is {"option":"pass"}. Conditional branches do not replace the known turn line.');
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
		lookups: [syntaxLookup, equipment(frame, available), combatLookup(frame), exampleReference, chancing(frame), ...(context.cards ? lookups(context.cards, context.rules) : []),
			...(context.policyExamples === "lookup" ? policyExamples(context.brief) : [])], turns: 3,
		// Observed ordinary replies take 6-28s; retry a stalled critical-path
		// request without replacing its task, model, or accepted plan.
		...(options.nextTurn ? {} : { timeoutMs: 45_000 }),
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
	const task = `YOUR TASK: ${request}\n${prepared ? "Amend the prepared base for the observed changes. Keep what still fits; no future draw is known." : frame.view.work?.request && frame.view.work.plan ? "Repair the unfinished line from the current window. Replace stale guidance and affected phase decisions along with the actions; keep only what still agrees with the position." : "Advance the pregame strategy from this position; write only what changes."}\nSubmit the line, mana commitments and phase decisions through the opponent's next turn. Check them together before submitting.`;
	const about = frame.view.work?.request ? "plan on request" : prepared ? "turn amendment" : "turn plan";
	const made = await write(frame, context, reasoner, task, about, { ...(prepared ? { prepared } : {}), ...(changed ? { changed } : {}) });
	return { tools: putting(made), ...(made.objection ? { objection: made.objection } : {}) };
}

/** Prepare once during the opponent's turn, without changing the table or seeing a future draw. */
export async function prepareTurn(frame: Frame, context: Context, reasoner: Pick<Reasoner, "work">, signal?: AbortSignal): Promise<Prepared> {
	const at = frame.view.window;
	if (at.kind !== "turn" || at.active === frame.seat) throw new Error("Prepare the next own turn during the opponent's turn.");
	return write(frame, context, reasoner, `YOUR TASK: PREPARE YOUR NEXT TURN, ${at.turn + 1} on the table's alternating counter (your own turn ${Math.ceil((at.turn + 1) / 2)}), during the opponent's turn ${at.turn}. The table turn number is not your land count or mana budget.\nBuild on the brief's policies. The supplied position is a labelled next-turn forecast with untapped resources and the known hand. Write its concrete ordered line and useful responses. Inherited phase prose can name old cards or costs; retain only decisions that still fit the forecast. Anticipate changed draw classes with visible-hand conditions; the next draw is unknown. Keep sound phase policies. Notes are optional; submit once, with no separate research or note-taking pass.`,
		"preparation", { nextTurn: true, ...(signal ? { signal } : {}) });
}
