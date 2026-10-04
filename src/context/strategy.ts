/** Expensive thought produces editable recipes and appointments, only on request. */
import type { Table } from "../core/table.ts";
import { nextDecision } from "../core/decisions.ts";
import { STEPS } from "../core/steps.ts";
import type { Frame } from "../core/types.ts";
import { CommandsSchema, commands, type WorkCommand } from "../core/work-language.ts";
import { prepareWork } from "../core/work-tools.ts";
import type { Brief } from "./brief.ts";
import type { Reasoner } from "./reason.ts";
import type { Recap } from "./summary.ts";
import { workContext } from "./packet.ts";
import type { Universe } from "../core/cards.ts";
import { planReason } from "../core/work-menu.ts";
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

const SYSTEM = [
	"Prepare a stretch of play for one seat of Magic: The Gathering.",
	"The classifier executes your guidance and recognizes your prepared branches.",
	"Give an objective, editable recipes, resource purposes, and scheduled reviews.",
	"Consider order, plausible opposing responses, and later turns where they matter.",
	"A check schedules attention, never unconditional execution. A label is a claim about a role.",
	"Use task.put to schedule checks; times counts distinct actual matching step visits.",
	"Omitting times repeats indefinitely. after schedules a follow-up after another check's run count.",
	"fromTurn and throughTurn use the table's global turn numbers, not rounds or your own turns.",
	"Recipe steps bind listed options, or prepare an activation from a visible permanent or a spell from hand, with a claim and its basis.",
	"Listed action.option and action.prefix match option ids, never labels. A land play uses prefix land: and an objects selector for the card.",
	"A review that should nominate a recipe must include its id in task.recipes. For concept-only reviews use scope {zones: []}; an empty selector matches all visible objects.",
	"A procedure is one announced action in the syntax explained in the reference below, checked against the schema at the end: source, claim, basis, timing, cost, targets and instructions.",
	"Timing spell casts from hand; the table charges the printed cost unless cost.mana states another, and reads the spell's timing from its type line. Claim flash with speed instant.",
	"Timing stack is an activated ability with its cost: mana, tap, sacrifice, exile, life, discard, counters, and a computed reduce. Timing mana only adds mana of stated colors.",
	"Targets are slots: an object selector, a player side, or both for any target; count and upTo for how many. A slot can name an earlier one, as attachedTo target:0.",
	"Instructions run in order as it resolves. A choose pauses for its chooser; as binds a result that later instructions name as bound:name; if gates one; may makes it optional.",
	"Modes and kicker are separate procedures with their own claims. Amounts can count, read power, counters, life, X, or what happened this turn.",
	"Delegation is a seat setting, not a procedure field: a seat whose intent delegates resolution lets its single continuations run without a call.",
	"The table runs what permanents register: entering terms as they enter, and triggers, which it puts in front of their controller before the next priority. Do not replace card text with an invented simpler effect.",
	"Combat is declared one creature at a time with attack: and block: options, then finished with attack:done or block:done. Every physical block is listed; one that breaks a word such as flying or menace is marked, and you should not take it.",
	"Copy the relevant card instruction or accepted ruling into basis. Accepted meaning remains frozen through replay and cloning.",
	"Card facts cover visible objects and public registered lists. Deck counts do not identify another hand or the library order.",
	"Claim, basis, cost and instructions become public when a procedure is executed. Keep private strategic guidance in the recipe.",
	"A reservation is a preference to preserve a visible object incarnation, not a rules restriction.",
	"Reservations apply before every remaining draft step and are not automatically released. Do not reserve an untapped state that your earlier step consumes.",
	"An opponent can invalidate it. Give guidance about what would require reconsideration.",
	"draft.edit requires steps containing only the remaining instructions, even when changing only reserves or guidance. Completed steps are retained by core; never include them again.",
	"Tool shape validation proves neither rules legality nor a good plan. Unmentioned plays stay available.",
	"package.put records what a permanent of that name registers when it enters under your control, such as its mana ability. Write one for each permanent your plan puts onto the battlefield.",
	"You may use task.put, task.cancel, recipe.put, label.put, label.remove, draft.edit, draft.cancel, package.put, and plan.accept.",
	"Finish with exactly one plan.accept. Do not answer reviews or execute moves for the classifier.",
	"Return a JSON array of tool commands only, with no markdown.",
	"",
	"The syntax reference and its worked examples follow. The examples teach shapes; read your own card and write what it says.",
	"",
	syntaxReference(),
	"",
	"This is the tool schema:",
	JSON.stringify(CommandsSchema),
].join("\n");

const ALLOWED = new Set(["task.put", "task.cancel", "recipe.put", "label.put", "label.remove", "draft.edit", "draft.cancel", "package.put", "plan.accept"]);

export async function planWork(frame: Frame, context: { brief?: Brief; recaps?: readonly Recap[]; cards?: Universe }, reasoner: Reasoner): Promise<WorkCommand[]> {
	const request = planReason(frame);
	if (!request) throw new Error("Strategy needs an explicit request or a due turn plan.");
	const user = JSON.stringify({
		seat: frame.seat, request,
		view: { ...frame.view, work: { ...workContext(frame.view.work!), recipes: frame.view.work!.recipes, draft: frame.view.work!.draft } },
		options: frame.decision?.options, brief: context.brief,
		cards: [...new Set([...(frame.view.objects ?? []).flatMap((object) => object.card ? [object.card] : []),
			...(frame.view.decks ?? []).flatMap((deck) => Object.keys(deck.cards))])]
			.flatMap((name) => { const card = context.cards?.cards.get(name); return card ? [{ name, type: card.type, mana: card.mana, stats: card.stats, oracle: card.oracle }] : []; }),
		recaps: context.recaps?.slice(-3), refused: frame.refused,
	});
	const tools = commands(JSON.parse(await reasoner.think("seat plan", { system: SYSTEM, user })));
	if (tools.some((tool) => !ALLOWED.has(tool.do)) || tools.filter((tool) => tool.do === "plan.accept").length !== 1 || tools.at(-1)?.do !== "plan.accept") {
		throw new Error("Strategy must use preparation tools and finish with exactly one plan.accept.");
	}
	prepareWork(frame, tools);
	return tools;
}
