/** Prepared spells and activations. The claim supplies meaning; the table checks resources.
 * Preparation reads a projection. Execution checks it again before one physical commit.
 */
import { targets, targetId, targetAvailable } from "./targets.ts";
import { Check } from "typebox/value";
import { ProcedureSchema, type Instruction, type Procedure } from "./work-language.ts";
import { select } from "./agenda.ts";
import { project } from "./view.ts";
import { commit } from "./commit.ts";
import { seat, type Activation, type LedgerRow, type Mana, type Table } from "./table.ts";
import type { Frame, Option } from "./types.ts";
import type { Draft } from "./work.ts";
import type { Change } from "./syntax.ts";

export function checkProcedure(procedure: Procedure): void {
	if (!Check(ProcedureSchema, procedure)) throw new Error("The prepared operation does not match the procedure vocabulary.");
	if ((procedure.timing === "spell") !== !!procedure.spell) throw new Error("Spell timing requires spell terms, and only spell timing uses them.");
	if (procedure.timing === "spell" && procedure.cost.tap) throw new Error("A spell does not pay a source tap cost.");
	if (!procedure.instructions.length && procedure.spell?.destination !== "battlefield") throw new Error("This operation needs at least one instruction.");
	if (procedure.instructions.some((instruction) => instruction.do === "damage") && !procedure.target) throw new Error("Damage needs an announced target.");
	if (procedure.timing === "mana" && procedure.instructions.some((instruction) => instruction.do !== "mana")) {
		throw new Error("Immediate mana procedures currently support only adding mana. Other instructions require the stack.");
	}
}

/** Unrestricted, otherwise identical units are interchangeable. Preserve persistence. */
export function payments(pool: Mana[], cost: Procedure["cost"]): string[][] {
	const total = cost.generic + cost.colors.length;
	if (total > pool.length) return [];
	const groups = new Map<string, Mana[]>();
	for (const mana of pool.filter((mana) => !mana.spendOnly).sort((a, b) => a.id.localeCompare(b.id))) {
		const key = `${mana.color}/${!!mana.persists}`;
		groups.set(key, [...(groups.get(key) ?? []), mana]);
	}
	const choices: string[][] = [], buckets = [...groups.values()];
	const walk = (at: number, chosen: Mana[]) => {
		if (chosen.length === total) {
			if (cost.colors.every((color) => chosen.filter((mana) => mana.color === color).length >= cost.colors.filter((wanted) => wanted === color).length)) choices.push(chosen.map((mana) => mana.id));
			return;
		}
		const group = buckets[at];
		if (!group) return;
		for (let count = 0; count <= Math.min(group.length, total - chosen.length); count++) walk(at + 1, [...chosen, ...group.slice(0, count)]);
	};
	walk(0, []);
	return choices;
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

export function procedureOptions(draft: Draft, frame: Frame): ProcedureOption[] {
	const action = draft.steps[draft.next]?.action;
	if (!action || !("procedure" in action) || frame.decision?.situation !== "priority") return [];
	const procedure = action.procedure;
	const pool = frame.view.pools?.find((entry) => entry.seat === frame.seat)?.mana ?? [];
	if (procedure.spell?.speed === "sorcery" && (frame.view.window.kind !== "turn" || frame.view.window.active !== frame.seat ||
		!["precombat-main", "postcombat-main"].includes(frame.view.window.step) || frame.view.objects?.some((object) => object.zone === "stack"))) return [];
	const sources = select(procedure.source, frame).filter((source) => source.card && source.zone === (procedure.timing === "spell" ? "hand" : "battlefield") && source.controller === frame.seat &&
		(!procedure.cost.tap || (!source.tapped && (!source.creature || (source.entered ?? 0) < (frame.view.began ?? 0)))));
	const aimed = procedure.target ? targets(procedure.target, frame.view) : [undefined];
	return sources.flatMap((source) => payments(pool, procedure.cost).flatMap((paid) => aimed.map((aim) => ({
		option: {
			id: `procedure:${draft.id}:${draft.next}:${source.id}@${source.incarnation}:${paid.join(",")}${aim ? ":target:" + targetId(aim.target) : ""}`,
			label: `${procedure.claim} (${source.card})`,
			shows: [
				`Source: ${source.card} (${source.id}@${source.incarnation}).`,
				`Stated cost: ${procedure.cost.tap ? "tap source; " : ""}${procedure.cost.generic} generic${procedure.cost.colors.map((color) => ` + {${color}}`).join("")}.`,
				`Spend ${paid.length ? paid.map((id) => {
					const mana = pool.find((unit) => unit.id === id)!;
					return `{${mana.color}} (${id}, ${mana.persists ? "persists" : "expires at step end"})`;
				}).join(", ") : "no mana"}.`,
				procedure.timing === "mana" ? "Resolves immediately." : procedure.timing === "spell" ? "Cast this card onto the stack." : "Put the ability on the stack.",
				...(aim ? [`Target: ${aim.label}. Chosen on announcement, rechecked on resolution.`] : []),
				...(procedure.spell ? [`Resolves to ${procedure.spell.destination}.`] : []),
				...procedure.instructions.map(instructionText),
				...(procedure.timing !== "mana" ? [procedure.delegate ? "Unique continuations for this seat are delegated." : "Resolution waits for this seat's answers."] : []),
				`Claimed basis: ${procedure.basis}`,
			].join(" "),
			objects: [{ id: source.id, incarnation: source.incarnation }, ...(aim && "id" in aim.target ? [aim.target] : [])],
		},
		activation: { source: { id: source.id, incarnation: source.incarnation }, controller: frame.seat,
			claim: procedure.claim, basis: procedure.basis, timing: procedure.timing, cost: structuredClone(procedure.cost), paid,
			instructions: structuredClone(procedure.instructions), delegate: procedure.delegate,
			...(procedure.spell ? { spell: structuredClone(procedure.spell) } : {}),
			...(aim ? { target: structuredClone(aim.target), targetRule: procedure.target } : {}) },
	}))));
}

/** Paying a stated cost proves neither that the source has the ability nor its legality. */
export function activationChanges(table: Table, activation: Activation): Change[] {
	const { controller, source, cost, paid, instructions, target: _target, targetRule, ...terms } = activation;
	checkProcedure({ ...terms, source: { refs: [source] }, cost, instructions, ...(targetRule ? { target: targetRule } : {}) });
	if (table.outcome || table.resolution || table.cursor.priority !== controller || table.cursor.passes >= table.seats.filter((seat) => !seat.result).length) throw new Error("A prepared action needs this seat's priority opportunity.");
	const view = project(table, controller);
	if (!targetAvailable(activation, { view })) throw new Error("The announced target is unavailable.");
	if (activation.spell?.speed === "sorcery" && (table.cursor.active !== controller || !["precombat-main", "postcombat-main"].includes(table.cursor.steps[0]!) || [...table.things.values()].some((object) => object.zone === "stack"))) throw new Error("This spell needs this seat's main phase and an empty stack.");
	const visible = view.objects?.find((object) => object.id === source.id && object.incarnation === source.incarnation);
	if (!visible?.card || visible.zone !== (activation.timing === "spell" ? "hand" : "battlefield") || visible.controller !== controller) throw new Error("The prepared source is no longer available in this seat's expected zone.");
	if (cost.tap && visible.creature && (visible.entered ?? 0) >= table.cursor.began[controller]!) throw new Error("This creature has not been controlled since the turn began; its tap cost is unavailable.");
	if (cost.tap && visible.tapped) throw new Error("The source was already tapped; its tap cost is unavailable.");
	const pool = seat(table, controller).pool;
	const payment = paid.map((id) => pool.find((mana) => mana.id === id));
	if (new Set(paid).size !== paid.length || paid.length !== cost.generic + cost.colors.length || payment.some((mana) => !mana || mana.spendOnly) ||
		cost.colors.some((color) => payment.filter((mana) => mana?.color === color).length < cost.colors.filter((wanted) => wanted === color).length)) {
		throw new Error("The stated payment is unavailable, restricted, duplicated, or does not cover the stated cost.");
	}
	const changes: Change[] = [
		...(activation.timing === "spell" ? [{ do: "move" as const, what: source.id, to: "stack" as const, reason: "cast" as const }] : []),
		...(cost.tap ? [{ do: "tap" as const, what: source.id }] : []),
		...(paid.length ? [{ do: "spend-mana" as const, who: controller, ids: paid }] : []),
		{ do: "activate", what: source.id, id: `ability-${table.cursor.clock + 1}`, ability: structuredClone(activation) },
	];
	if (activation.timing === "mana") for (const instruction of instructions) {
		if (instruction.do !== "mana") throw new Error("Unsupported immediate instruction.");
		changes.push({ do: "add-mana", who: recipient(table, controller, instruction.who), colors: instruction.colors as Mana["color"][] });
	}
	return [...changes, { do: "turn", action: "act", who: controller }];
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
	commit(table, changes, activation.timing === "spell" ? "cast" : "activate");
}
