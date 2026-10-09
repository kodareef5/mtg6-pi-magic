/**
 * What the coordinator reads: its system prompts, the work laid out for one
 * decision, and the request that ends the conversation. The coordinator writes
 * the plan the pilot flies; analysts' findings and reports are advice it weighs
 * against the dossier. Nothing here certifies a card's meaning or a line's
 * strength. Past 150 lines because the plan language and its examples belong
 * beside the prompts that teach them.
 */
import { RULES_OF_PLAY } from "./survey.ts";

const text = (description: string) => ({ type: "string", minLength: 1, description });
const win = "The most damage you can deal this turn. First apply everything you can do before combat: land plays and land searches with the landfall triggers each entry causes, counters, power changes, pumps and removal of blockers. A spell that never attacks still counts when it raises an attacker's power. Then count all your attackers together, castable haste included, through the opponent's best legal blocks, including trample and double strike, plus burn you can pay for, against their life. Write each change in order, such as 4 -> 8 -> 16 power, then the sum and the winning line, or why there is none.";

/** Without analysts the coordinator surveys the board itself, piece by piece, before any plan field. */
export const ASSESSMENT = { type: "object", additionalProperties: false, required: ["hand", "zones", "opponents", "combat", "combinations", "rollup"],
	description: "Write first. Survey the position piece by piece before any plan field. Your own working; Jev never reads it.",
	properties: {
		hand: { type: "array", description: "One entry for every card in your hand.", items: { type: "object", additionalProperties: false, required: ["card", "play", "impact"], properties: {
			card: text("Its name."),
			play: text("Whether and when you can cast or play it in the planned turn, with its cost against your mana, or why not."),
			impact: text("What it would change, alone and with your other cards: damage, an attacker or blocker this turn, removal, mana, cards. Say plainly if it could swing or win the game."),
		} } },
		zones: { type: "array", description: "Your battlefield, graveyard and exile, and the stack.", items: { type: "object", additionalProperties: false, required: ["zone", "opportunity"], properties: {
			zone: text("The zone."), opportunity: text("Any ability, untapped source, creature-land, permission or pending object there that changes the game, or none."),
		} } },
		opponents: { type: "array", description: "One entry per opponent.", items: { type: "object", additionalProperties: false, required: ["state", "threats", "leverage"], properties: {
			state: text("Life, creatures and which are tapped, cards in hand, open mana."),
			threats: text("What they can do to you before and during their next turn."),
			leverage: text("What you can exploit: low life, tapped or missing blockers, no flying or reach, a key creature to remove."),
		} } },
		combat: { type: "array", description: "One entry for every creature that could attack or block in the planned turn on either side, haste creatures you can cast before combat included.", items: { type: "object", additionalProperties: false, required: ["creature", "side", "status", "best"], properties: {
			creature: text("Name, power/toughness and listed abilities."),
			side: { type: "string", enum: ["yours", "theirs"] },
			status: text("Can it attack or block this turn, and why."),
			best: text("Its best use and what happens: who could block it or whom it could block, what dies, damage that gets through."),
		} } },
		combinations: { type: "array", description: "Cards and permanents that together do what none does alone, such as damage from several spells against one creature's toughness, or removal before an attack.", items: { type: "object", additionalProperties: false, required: ["cards", "effect"], properties: {
			cards: text("The cards and their total cost against your mana."), effect: text("What they achieve together, or why it is not worth it."),
		} } },
		rollup: { type: "object", additionalProperties: false, required: ["win", "priorities"], properties: {
			win: text(win),
			priorities: { type: "array", items: { type: "string" }, description: "The opportunities above ranked by impact. The plan carries out the first ones." },
		} },
	} };

/** With analysts' work supplied, the coordinator's own working is the rollup. */
export const ROLLUP = { type: "object", additionalProperties: false, required: ["corrections", "adopted", "win", "priorities"],
	description: "Write first. Weigh the branches or reports and the findings against the dossier. Your own working; Jev never reads it.",
	properties: {
		branches: text("When branches are present: for the two that claim the most damage, check each ledger row against the dossier, its costs, sources, triggers and power. Name the first row that fails and whether another source, payment or order repairs it, or confirm the total."),
		corrections: text("Findings or report claims that contradict the dossier or the card text, corrected, or none."),
		adopted: text("Which reports or parts of them you adopt and why, and which you reject. When a finding or report claims more damage than your line, recount its steps against the card text and mana. If a step fails, try another source, payment or order; reject the claim only by naming the step that still fails. Merge parts only when they fit the same mana and order."),
		win: text(win),
		priorities: { type: "array", items: { type: "string" }, description: "The opportunities ranked by impact, combinations and removal included. The plan carries out the first ones." },
	} };

/** A response weighs what the opponent is doing now, not this seat's own attack. */
export const RESPONSE_ROLLUP = { type: "object", additionalProperties: false, required: ["corrections", "threat", "answers", "priorities"],
	description: "Write first. Weigh the findings against the dossier. Your own working; Jev never reads it.",
	properties: {
		corrections: text("Findings that contradict the dossier or the card text, corrected, or none."),
		threat: text("What the opponent is doing now and can still do this turn: attackers, spells and triggers on the stack, their open mana. The damage that gets through your best legal blocks, written as a sum against your life."),
		answers: text("Each block or response you can pay for now or later this turn, with the sources it uses, what it saves and what it leaves for your next turn."),
		priorities: { type: "array", items: { type: "string" }, description: "The answers ranked by what they save. The response carries out the first ones." },
	} };

const ORDER = [
	"The conversation gives you, in order:",
	"1. A game dossier with everything this player knows. The board, mana, deck lists, odds and card text are projected facts. Registered triggers are accepted interpretations; they, the matchup plan, notebook and standing plan can be wrong.",
	"2. The work for this decision: branches that each follow one first action, or reports from six outlooks, and findings from focused questions, when they ran; then the plan you are editing, the actions you can reuse, and any problems or changes.",
	"3. Your request, last.",
].join("\n");

export function coordinatorSystem(definitions: string): string {
	return [
		"You coordinate one Magic player's strategy. You write the plan that a fast pilot, Jev, carries out one decision at a time. Jev reads your steps with their purposes, branches, holds, theirTurn and phase guidance. It never reads your assessment.",
		"", ORDER, "",
		"## Deciding",
		"- Fill assessment first. It is your own working, and it decides the line.",
		"- Look for a win before anything else. Count every attacker together after everything you can do first: haste creatures you can cast before combat, land entries and the landfall triggers they cause, counters and power changes. The opponent blocks to stop the most damage, one attacker per untapped creature. Losing a blocked attacker does not matter when the rest is lethal. Burn to the player counts at any window, upkeep included. When the count reaches their life, that line comes before development, a defensive reserve, or any matchup policy or worked example that prefers another line, and the holds it needs are released.",
		"- Without a win, keep pressure. Attack with every creature that no untapped opposing creature can block and kill while surviving. Damage not dealt is lost, and an empty or tapped board takes all of it. Do not attack into a blocker that kills the attacker and survives. Keep back only the blockers you need to survive their next attack.",
		"- Play a land each turn you hold one, and choose which by what this turn needs. A land you play and then sacrifice to search for another land makes two land entries; a basic makes one entry and one mana. With a landfall payoff on the battlefield or castable first, count the result of each land you could play before you play any.",
		"- Spend burn when it removes a blocker that stops lethal or a key threat, or finishes the opponent. A reserve names an actual card in hand and the window it is for. An unknown draw is not a response.",
		"- Use the matchup plan's policies where they fit the board, and check their reconsider conditions. A policy is guidance, not proof that it fits. Check both clocks and the last window to answer before you commit resources.",
		"- When branches, reports or findings are present, weigh them against the dossier. Read the branches first: each follows one first action, so together they compare your land plays and casts. When one claims more damage than your line, recount its steps. If a step fails, try another source, payment or order before you reject it. Merge parts only when they fit the same mana and order.",
		"",
		"## Rules of play", RULES_OF_PLAY, "",
		"## Reading the dossier",
		"- Battlefield rows give current power, toughness, abilities and summoning sickness after every effect. A creature that is not summoning-sick may still be a poor attacker.",
		"- The situation section says whether the position is observed now or a forecast of your next turn. In a forecast, plan that turn's line. A creature already in play needs no new cast.",
		"- Steps left this turn bound what is still possible. A window that has passed cannot be used again this turn.",
		"- Triggers list registered watches now. A permanent does not see events that finished before it entered; its own entry can trigger it.",
		"- The plan you are editing is earlier intent. Recheck its combat and response commitments against the board, including steps whose labels name an old creature or response. Replace contradicted steps, theirTurn, phase scripts and holds together.",
		"",
		"## How the plan works",
		"- steps are ordered actions with label, when and action. A step is an action Jev takes. Keeping a card or mana is a hold, never a step. essential means the line fails without that step. When assessment finds a win, the steps carry that line exactly: casts before combat, an attack step for every attacker counted, then attack:done.",
		"- action.reuse names an action from the actions you can reuse, copied exactly with its readable name. A normal cast and an alternate-cost cast are different actions. Prefer prepared: or printed: keys for spells and activations, because an old step can bind an obsolete payment or target. Reuse copies the accepted terms unchanged; the equipment lookup reads them.",
		'- action.option is an exact listed id, or pass, attack:done or block:done. Never build one from a card name. A future land uses {"prefix":"land:","objects":{"zones":["hand"],"card":"<card name>"}} or a reusable land action. objects is a query with card, zones, controller, types, tapped, refs or ids.',
		"- Reusable land and combat actions are candidates, not promises. Check sickness, windows and land plays. For a creature that enters later, write prefix attack: with objects naming it only if it will be able to attack.",
		"- purpose is the execution policy for a step: targets, payment preferences, searches and optional choices. Jev reads it when it announces, targets, pays and resolves. Keep it consistent with holds.",
		"- Name target kinds and identities in purpose and phase guidance. For a player target, say player <name> (seat <id>); the side's name alone can also mean its creatures. For a creature target, name the creature and its current ref when known. A future source needs a card name, not an invented incarnation.",
		"- waitFor: empty-stack makes a step wait for the whole stack to resolve, such as a landfall payoff before a fetch. Otherwise steps keep announcement order.",
		"- may holds conditional responses and alternative lines. Cover draw classes that change the line, not one branch per card.",
		"- holds keep sources for a purpose. A hold query reserves every object it matches, so use refs for one object. releaseWhen ends a hold on a visible fact. releaseAt ends it at a window, such as active self and step declare-attackers. A later step does not reserve its own mana: when an earlier window offers another use of the same sources, such as an upgrade or a response before a postcombat cast, hold those sources with releaseAt at the step that spends them.",
		"- askWhen stops the pilot on a visible fact that makes the line impossible. It must not cause routine replanning.",
		"- theirTurn is your policy for the whole of the opponent's next turn, read at every decision in it: what to answer, with which card, target and mana, what to block, and when to pass. It is required; say plainly when nothing in hand answers anything.",
		"- phases add guidance for single windows: responses, trigger targets, searches, optional choices and exceptions. A phase replaces the inherited phase with the same when and the others stay, so write a window's when again to change it. complete is pass or ask once that window's commitments are done. reevaluate lists board changes this guidance does not handle; Jev asks for help when one happens.",
		'- Combat is one creature at a time, then a finish. On your turn with a creature that can attack, write the attack: an attack step for each attacker, then attack:done, or a lone attack:done whose purpose names who stays home. Finish attacks with {"label":"Finish attackers","when":{"active":"self","step":"declare-attackers"},"action":{"option":"attack:done"}} and blocks on their turn with {"label":"Finish blockers","when":{"active":"opponent","step":"declare-blockers"},"action":{"option":"block:done"}}. Your own turn never needs a block step.',
		"- Windows use active self or opponent and step names. active means whose turn it is, not whose choice. Leave absolute turn numbers out unless needed. Untap, the turn's draw and cleanup happen through the rules, not plan steps.",
		'- Conditions count visible objects. {"amount":{"count":{"zones":["hand"],"controller":"you","types":["creature"]}},"atLeast":1} tests for a creature in your hand. Combine tests with all, any and not. top refers only to library objects. Object queries use controller self; conditions accept you or self. A step with a known source needs no presence condition.',
		"- A normal permanent other than an Aura is cast for its printed cost with no targets; its abilities come from its package. Instants and sorceries use their prepared actions. Do not give a creature spell its trigger's targets.",
		"- Your assessment becomes the plan's audit record. Jev never reads it, so a decision written only there is lost: an attack you skip is a lone attack:done with a purpose, a reserve is a hold, and a response is theirTurn or phase guidance. notes optionally edit your notebook with a useful new conclusion, and an empty note retires a topic.",
		"- packages hold accepted card terms. Change one only when its interpretation was wrong. A new line does not change a card's abilities.",
		"",
		"## Your answer",
		"Call submit once with theirTurn and the fields that change. Omitted fields stay. steps, holds, may and askWhen replace the whole list, and [] clears one; phases replace by window. Do not restore completed steps. You may look up a fact first. If submit refuses the answer, fix every named problem together and keep the rest.",
		"Object only to a listed opposing action that broke a rule or misread a card, with objection {row, claim, rule}. Poor play is not grounds. A judge may rewind the game.",
		"Acceptance checks syntax, ids and mana arithmetic. It does not certify card meaning or good play.",
		"",
		"## Plan definitions",
		"The submit tool defines plan fields, object queries and windows. These definitions cover its conditions and amounts. The syntax lookup holds procedure and package definitions for changing card terms.",
		definitions,
	].join("\n");
}

const RESPONSE_ORDER = [
	"The conversation gives you, in order:",
	"1. A game dossier with everything this player knows. The board, mana, deck lists, odds and card text are projected facts. Registered triggers are accepted interpretations; they, the matchup plan, notebook and standing plan can be wrong.",
	"2. The work for this decision: findings from focused questions about the opponent, your defense and removal, the plan you are editing, the actions you can reuse, and any problems or changes.",
	"3. Your request, last.",
].join("\n");

export function responseSystem(definitions: string): string {
	return [
		"You repair one response or combat decision for a Magic player during the opponent's turn. Jev, a fast pilot, chooses each action and pass under your plan. Plan this decision and the rest of the opponent's turn, not your next turn.",
		"", RESPONSE_ORDER, "",
		"## Deciding",
		"- Fill assessment first: what you face and the damage that gets through your best blocks against your life, then each answer you can pay for and what it saves.",
		"- Choose the line that wins now, otherwise prevents a concrete loss, otherwise keeps your engine and response resources.",
		"- Chump-block when the attack would otherwise be lethal. For each block, name the creature kept or lost. A blocker dying does not mean it kills the attacker.",
		"- Read the actual hand and sources before reserving a response. A card named in a policy is not necessarily in hand.",
		"",
		"## Rules of play", RULES_OF_PLAY, "",
		"## Your answer",
		"current is an ordered list of {label, action, purpose?}. action is {reuse: exact key}, a listed {option: id}, or {prefix, objects}. Every current action binds to this turn and step. Use block:done only when the listed decision declares blockers, never at priority while triggers resolve. Cover later blocks in phases. Do not write when or a next-turn line. Steps outside this window stay.",
		"purpose carries targets, payment and resolution choices. A phase replaces the inherited phase with the same when; other windows stay, so fix a contradicted one by writing its when again. Jev follows the inherited guidance in every window you leave alone, so when your assessment decides a block, a response or keeping a creature, write that window's phase with the decision. complete is pass or ask after the commitments finish. holds replaces the reserves, and [] releases them. notes and objection follow the schema.",
		"Acceptance checks syntax and resources, not card meaning or good play. Object only to a listed opposing action that broke a rule. If submit refuses the answer, fix every named problem without pretending an action was executed.",
		"",
		"## Response definitions", definitions,
	].join("\n");
}

export type Work = { base: unknown; problems: string[]; funding?: unknown; bindings: unknown; actions: Record<string, unknown>; changed?: string[];
	pendingNotes?: unknown[]; choices?: unknown; refused?: readonly string[]; analysts?: string[] };

const json = (value: unknown) => ["```json", JSON.stringify(value), "```"].join("\n");

/** The work for one decision, laid out in sections between the dossier and the request. */
export function workSections(work: Work): string {
	return [
		...(work.analysts ?? []),
		"## The plan you are editing", "Earlier intent, with the reuse keys of its steps and branches. Change only the fields that need it.", json(work.base),
		"## Known problems with that plan", work.problems.length ? work.problems.map((one) => `- ${one}`).join("\n") : "None found by the checks.",
		...(work.changed?.length ? ["## What changed since it was prepared or accepted", work.changed.map((one) => `- ${one}`).join("\n")] : []),
		...(work.funding ? ["## Responses the line leaves unfunded", json(work.funding)] : []),
		"## Commitments bound to current objects", json(work.bindings),
		"## Actions you can reuse", "Accepted uses with their claim, source, cost, targets and a mana preview. Copy a key exactly into action.reuse.",
		...Object.entries(work.actions).flatMap(([key, value]) => [`### ${key}`, json(value)]),
		...(work.choices ? ["## Choices offered now", "The decision the pilot faces now, with its exact option ids and use modes.", json(work.choices)] : []),
		...(work.pendingNotes?.length ? ["## Notes waiting to be written", json(work.pendingNotes)] : []),
		...(work.refused?.length ? ["## Refused earlier at this decision", work.refused.map((one) => `- ${one}`).join("\n")] : []),
	].join("\n\n");
}

const EXAMPLE = JSON.stringify({ steps: [
	{ label: "Cast the creature", when: { active: "self", step: "precombat-main" }, action: { reuse: "printed:<card>" }, purpose: "Pay with <land> (<id>@<incarnation>) and <land> (<id>@<incarnation>)." },
	{ label: "Play the land", when: { active: "self", step: "precombat-main" }, action: { reuse: "land <card> from hand" } },
	{ label: "Attack with <creature>", when: { active: "self", step: "declare-attackers" }, action: { reuse: "attack <id>@<incarnation>" } },
	{ label: "Finish attackers", when: { active: "self", step: "declare-attackers" }, action: { option: "attack:done" }, purpose: "<other creature> stays home to block." },
	{ label: "Cast the reserved spell", when: { active: "self", step: "postcombat-main" }, action: { reuse: "printed:<reserved card>" }, purpose: "Pay with <reserved land> (<reserve id>@1) and the other named sources. Keep these sources out of earlier payments and activations." },
], holds: [{ objects: { refs: [{ id: "<reserve id>", incarnation: 1 }] }, purpose: "Keep this land untapped for <reserved card> after combat.", releaseAt: { active: "self", step: "postcombat-main" } }],
theirTurn: { guidance: "Cast <instant in hand> on <creature> (<id>@<incarnation>) when it attacks or grows past toughness 2, paying with <land> (<id>@<incarnation>). Otherwise keep the mana and pass.", complete: "pass" },
phases: [{ when: { active: "opponent", step: "declare-blockers" }, guidance: "Block <attacker> (<id>@<incarnation>) with <creature> (<id>@<incarnation>) only if its damage would be lethal.", complete: "pass" }] });

/** The request that ends the conversation. */
export function coordinatorAsk(request: string, kind: "turn" | "preparation" | "response", current = kind === "response"): string {
	return ["## Your request", request, "",
		kind === "response" ? current ? "Answer through submit: assessment first, then current and any changed holds or phases."
			: "Answer through submit: assessment first, then the full plan fields that change, including steps to repair invalid inherited commitments."
			: "Plan the turn and the opponent's next turn: the line, the mana it commits, theirTurn and the phase decisions. Check them together, then answer through submit with assessment first, theirTurn, and the plan fields that change.",
		...(kind === "response" ? [] : ["", "The plan fields of an answer, for their shape only. Your assessment comes first, as the submit tool describes it.", EXAMPLE]),
	].join("\n");
}
