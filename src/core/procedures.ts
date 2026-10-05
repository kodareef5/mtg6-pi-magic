/** Prepared spells, lands and activations: checking a procedure, and committing an announcement.
 * The claim supplies meaning; the table checks the shape, timing, resources and
 * targets again against the live table before one physical commit. Offers are in
 * announce.ts, built from the seat's frame.
 * Past 150 lines because every part of a cost is checked and paid in one place.
 */
import { permanentSpell, targetless, type Printed } from "./printed.ts";
import { check, ProcedureSchema, type Amount, type Instruction, type Procedure, type Selector } from "./language.ts";
import { offers, type ProcedureOption } from "./announce.ts";
import { commit } from "./commit.ts";
import { attach } from "./entry.ts";
import { covers, paying, produces } from "./funding.ts";
import { characteristics, intrinsic, sick } from "./characteristics.ts";
import { amount, matches, players, tableWorld, type Scope } from "./selectors.ts";
import { allowance, flashed, playable } from "./permits.ts";
import { cardsIn, seat, type Activation, type LedgerRow, type Mana, type Table } from "./table.ts";
import type { Frame, ObjectRef } from "./types.ts";
import type { Change } from "./syntax.ts";

export type { ProcedureOption } from "./announce.ts";

/** Shared ordinary casting, accepted by the model through package.printedCast. No Oracle parsing. */
export function printedCast(card: string, printed: Printed): Procedure {
	if (!permanentSpell(printed)) throw new Error(`${card} needs a prepared casting procedure.`);
	return { source: { card, zones: ["hand", "graveyard", "exile"], controller: "any" },
		claim: "Cast for its printed cost", basis: `Printed ${printed.type}, ${printed.mana}`, timing: "spell", instructions: [] };
}

/** Shape, then the structure the schema cannot say: refs that point somewhere, timing that fits. */
export function checkProcedure(value: unknown): Procedure {
	const procedure = check(ProcedureSchema, value, "Procedure");
	if (procedure.timing === "land" && (procedure.cost || procedure.targets?.length || procedure.instructions.length)) throw new Error("Playing a land has no cost, targets or instructions; what it registers is its package.");
	if (procedure.timing !== "spell" && procedure.timing !== "land" && !procedure.cost) throw new Error("An activated ability states its cost.");
	if (procedure.timing === "mana" && (procedure.targets?.length || procedure.instructions.some((instruction) => instruction.do !== "mana" || !instruction.colors)))
		throw new Error("A mana ability has no targets and only adds mana of stated colors (605.1a).");
	// A granted registration has its own target slots and local bindings. A
	// delayed or reflexive effect captures current bindings, but cannot bind a
	// name for the program that creates it.
	const refs = (value: unknown, slots: number, bound: Set<string>): void => {
		if (typeof value === "string") {
			const target = value.match(/^(?:(?:controller|owner):)?target:(\d+)$/), name = value.match(/^bound:([a-z][a-z0-9-]*)$/)?.[1];
			if (target && Number(target[1]) >= slots) throw new Error(`target:${target[1]} names a target slot the procedure does not have.`);
			if (name && !bound.has(name)) throw new Error(`bound:${name} is used before an instruction binds it with "as".`);
		} else if (Array.isArray(value)) value.forEach((one) => refs(one, slots, bound));
		else if (value && typeof value === "object") {
			for (const [key, one] of Object.entries(value)) {
				if (key === "registers" || key === "registration") refs(one, 0, new Set());
				else if (key === "effect") {
					const effect = one as { targets?: unknown[]; instructions: Instruction[] };
					const ownSlots = effect.targets?.length || ((value as { do?: string }).do === "delay" ? slots : 0);
					refs(effect.targets, ownSlots, bound); visit(effect.instructions, ownSlots, new Set(bound));
				} else if (key !== "instructions") refs(one, slots, bound);
			}
		}
	};
	const visit = (instructions: Instruction[], slots: number, bound: Set<string>) => {
		for (const instruction of instructions) {
			refs(instruction, slots, bound);
			if (instruction.do === "each") visit(instruction.instructions, slots, new Set([...bound, "player"]));
			if (instruction.as) bound.add(instruction.as);
		}
	};
	visit(procedure.instructions, procedure.targets?.length ?? 0, new Set());
	return procedure;
}

/** A procedure's announcements, while this seat holds priority. */
export function procedureOptions(procedure: Procedure, frame: Frame, prefix: string): ProcedureOption[] {
	return frame.decision?.situation === "priority" ? offers(procedure, frame, prefix) : [];
}

const MAIN = ["precombat-main", "postcombat-main"];
const live = (table: Table, ref: ObjectRef) => { const found = table.things.get(ref.id); return found?.incarnation === ref.incarnation ? found : undefined; };

/** Paying a stated cost proves neither that the source has the ability nor its legality. */
export function activationChanges(table: Table, activation: Activation): Change[] {
	const { controller, source, cost, paid, funding = [] } = activation;
	if (table.outcome || table.resolution || table.cursor.priority !== controller || table.cursor.passes >= table.seats.filter((one) => !one.result).length) throw new Error("A prepared action needs this seat's priority opportunity.");
	const object = live(table, source);
	const fromHand = activation.timing === "spell" || activation.timing === "land";
	const world = tableWorld(table);
	// A card is cast or played from hand, or where a permission lets this seat, whoever owns it.
	if (!object || (fromHand ? !playable(world, controller, object, table.cursor.turn, activation.timing === "land") :
		(object.zone === "battlefield" || object.zone === "stack" ? object.controller : object.owner) !== controller))
		throw new Error("The prepared source is no longer available in this seat's expected zone.");
	const traits = characteristics(table, object);
	const main = table.cursor.active === controller && MAIN.includes(table.cursor.steps[0]!) && !cardsIn(table, "stack").length;
	if (activation.timing === "spell" && !traits?.types.includes("instant") && activation.speed !== "instant" && !flashed(world, controller, object) && !main) throw new Error("This spell needs this seat's main phase and an empty stack.");
	if (activation.timing === "spell" && activation.slots.length && traits && targetless(traits.types, traits.subtypes)) throw new Error("A permanent spell other than an Aura has no targets; its abilities target once it is on the battlefield (601.2c).");
	if (activation.timing === "land" && (!main || seat(table, controller).landsPlayed >= allowance(world, controller).lands)) throw new Error("A land play needs this seat's main phase, an empty stack and an unused land play.");
	if (activation.timing !== "spell" && activation.speed === "sorcery" && !main) throw new Error("This ability is activated only as a sorcery.");

	// Targets are checked with every announced target in scope, so a slot can depend on an earlier one.
	const scope: Scope = { world, controller, source: object, targets: activation.targets, ...(activation.x !== undefined ? { x: activation.x } : {}) };
	activation.slots.forEach((slot, at) => {
		for (const chosen of activation.targets[at] ?? []) {
			const ok = "player" in chosen ? (slot.player === "any" ? table.seats.some((one) => one.id === chosen.player && !one.result) : !!slot.player && players(scope, slot.player).includes(chosen.player))
				: !!slot.object && !!live(table, chosen) && matches(scope, live(table, chosen)!, slot.object);
			if (!ok) throw new Error("An announced target is unavailable.");
		}
		if ((activation.targets[at]?.length ?? 0) < (slot.upTo ? 0 : slot.count ?? 1)) throw new Error("A target slot is not filled.");
	});

	// Costs other than mana: each object must still be there to pay with.
	const own = (ref: ObjectRef, zone: string) => { const one = live(table, ref); if (!one || one.zone !== zone || (zone === "battlefield" ? one.controller : one.owner) !== controller) throw new Error("A cost names something no longer there to pay with."); return one; };
	if (cost.tap && (object.zone !== "battlefield" || object.tapped || sick(table, object))) throw new Error("The source cannot be tapped to pay this cost.");
	for (const ref of cost.tapped ?? []) if (own(ref, "battlefield").tapped) throw new Error("A creature tapped as a cost was already tapped.");
	cost.sacrificed?.forEach((ref) => own(ref, "battlefield"));
	cost.discarded?.forEach((ref) => own(ref, "hand"));
	cost.exiled?.forEach((ref) => { if (!live(table, ref)) throw new Error("The card to exile is gone."); });
	// An object leaves to pay a cost once, a Treasure sacrificed for its own mana included. Only the source may also be tapped.
	// Tapping a creature for mana and then sacrificing it to the cost is fine (601.2g): only a mana ability's own sacrifice uses it up.
	const consumed = [...(cost.sacrificed ?? []), ...(cost.exiled ?? []), ...(cost.discarded ?? []), ...funding.filter((tap) => tap.sacrifice).map((tap) => tap.source)].map((ref) => ref.id);
	if (new Set(consumed).size !== consumed.length || (cost.tapped ?? []).some((ref) => consumed.includes(ref.id))) throw new Error("One object cannot pay two parts of a cost.");
	if (cost.life !== undefined && seat(table, controller).life < cost.life) throw new Error("Not enough life to pay.");
	if (cost.counters && (object.counters[cost.counters.kind] ?? 0) < cost.counters.count) throw new Error("Not enough counters to remove.");

	const pool = seat(table, controller).pool;
	const payment = paid.map((id) => pool.find((mana) => mana.id === id));
	// Restricted mana pays only for what it allows, read against the spell as it will be on the stack.
	const spending = activation.timing === "spell" ? { ...object, zone: "stack" as const } : object;
	const allowed = (spendOnly?: Selector) => !spendOnly || matches(scope, spending, spendOnly, characteristics(table, object));
	const tapped = new Set([...(cost.tap ? [source.id] : []), ...(cost.tapped ?? []).map((ref) => ref.id), ...funding.map((tap) => tap.source.id)]);
	for (const tap of funding) {
		const mana = live(table, tap.source);
		if (!mana || mana.zone !== "battlefield" || mana.controller !== controller || mana.tapped || sick(table, mana)) throw new Error("A mana source in the payment is unavailable.");
		const made = characteristics(table, mana);
		if (tap.intrinsic && !(tap.colors.length === 1 && intrinsic(made).includes(tap.colors[0]!))) throw new Error("A basic land type produces one mana of that type's color.");
		const count = (value: Amount) => amount({ world, controller, source: mana }, value);
		if (!tap.intrinsic && !(made?.registrations ?? []).flatMap((registration) => produces(registration, count)).some((one) => one.colors.join() === tap.colors.join() &&
			JSON.stringify(one.spendOnly) === JSON.stringify(tap.spendOnly) && !!one.sacrifice === !!tap.sacrifice))
			throw new Error("The source has no registered mana ability that makes that mana.");
		if (!allowed(tap.spendOnly)) throw new Error("That mana may not be spent on this.");
	}
	if (new Set(paid).size !== paid.length || tapped.size !== (cost.tap ? 1 : 0) + (cost.tapped?.length ?? 0) + funding.length || payment.some((mana) => !mana || !allowed(mana.spendOnly)) ||
		!covers([...payment.map((mana) => mana?.color as Mana["color"]), ...funding.flatMap((tap) => tap.colors)], cost)) {
		throw new Error("The stated payment is unavailable, restricted, duplicated, or does not cover the stated cost.");
	}

	const changes: Change[] = [
		// Whoever casts or plays it controls it, though another seat may own it (110.2, 305.2).
		...(activation.timing === "spell" ? [{ do: "move" as const, what: source.id, to: "stack" as const, reason: "cast" as const, controller }] : []),
		...(activation.timing === "land" ? [{ do: "move" as const, what: source.id, to: "battlefield" as const, reason: "play-land" as const, controller }] : []),
		...(cost.tap ? [{ do: "tap" as const, what: source.id }] : []),
		...(cost.tapped ?? []).map((ref) => ({ do: "tap" as const, what: ref.id })),
		...(cost.sacrificed ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "graveyard" as const, reason: "sacrifice" as const })),
		...(cost.exiled ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "exile" as const, reason: "cost-payment" as const })),
		...(cost.discarded ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "graveyard" as const, reason: "discard" as const })),
		...(cost.life ? [{ do: "change-life" as const, who: controller, amount: -cost.life, reason: "cost-payment" as const }] : []),
		...(cost.counters ? [{ do: "counters" as const, what: source.id, kind: cost.counters.kind, amount: -cost.counters.count }] : []),
	];
	// Mana abilities activated during payment (601.2g). Their mana is spent in this same group.
	changes.push(...paying({ paid, taps: funding }, controller, table.cursor.clock, changes.length));
	changes.push({ do: "activate", what: source.id, id: `ability-${table.cursor.clock + 1}`, ability: structuredClone(activation) });
	if (activation.timing === "mana") for (const instruction of activation.instructions) {
		if (instruction.do !== "mana" || !instruction.colors) throw new Error("A mana ability only adds mana of stated colors.");
		const times = instruction.times === undefined ? 1 : amount(scope, instruction.times);
		const colors = Array.from({ length: times }, () => instruction.colors as Mana["color"][]).flat();
		for (const who of players(scope, instruction.who)) changes.push({ do: "add-mana", who, colors, ...(instruction.spendOnly ? { spendOnly: instruction.spendOnly } : {}) });
	}
	return [...changes, { do: "turn", action: "act", who: controller, ...(activation.timing === "land" ? { land: true } : {}) }];
}

/** One announced activation is one recorded decision, including its accepted meaning. */
export function activate(table: Table, activation: Activation, choice: Pick<LedgerRow, "picked" | "offered" | "by" | "why" | "execution">,
	registered?: LedgerRow["registered"]): void {
	const changes = activationChanges(table, activation);
	const entered = attach(table, changes, registered);
	table.ledger.push({ seq: table.ledger.length, clock: table.cursor.clock + 1, situation: "priority", seat: activation.controller,
		...structuredClone(choice), activation: structuredClone(activation), ...(Object.keys(entered).length ? { registered: entered } : {}) });
	commit(table, changes, activation.timing === "spell" ? "cast" : activation.timing === "land" ? "play-land" : "activate");
}

export { offers };
