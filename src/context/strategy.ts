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
import { PlanSchema, problems, type Plan, type Registration } from "../core/language.ts";
import type { Brief } from "./brief.ts";
import type { Reasoner } from "./reason.ts";
import type { Recap } from "./summary.ts";
import type { Universe } from "../core/cards.ts";
import { planReason } from "../core/planning.ts";
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
	"- askWhen names visible facts that mean this plan no longer fits, such as a creature the line depends on dying, or lethal damage on the opponent's board. When one holds you are asked again.",
	"- holds names resources the plan keeps, such as mana for a response, with the condition that releases them. An option that spends one is marked for the pilot.",
	"- packages says what each permanent registers as it enters. Write one for every permanent your plan may put onto the battlefield. Without one it enters with nothing registered: no trigger, no mana ability, no keyword.",
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

export async function planWork(frame: Frame, context: { brief?: Brief; recaps?: readonly Recap[]; cards?: Universe }, reasoner: Pick<Reasoner, "work">): Promise<WorkCommand[]> {
	const request = planReason(frame);
	if (!request) throw new Error("Strategy needs an explicit request or a due turn plan.");
	const { work, done, objects: _objects, printed: _printed, ...view } = frame.view;
	const user = JSON.stringify({
		seat: frame.seat, view, objects: objects(frame),
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
		at.kind === "turn" ? `It is turn ${at.turn}, ${at.step}, seat ${at.active}'s turn. Plan from here through the end of the opponent's next turn.`
			: "The mulligan is decided separately, from the brief's opening policy. Plan from your first turn through the opponent's first turn.",
		"Answer now by calling submit once with your whole plan. Keep labels, guidance and objective to a sentence or two each.",
	].join("\n");
	const submit = { ...SUBMIT, check: (args: Record<string, unknown>) => {
		const shape = problems(PlanSchema, args.plan);
		if (shape.length) return `The plan does not match the schema: ${shape.join("; ")}.`;
		const found = [...planProblems(frame, args.plan as Plan), ...misregistered(args.plan as Plan)];
		return found.length ? `${found.length} problem${found.length === 1 ? "" : "s"}: ${found.join("; ")}.` : null;
	} };
	// Named by why it was asked, so the bill tells a turn's plan from an escalation.
	const why = !frame.view.work?.request ? "turn plan" : request.startsWith("Stop:") || request.startsWith("Step ") ? "plan after a stop"
		: request.startsWith("The pilot asked") ? "plan after help" : "plan on request";
	const answer = await reasoner.work(why, { system: SYSTEM, user, task }, { submit });
	return [{ do: "plan.put", plan: answer.plan as Plan }];
}
