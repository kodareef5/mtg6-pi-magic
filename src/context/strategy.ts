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

/** The old mechanical planning estimate remains useful for comparing call policies. */
export function worthPlanning(table: Table): boolean {
	const step = table.cursor.steps[0];
	if (!step || table.outcome || !STEPS[step].priority) return false;
	const decision = nextDecision(table);
	return !!decision && decision.options.length > 1;
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
	"A procedure can pay unrestricted colored and generic mana, tap its source, and add mana, draw, change life, or choose one card to move.",
	"Immediate mana procedures only add mana. Other procedures use the stack and expose each remaining instruction on resolution.",
	"Set delegate only when this seat authorizes unique resolution continuations to run without another classifier call. It cannot authorize another seat's choice.",
	"Spell procedures use timing spell and source hand. Supply spell speed and destination. The table reads printed type, cost and power/toughness from its card file; do not restate them. A creature with no resolution instructions uses an empty instructions array.",
	"A spell with damage instructions announces one target: creature, player, or creature-or-player. The binding menu chooses it before payment; resolution rechecks it. Planeswalker and battle targets are not yet offered.",
	"The vocabulary cannot recognize triggers, apply replacements or continuous effects, run combat, or verify that the claimed card meaning is correct. Do not replace unsupported card text with an invented simpler effect.",
	"Instruction amounts are literals. Values that must be computed later need machinery this vocabulary does not yet have.",
	"Copy the relevant card instruction or accepted ruling into basis. Accepted meaning remains frozen through replay and cloning.",
	"Card facts cover visible objects and public registered lists. Deck counts do not identify another hand or the library order.",
	"Claim, basis, cost and instructions become public when a procedure is executed. Keep private strategic guidance in the recipe.",
	"A reservation is a preference to preserve a visible object incarnation, not a rules restriction.",
	"Reservations apply before every remaining draft step and are not automatically released. Do not reserve an untapped state that your earlier step consumes.",
	"An opponent can invalidate it. Give guidance about what would require reconsideration.",
	"draft.edit requires steps containing only the remaining instructions, even when changing only reserves or guidance. Completed steps are retained by core; never include them again.",
	"Tool shape validation proves neither rules legality nor a good plan. Unmentioned plays stay available.",
	"You may use task.put, task.cancel, recipe.put, label.put, label.remove, draft.edit, draft.cancel, and plan.accept.",
	"Finish with exactly one plan.accept. Do not answer reviews or execute moves for the classifier.",
	"Return a JSON array of tool commands only, with no markdown. This is the tool schema:",
	JSON.stringify(CommandsSchema),
].join("\n");

const ALLOWED = new Set(["task.put", "task.cancel", "recipe.put", "label.put", "label.remove", "draft.edit", "draft.cancel", "plan.accept"]);

export async function planWork(frame: Frame, context: { brief?: Brief; recaps?: readonly Recap[]; cards?: Universe }, reasoner: Reasoner): Promise<WorkCommand[]> {
	if (!frame.view.work?.request) throw new Error("Strategy needs an explicit request.");
	const user = JSON.stringify({
		seat: frame.seat, request: frame.view.work.request,
		view: { ...frame.view, work: { ...workContext(frame.view.work), recipes: frame.view.work.recipes, draft: frame.view.work.draft } },
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
