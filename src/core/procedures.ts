/** Generic prepared activations. The claim supplies meaning; the table checks resources.
 * Preparation reads a projection. Execution checks it again before one physical commit.
 */
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
	const who = instruction.who === "self" ? "Source controller" : "Opponent";
	switch (instruction.do) {
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
	const sources = select(procedure.source, frame).filter((source) => source.card && source.zone === "battlefield" && source.controller === frame.seat && (!procedure.cost.tap || !source.tapped));
	return sources.flatMap((source) => payments(pool, procedure.cost).map((paid) => ({
		option: {
			id: `procedure:${draft.id}:${draft.next}:${source.id}@${source.incarnation}:${paid.join(",")}`,
			label: `${procedure.claim} (${source.card})`,
			shows: [
				`Source: ${source.card} (${source.id}@${source.incarnation}).`,
				`Stated cost: ${procedure.cost.tap ? "tap source; " : ""}${procedure.cost.generic} generic${procedure.cost.colors.map((color) => ` + {${color}}`).join("")}.`,
				`Spend ${paid.length ? paid.map((id) => {
					const mana = pool.find((unit) => unit.id === id)!;
					return `{${mana.color}} (${id}, ${mana.persists ? "persists" : "expires at step end"})`;
				}).join(", ") : "no mana"}.`,
				procedure.timing === "mana" ? "Resolves immediately." : "Put the ability on the stack.",
				...procedure.instructions.map(instructionText),
				...(procedure.timing === "stack" ? [procedure.delegate ? "Unique continuations for this seat are delegated." : "Resolution waits for this seat's answers."] : []),
				`Claimed basis: ${procedure.basis}`,
			].join(" "),
			objects: [{ id: source.id, incarnation: source.incarnation }],
		},
		activation: { source: { id: source.id, incarnation: source.incarnation }, controller: frame.seat,
			claim: procedure.claim, basis: procedure.basis, timing: procedure.timing, cost: structuredClone(procedure.cost), paid,
			instructions: structuredClone(procedure.instructions), delegate: procedure.delegate },
	})));
}

/** Paying a stated cost proves neither that the source has the ability nor its legality. */
export function activationChanges(table: Table, activation: Activation): Change[] {
	const { controller, source, cost, paid, instructions, ...terms } = activation;
	checkProcedure({ ...terms, source: { refs: [source] }, cost, instructions });
	if (table.outcome || table.resolution || table.cursor.priority !== controller || table.cursor.passes >= table.seats.filter((seat) => !seat.result).length) throw new Error("An activation needs this seat's priority opportunity.");
	const visible = project(table, controller).objects?.find((object) => object.id === source.id && object.incarnation === source.incarnation);
	if (!visible?.card || visible.zone !== "battlefield" || visible.controller !== controller) throw new Error("The activation source is no longer an available permanent in this seat's view.");
	if (cost.tap && visible.tapped) throw new Error("The source was already tapped; its tap cost is unavailable.");
	const pool = seat(table, controller).pool;
	const payment = paid.map((id) => pool.find((mana) => mana.id === id));
	if (new Set(paid).size !== paid.length || paid.length !== cost.generic + cost.colors.length || payment.some((mana) => !mana || mana.spendOnly) ||
		cost.colors.some((color) => payment.filter((mana) => mana?.color === color).length < cost.colors.filter((wanted) => wanted === color).length)) {
		throw new Error("The stated payment is unavailable, restricted, duplicated, or does not cover the stated cost.");
	}
	const changes: Change[] = [
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
	commit(table, changes, "activate");
}
