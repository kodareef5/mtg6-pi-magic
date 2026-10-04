/** Prepared spells, lands and activations. The claim supplies meaning; the table checks resources.
 * One offer path serves a draft step and an accepted interpretation alike.
 * Preparation reads a projection. Execution checks it again before one physical commit.
 * Past 150 lines because offering and checking the same announcement belong together.
 */
import { targets, targetId, targetAvailable } from "./targets.ts";
import { Check } from "typebox/value";
import { ProcedureSchema, type Instruction, type Procedure } from "./work-language.ts";
import { select } from "./agenda.ts";
import { project } from "./view.ts";
import { commit } from "./commit.ts";
import { fundings, covers, sameness, type Cost } from "./funding.ts";
import { facts, intrinsicMana, isCreature, manaCost } from "./printed.ts";
import { seat, thing, type Activation, type LedgerRow, type Mana, type Table } from "./table.ts";
import type { Frame, Option } from "./types.ts";
import type { Draft } from "./work.ts";
import type { Change } from "./syntax.ts";

const FREE: Cost = { tap: false, generic: 0, colors: [] };

export function checkProcedure(procedure: Procedure): void {
	if (!Check(ProcedureSchema, procedure)) throw new Error("The prepared operation does not match the procedure vocabulary.");
	if ((procedure.timing === "spell") !== !!procedure.spell) throw new Error("Spell timing requires spell terms, and only spell timing uses them.");
	if (procedure.timing === "land" && (procedure.cost || procedure.target || procedure.instructions.length)) throw new Error("Playing a land has no cost, target or instructions in this vocabulary.");
	if (!procedure.cost && procedure.timing !== "spell" && procedure.timing !== "land") throw new Error("An activated ability states its cost.");
	if (procedure.timing === "spell" && procedure.cost?.tap) throw new Error("A spell does not pay a source tap cost.");
	if (!procedure.instructions.length && procedure.timing !== "land" && procedure.spell?.destination !== "battlefield") throw new Error("This operation needs at least one instruction.");
	if (procedure.instructions.some((instruction) => instruction.do === "damage") && !procedure.target) throw new Error("Damage needs an announced target.");
	if (procedure.timing === "mana" && procedure.instructions.some((instruction) => instruction.do !== "mana")) {
		throw new Error("Immediate mana procedures currently support only adding mana. Other instructions require the stack.");
	}
}

export type ProcedureOption = { option: Option; activation: Activation };

/** Describe the executable terms, even when the claim or quoted basis disagrees. */
function instructionText(instruction: Instruction): string {
	const who = instruction.do !== "damage" && instruction.who === "self" ? "Source controller" : "Opponent";
	switch (instruction.do) {
		case "damage": return `Deal ${instruction.amount} damage to the announced target.`;
		case "draw": return `${who} draws ${instruction.count} card${instruction.count === 1 ? "" : "s"}.`;
		case "choose-move": return `${who} chooses one card from their ${instruction.from} to put into ${instruction.to} (${instruction.reason}).`;
		case "life": return `${who} changes life by ${instruction.amount}.`;
		case "mana": return `${who} adds ${instruction.colors.map((color) => `{${color}}`).join(" ")}.`;
	}
}

const MAIN = ["precombat-main", "postcombat-main"];
/** A sorcery-speed action or a land play needs this seat's main phase and an empty stack. */
const mainWindow = (frame: Frame) => frame.view.window.kind === "turn" && frame.view.window.active === frame.seat &&
	MAIN.includes(frame.view.window.step) && !frame.view.objects?.some((object) => object.zone === "stack");

/** The current draft step's announcements, while this seat holds priority. */
export function procedureOptions(draft: Draft, frame: Frame): ProcedureOption[] {
	const action = draft.steps[draft.next]?.action;
	if (!action || !("procedure" in action) || frame.decision?.situation !== "priority") return [];
	return offers(action.procedure, frame, `procedure:${draft.id}:${draft.next}`);
}

/** Every source, payment and target this seat could announce for one procedure now. */
export function offers(procedure: Procedure, frame: Frame, prefix: string): ProcedureOption[] {
	if (procedure.spell?.speed === "sorcery" && !mainWindow(frame)) return [];
	if (procedure.timing === "land" && (!mainWindow(frame) || (frame.view.landsPlayed ?? 0) >= 1)) return [];
	const fromHand = procedure.timing === "spell" || procedure.timing === "land";
	const sick = (source: { card?: string; entered?: number }) => isCreature(frame.view.printed?.[source.card ?? ""]) && (source.entered ?? 0) >= (frame.view.began ?? 0);
	// Identical objects are one source; the lowest id stands for the rest.
	const seen = new Set<string>();
	const sources = select(procedure.source, frame).filter((source) => source.card && source.zone === (fromHand ? "hand" : "battlefield") && source.controller === frame.seat &&
		(!procedure.cost?.tap || (!source.tapped && !sick(source))) && !seen.has(sameness(frame, source)) && !!seen.add(sameness(frame, source)));
	const aimed = procedure.target ? targets(procedure.target, frame.view) : [undefined];
	return sources.flatMap((source) => {
		const cost = procedure.cost ?? (procedure.timing === "land" ? FREE : manaCost(frame.view.printed?.[source.card!]));
		if (!cost) return [];
		return fundings(frame, cost, cost.tap ? source.id : undefined).flatMap(({ funding, shows: paying }) => aimed.map((aim) => ({
			option: {
				id: `${prefix}:${source.id}@${source.incarnation}:${[...funding.paid, ...funding.taps.map((tap) => tap.source.id)].join(",") || "free"}${aim ? ":target:" + targetId(aim.target) : ""}`,
				label: `${procedure.claim} (${source.card})`,
				shows: [
					`Source: ${source.card} (${source.id}@${source.incarnation}).`,
					procedure.timing === "land" ? "Play this land. It uses this turn's land play." :
						`${procedure.cost ? "Stated" : "Printed"} cost: ${cost.tap ? "tap source; " : ""}${cost.generic} generic${cost.colors.map((color) => ` + {${color}}`).join("")}.`,
					...(procedure.timing === "land" ? [] : [paying]),
					procedure.timing === "mana" ? "Resolves immediately." : procedure.timing === "spell" ? "Cast this card onto the stack." : procedure.timing === "stack" ? "Put the ability on the stack." : "",
					...(aim ? [`Target: ${aim.label}. Chosen on announcement, rechecked on resolution.`] : []),
					...(procedure.spell ? [`Resolves to ${procedure.spell.destination}.`] : []),
					...procedure.instructions.map(instructionText),
					...(procedure.timing === "spell" || procedure.timing === "stack" ? [procedure.delegate ? "Unique continuations for this seat are delegated." : "Resolution waits for this seat's answers."] : []),
					`Claimed basis: ${procedure.basis}`,
				].filter(Boolean).join(" "),
				objects: [{ id: source.id, incarnation: source.incarnation }, ...funding.taps.map((tap) => tap.source), ...(aim && "id" in aim.target ? [aim.target] : [])],
			},
			activation: { source: { id: source.id, incarnation: source.incarnation }, controller: frame.seat,
				claim: procedure.claim, basis: procedure.basis, timing: procedure.timing, cost: structuredClone(cost), paid: funding.paid,
				...(funding.taps.length ? { funding: structuredClone(funding.taps) } : {}),
				instructions: structuredClone(procedure.instructions), delegate: procedure.delegate,
				...(procedure.spell ? { spell: structuredClone(procedure.spell) } : {}),
				...(aim ? { target: structuredClone(aim.target), targetRule: procedure.target } : {}) },
		})));
	});
}

/** Paying a stated cost proves neither that the source has the ability nor its legality. */
export function activationChanges(table: Table, activation: Activation): Change[] {
	const { controller, source, cost, paid, funding = [], instructions, target: _target, targetRule, ...terms } = activation;
	checkProcedure({ ...terms, source: { refs: [source] }, ...(activation.timing === "land" ? {} : { cost }), instructions, ...(targetRule ? { target: targetRule } : {}) });
	if (table.outcome || table.resolution || table.cursor.priority !== controller || table.cursor.passes >= table.seats.filter((seat) => !seat.result).length) throw new Error("A prepared action needs this seat's priority opportunity.");
	const view = project(table, controller);
	if (!targetAvailable(activation, { view })) throw new Error("The announced target is unavailable.");
	const main = table.cursor.active === controller && MAIN.includes(table.cursor.steps[0]!) && ![...table.things.values()].some((object) => object.zone === "stack");
	if (activation.spell?.speed === "sorcery" && !main) throw new Error("This spell needs this seat's main phase and an empty stack.");
	if (activation.timing === "land" && (!main || seat(table, controller).landsPlayed >= 1)) throw new Error("A land play needs this seat's main phase, an empty stack and an unused land play.");
	const fromHand = activation.timing === "spell" || activation.timing === "land";
	const visible = view.objects?.find((object) => object.id === source.id && object.incarnation === source.incarnation);
	if (!visible?.card || visible.zone !== (fromHand ? "hand" : "battlefield") || visible.controller !== controller) throw new Error("The prepared source is no longer available in this seat's expected zone.");
	const sick = (id: string) => { const object = thing(table, id); return isCreature(facts(table, object)) && (object.entered ?? 0) >= table.cursor.began[controller]!; };
	if (cost.tap && sick(source.id)) throw new Error("This creature has not been controlled since the turn began; its tap cost is unavailable.");
	if (cost.tap && visible.tapped) throw new Error("The source was already tapped; its tap cost is unavailable.");
	const pool = seat(table, controller).pool;
	const payment = paid.map((id) => pool.find((mana) => mana.id === id));
	const tapped = new Set([...(cost.tap ? [source.id] : []), ...funding.map((tap) => tap.source.id)]);
	for (const tap of funding) {
		const object = view.objects?.find((one) => one.id === tap.source.id && one.incarnation === tap.source.incarnation);
		if (!object || object.zone !== "battlefield" || object.controller !== controller || object.tapped || sick(object.id)) throw new Error("A mana source in the payment is unavailable.");
		const intrinsic = intrinsicMana(facts(table, thing(table, object.id)));
		if (tap.intrinsic && !(tap.colors.length === 1 && intrinsic.includes(tap.colors[0]!))) throw new Error("A basic land type produces one mana of that type's color.");
	}
	if (new Set(paid).size !== paid.length || tapped.size !== (cost.tap ? 1 : 0) + funding.length || payment.some((mana) => !mana || mana.spendOnly) ||
		!covers([...payment.map((mana) => mana?.color as Mana["color"]), ...funding.flatMap((tap) => tap.colors)], cost)) {
		throw new Error("The stated payment is unavailable, restricted, duplicated, or does not cover the stated cost.");
	}
	const changes: Change[] = [
		...(activation.timing === "spell" ? [{ do: "move" as const, what: source.id, to: "stack" as const, reason: "cast" as const }] : []),
		...(activation.timing === "land" ? [{ do: "move" as const, what: source.id, to: "battlefield" as const, reason: "play-land" as const }] : []),
		...(cost.tap ? [{ do: "tap" as const, what: source.id }] : []),
	];
	// Mana abilities activated during payment (601.2g). Their mana is spent in this same group.
	const made: string[] = [];
	for (const tap of funding) {
		changes.push({ do: "tap", what: tap.source.id });
		tap.colors.forEach((_, unit) => made.push(`mana-${table.cursor.clock + 1}-${changes.length}-${unit}`));
		changes.push({ do: "add-mana", who: controller, colors: tap.colors });
	}
	if (paid.length || made.length) changes.push({ do: "spend-mana", who: controller, ids: [...paid, ...made] });
	changes.push({ do: "activate", what: source.id, id: `ability-${table.cursor.clock + 1}`, ability: structuredClone(activation) });
	if (activation.timing === "mana") for (const instruction of instructions) {
		if (instruction.do !== "mana") throw new Error("Unsupported immediate instruction.");
		changes.push({ do: "add-mana", who: recipient(table, controller, instruction.who), colors: instruction.colors as Mana["color"][] });
	}
	return [...changes, { do: "turn", action: "act", who: controller, ...(activation.timing === "land" ? { land: true } : {}) }];
}

export function recipient(table: Table, controller: number, who: "self" | "opponent"): number {
	if (who === "self") return controller;
	const others = table.seats.filter((seat) => seat.id !== controller && !seat.result);
	if (others.length !== 1) throw new Error("An opponent-relative instruction requires exactly one opponent.");
	return others[0]!.id;
}

/** One announced activation is one recorded decision, including its accepted meaning. */
export function activate(table: Table, activation: Activation, choice: Pick<LedgerRow, "picked" | "offered" | "by" | "why" | "execution">): void {
	const changes = activationChanges(table, activation);
	table.ledger.push({ seq: table.ledger.length, clock: table.cursor.clock + 1, situation: "priority", seat: activation.controller,
		...structuredClone(choice), activation: structuredClone(activation) });
	commit(table, changes, activation.timing === "spell" ? "cast" : activation.timing === "land" ? "play-land" : "activate");
}
