/**
 * The writer: one strategy call that reads the position and writes the seat's
 * whole plan, which the pilot then flies. It runs at the seat's turn, when a
 * stop the plan named holds, or when the pilot asks for help.
 */
import type { Table } from "../core/table.ts";
import { nextDecision } from "../core/decisions.ts";
import { STEPS } from "../core/steps.ts";
import type { Frame } from "../core/types.ts";
import type { WorkCommand } from "../core/work-language.ts";
import { planProblems } from "../core/work-tools.ts";
import { lifted, PlanSchema, problems, type Plan, type Registration } from "../core/language.ts";
import type { Brief } from "./brief.ts";
import type { Reasoner } from "./reason.ts";
import type { Recap } from "./summary.ts";
import type { Universe } from "../core/cards.ts";
import { planReason } from "../core/planning.ts";
import { intrinsic } from "../core/characteristics.ts";
import { sick } from "../core/funding.ts";
import { allowance } from "../core/permits.ts";
import { viewWorld } from "../core/selectors.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The old mechanical planning estimate remains useful for comparing call policies. */
export function worthPlanning(table: Table): boolean {
	const step = table.cursor.steps[0];
	if (!step || table.outcome || !STEPS[step].priority) return false;
	const decision = nextDecision(table);
	return !!decision && decision.options.length > 1;
}

/**
 * The syntax and its worked examples, as strategy reads them: docs/SYNTAX.md,
 * then each example in the order docs/examples/README.md lists them. These are
 * the files the examples test parses, so what the model reads cannot drift from
 * the schema. Read once and identical on every call, so a provider can cache it.
 */
export function syntaxReference(): string {
	const docs = join(import.meta.dirname, "..", "..", "docs");
	const listed = [...readFileSync(join(docs, "examples", "README.md"), "utf8").matchAll(/^\| `([^`]+\.md)` \|/gm)].map((match) => match[1]!);
	return [readFileSync(join(docs, "SYNTAX.md"), "utf8"), ...listed.map((file) => readFileSync(join(docs, "examples", file), "utf8"))].join("\n\n").trim();
}

/**
 * How strategy answers: one call to `submit` whose `plan` is the whole answer.
 * The schema's refs are rewritten as JSON pointers so a provider reads them, and
 * the tool is identical on every call so it stays in the cached prefix.
 */
const SUBMIT = {
	name: "submit",
	description: "Submit your whole plan for this seat. Call it once; if it reports problems, fix them and call it again with the whole corrected plan.",
	parameters: JSON.parse(JSON.stringify({ type: "object", properties: { plan: { $ref: "Plan" } }, required: ["plan"], additionalProperties: false,
		$defs: (PlanSchema as unknown as { $defs: object }).$defs }).replace(/"\$ref":"([A-Za-z]+)"/g, '"$ref":"#/$defs/$1"')) as object,
};

const SYSTEM = [
	"You plan one seat's play in a game of Magic: The Gathering. You write a plan; a fast pilot flies it.",
	"",
	"HOW YOUR PLAN IS FLOWN",
	"- The pilot recognizes your steps and branches among the options the table lists. It does not work out a line, so what you leave out does not happen.",
	"- steps is your line, in the order the table will ask for it. Each step has a window (when) and the option it takes: an option id, an id prefix with an objects query, or a procedure to announce.",
	"- A step is due when its window is open and its if holds. The pilot takes the first due step. When exactly one listed option fits it, the table takes it for you.",
	"- When no step or branch fits anything listed, the table passes priority for you, and on your turn declares no attackers. Write every land play, spell, attack, block and response you want.",
	"- may holds standing branches for what may happen: a response on the opponent's turn (if they target my creature, protect it), a block, another way if the first is unavailable. Give each a window and an if.",
	"- askWhen names visible facts that mean this plan no longer fits, such as a creature the line depends on dying, or lethal damage on the opponent's board. When one becomes true you are asked again, which costs a whole planning session: name only changes that break the line before your next turn, never routine events such as a trigger resolving or an expected attack. Cover expected events with branches instead.",
	"- holds names resources the plan keeps, such as mana for a response, with the condition that releases them. An option that spends one is marked for the pilot.",
	"- packages says what each permanent registers as it enters. Write one for every permanent your plan may put onto the battlefield. Without one it enters with nothing registered: no trigger, no mana ability, no keyword.",
	"- A package holds only what happens without you choosing: keywords and other statics, triggers (When, Whenever, At), how it enters, and mana abilities. An activated ability, a cost then a colon such as \"{1}{R}: Put a +1/+1 counter\", is never registered: when you want it, write a step or branch whose action is a procedure with timing stack and that cost.",
	"- Cover this turn and the opponent's next turn. You plan again at your next turn, or sooner when a stop holds or the pilot asks for help.",
	"- Triggers you cause come back to you before priority; name the target you want in the step or branch label.",
	"",
	"HOW TO THINK. Settle these before writing, and put the conclusions in objective and guidance:",
	"1. Role and clock: who must force the exchange now, and how many turns each side needs to win, under which blocks and burn.",
	"2. Threats: which opposing cards or attacks beat this plan before it pays off, the last window to answer each, and what answering costs.",
	"3. Act or wait: compare the main line with waiting, such as holding a land, a removal spell, or mana for a response. Name what waiting costs.",
	"4. The opponent's best reply to your line, not the most convenient one.",
	"5. Resources: what the line spends and keeps, and why.",
	"6. The exact sequence in table order, including the triggers you cause and their targets.",
	"7. What would make the plan wrong: those are your askWhen.",
	"",
	"THE SYNTAX, briefly. The full reference and worked examples follow.",
	"- A procedure is one announced action: source, claim, basis (the quoted card text), timing, cost, targets and instructions.",
	"- Timing spell casts a card; the table charges its printed cost unless cost.mana says otherwise and reads its timing from the type line. Claim flash with speed instant.",
	"- Timing stack is an activated ability with its cost: mana, tap, sacrifice, exile, life, discard, counters, and a computed reduce. Timing mana only adds mana of stated colors.",
	"- Targets are slots: an object selector, a player side, or both for any target; count and upTo for how many. A slot can name an earlier one, as attachedTo target:0.",
	"- Instructions run in order as it resolves. choose pauses for its chooser; as binds a result that later instructions name as bound:name; if gates one; may makes it optional.",
	"- Modes and kicker are separate procedures. A permanent spell with nothing to do on resolution needs no procedure: the table offers it for its printed cost as cast:.",
	"- The table runs what permanents register: entering terms as they enter, and triggers, which it puts in front of their controller before the next priority.",
	"- Combat is declared one creature at a time with attack: and block: options, then finished with attack:done or block:done. A block that breaks a word such as flying or menace is marked; do not plan one.",
	"- Option ids are matched by option or prefix and objects, never by label. Turn numbers in when are the table's global turns.",
	"- when.step is one of: upkeep, draw, precombat-main, begin-combat, declare-attackers, declare-blockers, combat-damage, end-of-combat, postcombat-main, end. Leave step out to match every step; when.active is self, opponent or any.",
	"- Copy the card's own words into basis. Do not replace card text with an invented simpler effect.",
	"",
	"HOW TO ANSWER. Call the submit tool once with your whole plan. Nothing you write as text is read.",
	"If submit reports problems, fix every one of them and call submit again with the whole corrected plan.",
	"",
	syntaxReference(),
].join("\n");

/** The seat's objects as the writer reads them: what each is and its state, with ids to point at. */
const objects = (frame: Frame) => (frame.view.objects ?? []).filter((object) => object.zone !== "library").map((object) => ({
	id: object.id, incarnation: object.incarnation, name: object.card ?? object.token?.name ?? object.ability?.claim, zone: object.zone, controller: object.controller,
	...(object.tapped ? { tapped: true } : {}), ...(object.traits?.power !== undefined ? { body: `${object.traits.power}/${object.traits.toughness}` } : {}),
	...(Object.keys(object.counters).length ? { counters: object.counters } : {}), ...(object.damage ? { damage: object.damage } : {}),
	...(object.traits?.words.length ? { words: object.traits.words } : {}), ...(object.registrations?.length ? { registers: object.registrations.map((one) => one.basis) } : {}),
}));

/** The shapes the first live plans most often got wrong, and the right one, added to a refusal that shows the mistake. */
const HINTS: [RegExp, string][] = [
	[/has no field "at(Least|Most)"/, "atLeast and atMost sit beside amount, not inside it: {\"amount\": {\"count\": {...}}, \"atLeast\": 1}."],
	[/when\/step must be equal to one of/, "Leave step out to match every step."],
	[/\/if has no field "action"/, "A step or branch is {\"label\", \"when\", \"if\", \"action\"}: action sits beside if, not inside it."],
	[/has no priority, so nothing can be done in it/, "The table untaps, draws and discards to hand size for you; plan only what you choose."],
];
const hints = (found: string[]) => HINTS.filter(([pattern]) => found.some((line) => pattern.test(line))).map(([, hint]) => ` ${hint}`).join("");

/**
 * Habits the first live plans showed that have one meaning, read as meant
 * rather than refused: steps left out when there are none, bounds inside an
 * amount, an action written inside its if, and untap or cleanup steps, which the
 * table performs itself.
 */
function tidy(value: unknown): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	const plan = lifted({ steps: [], ...(value as object) }) as Record<string, unknown>;
	const option = (one: unknown) => {
		let record = one as Record<string, unknown> & { if?: Record<string, unknown>; action?: Record<string, unknown> };
		if (!record || typeof record !== "object") return one;
		if (!record.action && record.if?.action) {
			const { action, ...condition } = record.if;
			const { if: _, ...rest } = record;
			record = { ...rest, action: action as Record<string, unknown>, ...(Object.keys(condition).length ? { if: condition } : {}) };
		}
		// An option id written with a trailing colon, such as "cast:", is a prefix.
		const id = record.action?.option;
		if (typeof id === "string" && id.endsWith(":") && !record.action!.prefix) {
			const { option: _, ...action } = record.action!;
			record = { ...record, action: { ...action, prefix: id } };
		}
		return record;
	};
	const timed = (one: unknown) => !["untap", "cleanup"].includes(((one as { when?: { step?: string } })?.when?.step) ?? "");
	// Anything but a list is left as written, for the schema to name.
	return { ...plan, ...(Array.isArray(plan.steps) ? { steps: plan.steps.map(option).filter(timed) } : {}), ...(Array.isArray(plan.may) ? { may: plan.may.map(option).filter(timed) } : {}) };
}

/** "{1}{R}: ...", "{T}, Sacrifice this: ...": a cost, a colon, an effect. */
const ACTIVATED = /^[^."]*(\{[^}]+\}|\bSacrifice\b|\bPay \d+ life\b)[^."]*:\s/;

/**
 * Registrations whose own quoted basis reads as an activated ability. Those are
 * announced as procedures when the seat chooses to, never registered to fire on
 * their own; only a mana ability is registered.
 */
function misregistered(plan: Plan): string[] {
	const found: string[] = [];
	const visit = (registrations: Registration[], card: string) => {
		for (const registration of registrations) {
			if (registration.kind !== "mana" && ACTIVATED.test(registration.basis)) found.push(`package ${card}: "${registration.basis.slice(0, 60)}" is an activated ability (a cost, then a colon); announce it as a procedure step when you mean to pay for it, and do not register it. Only mana abilities are registered.`);
			if (registration.kind === "continuous" && registration.change.registers) visit(registration.change.registers, card);
		}
	};
	for (const pack of plan.packages ?? []) visit(pack.registers, pack.card);
	return found;
}

/**
 * What the seat can spend this turn, worked out rather than left to the writer:
 * its untapped mana sources and whether a land play and a land remain.
 */
function mana(frame: Frame): string {
	const mine = (frame.view.objects ?? []).filter((object) => object.controller === frame.seat);
	const sources = mine.filter((object) => object.zone === "battlefield" && !object.tapped && !sick(frame, object) &&
		(intrinsic(object.traits).length > 0 || (object.traits?.registrations ?? []).some((one) => one.kind === "mana")));
	const lands = mine.filter((object) => object.zone === "hand" && object.traits?.types.includes("land"));
	const play = (frame.view.landsPlayed ?? 0) < allowance(viewWorld(frame.view), frame.seat).lands && lands.length > 0;
	return `You can make ${sources.length + (play ? 1 : 0)} mana this turn: ${sources.length} untapped source${sources.length === 1 ? "" : "s"} (${sources.map((one) => one.card ?? one.token?.name).join(", ") || "none"})` +
		`${play ? `, plus a land from hand (${[...new Set(lands.map((one) => one.card))].join(", ")})` : lands.length ? "; your land play is used" : "; no land in hand"}. A spell must be paid with this; check each step's cost against it.`;
}

export async function planWork(frame: Frame, context: { brief?: Brief; recaps?: readonly Recap[]; cards?: Universe }, reasoner: Pick<Reasoner, "work">): Promise<WorkCommand[]> {
	const request = planReason(frame);
	if (!request) throw new Error("Strategy needs an explicit request or a due turn plan.");
	const { work, done, objects: _objects, printed: _printed, ...view } = frame.view;
	const user = JSON.stringify({
		seat: frame.seat, mana: mana(frame), view, objects: objects(frame),
		plan: work?.plan ? { ...work.plan, done: (done ?? []).map((at) => work.plan!.steps[at]?.label) } : null,
		packages: (work?.packages ?? []).map((pack) => pack.card),
		options: frame.decision?.options, brief: context.brief,
		cards: [...new Set([...(frame.view.objects ?? []).flatMap((object) => object.card ? [object.card] : []),
			...(frame.view.decks ?? []).flatMap((deck) => Object.keys(deck.cards))])]
			.flatMap((name) => { const card = context.cards?.cards.get(name); return card ? [{ name, type: card.type, mana: card.mana, stats: card.stats, oracle: card.oracle }] : []; }),
		recaps: context.recaps?.slice(-3), refused: frame.refused,
	});
	const at = frame.view.window;
	const task = [
		`YOUR TASK: ${request}`,
		at.kind === "turn" ? `It is turn ${at.turn}, ${at.step}, seat ${at.active}'s turn. Plan from here through the end of the opponent's next turn.` +
			(at.active === frame.seat ? " Decide this turn's attacks: write an attack step for each creature that should attack, then attack:done. Without them no creature attacks." : "")
			: "The mulligan is decided separately, from the brief's opening policy. Plan from your first turn through the opponent's first turn.",
		"Answer now by calling submit once with your whole plan. Keep labels, guidance and objective to a sentence or two each.",
	].join("\n");
	const submit = { ...SUBMIT, check: (args: Record<string, unknown>) => {
		// Fields of the plan written beside it, as when the plan object is closed too early, belong inside it.
		const { plan: written, ...beside } = args;
		args.plan = tidy({ ...beside, ...(written as object) });
		for (const key of Object.keys(beside)) delete args[key];
		const shape = problems(PlanSchema, args.plan);
		if (shape.length) return `The plan does not match the schema: ${shape.join("; ")}.${hints(shape)}`;
		const plan = args.plan as Plan;
		const idle = at.kind === "turn" && at.active === frame.seat && !plan.steps.length && !plan.may?.length
			? ["the plan has no steps and no branches, so the table would pass every window of your turn; if that is what you mean, add a step {\"label\": \"Pass the turn\", \"when\": {\"active\": \"self\"}, \"action\": {\"option\": \"pass\"}}"] : [];
		const found = [...planProblems(frame, plan), ...misregistered(plan), ...idle];
		return found.length ? `${found.length} problem${found.length === 1 ? "" : "s"}: ${found.join("; ")}.${hints(found)}` : null;
	} };
	// Named by why it was asked, so the bill tells a turn's plan from an escalation.
	const why = !frame.view.work?.request ? "turn plan" : frame.view.work.accepted === undefined ? "opening plan" : request.startsWith("Stop:") ? "plan after a stop"
		: request.startsWith("The pilot asked") ? "plan after help" : "plan on request";
	const answer = await reasoner.work(why, { system: SYSTEM, user, task }, { submit });
	return [{ do: "plan.put", plan: answer.plan as Plan }];
}
