/** Prepared spells, lands and activations: checking a procedure, and committing an announcement.
 * The claim supplies meaning; the table checks the shape, timing, resources and
 * targets again against the live table before one physical commit. Offers are in
 * announce.ts, built from the seat's frame.
 * Past 150 lines because every part of a cost is checked and paid in one place.
 */
import { costChanges } from "./costs.ts";
import { announcedActivation, announcementPayments } from "./announcement-options.ts";
import { project } from "./view.ts";
import { castWords } from "./cast-words.ts";
import { checkExile, enoughExile } from "./cost-selection.ts";
import { isDeepStrictEqual } from "node:util";
import { castableFace, faceFacts } from "./faces.ts";
import { permanentSpell, targetless, type Printed } from "./printed.ts";
import { check, ProcedureSchema, type Instruction, type Procedure, type Selector, type Target } from "./language.ts";
import { offers, type ProcedureOption } from "./announce.ts";
import { commit } from "./commit.ts";
import { attach } from "./entry.ts";
import { beforeEntry } from "./entry-payments.ts";
import { selectionScoped } from "./inspection.ts";
import { instantLoyalty, loyaltyUsed } from "./activated.ts";
import { covers, manaTerms, paying, produces, spentWords } from "./funding.ts";
import { characteristics, intrinsic, sick } from "./characteristics.ts";
import { amount, matches, players, tableWorld, type Scope } from "./selectors.ts";
import { allowance, activationRestrictions, castingPrices, castRestrictions, flashed, playable } from "./permits.ts";
import { cardsIn, seat, type Activation, type LedgerRow, type Mana, type Table } from "./table.ts";
import type { Frame, ObjectRef } from "./types.ts";
import type { Change } from "./syntax.ts";

export type { ProcedureOption } from "./announce.ts";

/** Shared ordinary casting, accepted by the model through package.printedCast. No Oracle parsing. */
export function printedCast(card: string, printed: Printed, face?: 0 | 1): Procedure {
	const selected = faceFacts(printed, face ?? 0);
	if (!castableFace(printed, face ?? 0) || !permanentSpell(selected)) throw new Error(`${card} needs a prepared casting procedure.`);
	return { ...(face !== undefined ? { face } : {}), source: { card, zones: ["hand", "graveyard", "exile"], controller: "any" },
		claim: "Cast for its printed cost", basis: `Printed ${selected!.type}, ${selected!.mana}`, timing: "spell", instructions: [] };
}

/** Older packages wrote an empty procedure for the shared cast. Recognize
 * only that exact operation; conditions, extra costs and spell effects remain
 * the model's terms. This reads structured syntax, never printed prose.
 */
export function isPrintedCast(procedure: Procedure, card: string, printed: Printed): boolean {
	return permanentSpell(printed) && procedure.timing === "spell" && !procedure.face && procedure.source.card === card &&
		(procedure.source.zones ?? ["hand"]).includes("hand") &&
		(!procedure.source.controller || procedure.source.controller === "self" || procedure.source.controller === "any") &&
		Object.keys(procedure.source).every((key) => ["card", "zones", "controller"].includes(key)) &&
		!procedure.instructions.length && !procedure.targets?.length && !procedure.words?.length && !procedure.if && !procedure.limit &&
		(!procedure.speed || procedure.speed === "sorcery") &&
		(!procedure.cost || Object.keys(procedure.cost).every((key) => key === "mana") && procedure.cost.mana === printed.mana);
}

/** Shape, then the structure the schema cannot say: refs that point somewhere, timing that fits. */
export function checkProcedure(value: unknown): Procedure {
	const procedure = check(ProcedureSchema, value, "Procedure");
	if (procedure.cost?.loyalty !== undefined && procedure.timing !== "stack") throw new Error("A loyalty-symbol cost belongs to a stack activation, never a spell, land play or mana ability.");
	if (typeof procedure.cost?.tap === "object" && procedure.cost.tap.upTo && procedure.cost.tap.totalPower !== undefined)
		throw new Error("An optional bounded tap cost cannot also require a total power.");
	if (procedure.timing === "land" && (procedure.cost || procedure.targets?.length || procedure.instructions.length)) throw new Error("Playing a land has no cost, targets or instructions; what it registers is its package.");
	if (procedure.timing !== "spell" && procedure.timing !== "land" && !procedure.cost) throw new Error("An activated ability states its cost.");
	if (procedure.timing === "mana" && (procedure.targets?.length || procedure.instructions.some((instruction) => instruction.do !== "mana" || !instruction.colors)))
		throw new Error("A mana ability has no targets and only adds mana of stated colors (605.1a).");
	const exilesSource = procedure.cost?.exile === "this" || (typeof procedure.cost?.exile === "object" && "choose" in procedure.cost.exile && procedure.cost.exile.source);
	checkReferences(procedure, procedure.targets?.length ?? 0, new Set(exilesSource ? ["cost-source"] : []));
	return procedure;
}

/** Procedures and standing effects obey the same target and binding scopes. This does not interpret their source. */
export function checkReferences(value: unknown, slots = 0, bound = new Set<string>()): void {
	// A granted registration has its own target slots and local bindings. A
	// delayed or reflexive effect captures current bindings, but cannot bind a
	// name for the program that creates it.
	const refs = (value: unknown, slots: number, bound: Set<string>): void => {
		if (typeof value === "string") {
			const target = value.match(/^(?:(?:controller|owner):)?target:(\d+)$/), name = value.match(/^(?:(?:controller|owner):)?bound:([a-z][a-z0-9-]*)$/)?.[1];
			if (target && Number(target[1]) >= slots) throw new Error(`target:${target[1]} names a target slot the procedure does not have.`);
			if (name && !bound.has(name)) throw new Error(`bound:${name} is used before an instruction binds it with "as".`);
		} else if (Array.isArray(value)) value.forEach((one) => refs(one, slots, bound));
		else if (value && typeof value === "object") {
			const terms = value as { cost?: import("./language.ts").Cost; pays?: import("./language.ts").Cost; kind?: string; timing?: string };
			for (const cost of [terms.cost, terms.pays]) if (cost?.additional) {
				if (terms.timing !== "spell") throw new Error("Named additional mana costs belong to a spell announcement, not an activation or resolving payment.");
				if (new Set(cost.additional.map((one) => one.name)).size !== cost.additional.length)
					throw new Error("Each additional cost instance needs a distinct name.");
			}
			if (terms.cost?.loyalty !== undefined && terms.cost.counters?.kind === "loyalty")
				throw new Error("Combine all loyalty-symbol adjustments in cost.loyalty, without a second loyalty counter cost.");
			if (terms.kind === "mana" && terms.cost?.loyalty !== undefined) throw new Error("A loyalty ability cannot be a mana ability.");
			for (const [key, one] of Object.entries(value)) {
				if (key === "targets" && Array.isArray(one)) for (const slot of one as Target[]) {
					if (slot.atLeast !== undefined && (slot.upTo || slot.atLeast > (slot.count ?? 1)))
						throw new Error("A target minimum cannot exceed its count or combine with upTo.");
				}
				if (key === "registers" || key === "registration") refs(one, 0, new Set());
				else if (key === "effect") {
					const effect = one as { targets?: unknown[]; instructions: Instruction[] };
					const ownSlots = effect.targets?.length || ((value as { do?: string }).do === "delay" ? slots : 0);
					refs(effect, ownSlots, new Set(bound));
				} else if (key === "modes" && Array.isArray(one)) {
					for (const mode of one as { targets?: unknown[] }[]) refs(mode, mode.targets?.length ?? 0, new Set(bound));
				} else if (key !== "instructions") refs(one, slots, bound);
			}
			if ("instructions" in value && Array.isArray(value.instructions))
				visit(value.instructions, slots, (value as { do?: string }).do === "each" ? new Set([...bound, "player"]) : bound);
		}
	};
	const visit = (instructions: Instruction[], slots: number, bound: Set<string>) => {
		for (const instruction of instructions) {
			if (instruction.do === "counter" && instruction.as)
				throw new Error("counter does not supply an as binding. Use counter.to for a countered spell's replacement destination; report other unsupported counter-result dependencies.");
			if (instruction.do === "choose" && instruction.from.zones?.includes("library") && !selectionScoped(instruction.from))
				throw new Error("A library selection needs an explicit owner, controller or inspected binding in every branch; card characteristics do not grant a search.");
			refs(instruction, slots, bound);
			if (instruction.as) bound.add(instruction.as);
		}
	};
	refs(value, slots, bound);
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
	if (cost.additional && (activation.timing !== "spell" || new Set(cost.additional).size !== cost.additional.length))
		throw new Error("Named additional payments require a spell and distinct cost instances.");
	if (cost.loyalty !== undefined && cost.counters?.kind === "loyalty") throw new Error("Combine loyalty payment in one signed cost.");
	if (table.outcome || table.resolution || table.cursor.priority !== controller || table.cursor.passes >= table.seats.filter((one) => !one.result).length) throw new Error("A prepared action needs this seat's priority opportunity.");
	const object = live(table, source);
	const fromHand = activation.timing === "spell" || activation.timing === "land";
	const world = tableWorld(table);
	if (activation.timing === "spell" && castRestrictions(world, controller).length) throw new Error(`Casting is prohibited: ${castRestrictions(world, controller).join("; ")}`);
	// A card is cast or played from hand, or where a permission lets this seat, whoever owns it.
	if (!object || (fromHand ? !playable(world, controller, object, table.cursor.turn, activation.timing === "land", activation.face) :
		(object.zone === "battlefield" || object.zone === "stack" ? object.controller : object.owner) !== controller))
		throw new Error("The prepared source is no longer available in this seat's expected zone.");
	if (!fromHand && activationRestrictions(world, object, activation.timing === "mana").length)
		throw new Error(`Activation is prohibited: ${activationRestrictions(world, object, activation.timing === "mana").join("; ")}`);
	if (activation.timing === "spell" && !castableFace(object.card ? table.printed[object.card] : undefined, activation.face ?? 0, object)) throw new Error("This card cannot be cast using that face.");
	if (activation.timing === "spell" && !castingPrices(world, controller, object, table.cursor.turn, activation.face)
		.some((price) => price.permission === activation.permission && price.leavesStack === activation.leavesStack)) throw new Error("The selected casting permission or its departure replacement is no longer available.");
	const spell = activation.timing === "spell" ? { ...object, controller, zone: "stack" as const, face: activation.face ?? 0 as const, ability: activation } : object;
	const traits = characteristics(table, spell);
	if (activation.registered && !traits?.registrations.some((one) => one.kind === "activated" && one.basis === activation.registered))
		throw new Error("The source no longer has that registered activated ability.");
	const main = table.cursor.active === controller && MAIN.includes(table.cursor.steps[0]!) && !cardsIn(table, "stack").length;
	if (cost.loyalty !== undefined && (activation.timing !== "stack" || object.zone !== "battlefield" || !(main || instantLoyalty(world, controller, object)) || loyaltyUsed(world, source)))
		throw new Error("A loyalty ability needs its controller's main phase and an empty stack, or a timing permission, and no earlier loyalty activation of this permanent this turn.");
	if (cost.loyalty !== undefined && (object.counters.loyalty ?? 0) + cost.loyalty < 0) throw new Error("Not enough loyalty counters to pay.");
	if (activation.timing === "spell" && !traits?.types.includes("instant") && activation.speed !== "instant" && !flashed(world, controller, spell) && !main) throw new Error("This spell needs this seat's main phase and an empty stack.");
	if (activation.timing === "spell" && activation.slots.length && traits && targetless(traits.types, traits.subtypes)) throw new Error("A permanent spell other than an Aura has no targets; its abilities target once it is on the battlefield (601.2c).");
	if (activation.timing === "land" && (!main || seat(table, controller).landsPlayed >= allowance(world, controller).lands)) throw new Error("A land play needs this seat's main phase, an empty stack and an unused land play.");
	if (activation.timing !== "spell" && activation.speed === "sorcery" && !main) throw new Error("This ability is activated only as a sorcery.");

	// Targets are checked with every announced target in scope, so a slot can depend on an earlier one.
	const scope: Scope = { world, controller, source: spell, targets: activation.targets, ...(activation.x !== undefined ? { x: activation.x } : {}) };
	if (activation.exileSelection) checkExile(scope, activation.exileSelection, cost.exiled ?? []);
	activation.slots.forEach((slot, at) => {
		const chosen = activation.targets[at] ?? [], minimum = slot.atLeast ?? (slot.upTo ? 0 : slot.count ?? 1);
		if (chosen.length < minimum || chosen.length > (slot.count ?? 1)) throw new Error("A target slot has the wrong number of targets.");
		if (new Set(chosen.map((one) => "player" in one ? `player:${one.player}` : `${one.id}@${one.incarnation}`)).size !== chosen.length)
			throw new Error("One target slot cannot name the same target twice.");
		for (const chosen of activation.targets[at] ?? []) {
			const ok = "player" in chosen ? (slot.player === "any" ? table.seats.some((one) => one.id === chosen.player && !one.result) : !!slot.player && players(scope, slot.player).includes(chosen.player))
				: !!slot.object && !!live(table, chosen) && matches(scope, live(table, chosen)!, slot.object);
			if (!ok) throw new Error("An announced target is unavailable.");
		}
	});

	// Costs other than mana: each object must still be there to pay with.
	const own = (ref: ObjectRef, zone: string) => { const one = live(table, ref); if (!one || one.zone !== zone || (zone === "battlefield" ? one.controller : one.owner) !== controller) throw new Error("A cost names something no longer there to pay with."); return one; };
	if (cost.tap && (object.zone !== "battlefield" || object.tapped || sick(table, object))) throw new Error("The source cannot be tapped to pay this cost.");
	if (new Set((cost.tapped ?? []).map((one) => one.id)).size !== (cost.tapped ?? []).length) throw new Error("One permanent cannot be tapped twice to pay a cost.");
	for (const ref of cost.tapped ?? []) if (own(ref, "battlefield").tapped) throw new Error("A creature tapped as a cost was already tapped.");
	cost.sacrificed?.forEach((ref) => own(ref, "battlefield"));
	cost.returned?.forEach((ref) => own(ref, "battlefield"));
	cost.discarded?.forEach((ref) => own(ref, "hand"));
	cost.exiled?.forEach((ref) => { if (!live(table, ref)) throw new Error("The card to exile is gone."); });
	// An object leaves to pay a cost once, a Treasure sacrificed for its own mana included. Only the source may also be tapped.
	// Tapping a creature for mana and then sacrificing it to the cost is fine (601.2g): only a mana ability's own sacrifice uses it up.
	const consumed = [...(cost.sacrificed ?? []), ...(cost.returned ?? []), ...(cost.exiled ?? []), ...(cost.discarded ?? []), ...funding.filter((tap) => tap.sacrifice).map((tap) => tap.source)].map((ref) => ref.id);
	if (new Set(consumed).size !== consumed.length || (cost.tapped ?? []).some((ref) => consumed.includes(ref.id))) throw new Error("One object cannot pay two parts of a cost.");
	if (seat(table, controller).life < (cost.life ?? 0) + funding.reduce((sum, tap) => sum + (tap.life ?? 0), 0)) throw new Error("Not enough life to pay.");
	if (cost.counters) {
		const on = cost.counters.on ?? [source];
		if (!on.length || new Set(on.map((one) => one.id)).size !== on.length || on.some((ref) => {
			const permanent = own(ref, "battlefield");
			return !cost.counters!.put && (permanent.counters[cost.counters!.kind] ?? 0) < cost.counters!.count;
		}))
			throw new Error("Not enough distinct objects with counters to remove.");
	}
	for (const shown of cost.shown ?? []) own(shown, shown.reveal ? "hand" : "battlefield");

	const pool = seat(table, controller).pool;
	const payment = paid.map((id) => pool.find((mana) => mana.id === id));
	// Restricted mana pays only for what it allows, read against the spell as it will be on the stack.
	const spending = spell;
	const allowed = (spendOnly?: Selector) => !spendOnly || matches(scope, spending, spendOnly, traits);
	const tapped = new Set([...(cost.tap ? [source.id] : []), ...(cost.tapped ?? []).map((ref) => ref.id), ...funding.map((tap) => tap.source.id)]);
	for (const tap of funding) {
		const mana = live(table, tap.source);
		if (!mana || mana.zone !== "battlefield" || mana.controller !== controller || mana.tapped || sick(table, mana)) throw new Error("A mana source in the payment is unavailable.");
		if (activationRestrictions(world, mana, true).length) throw new Error("A mana source in the payment cannot activate its ability.");
		const made = characteristics(table, mana);
		if (tap.intrinsic && !(tap.colors.length === 1 && intrinsic(made).includes(tap.colors[0]!) && !tap.spellWords && !tap.spendOnly && !tap.until && !tap.sacrifice && !tap.life)) throw new Error("A basic land type produces one mana of that type's color with no additional effects.");
		if (!tap.intrinsic && !(made?.registrations ?? []).flatMap((registration) => produces(registration, { world, controller, source: mana })).some((one) => one.colors.join() === tap.colors.join() &&
			JSON.stringify(one.spendOnly) === JSON.stringify(tap.spendOnly) && JSON.stringify(one.spellWords) === JSON.stringify(tap.spellWords) && one.until === tap.until && !!one.sacrifice === !!tap.sacrifice && (one.life ?? 0) === (tap.life ?? 0)))
			throw new Error("The source has no registered mana ability that makes that mana.");
		if (!allowed(tap.spendOnly)) throw new Error("That mana may not be spent on this.");
	}
	if (new Set(paid).size !== paid.length || tapped.size !== (cost.tap ? 1 : 0) + (cost.tapped?.length ?? 0) + funding.length || payment.some((mana) => !mana || !allowed(mana.spendOnly)) ||
		!covers([...payment.map((mana) => mana?.color as Mana["color"]), ...funding.flatMap((tap) => tap.colors)], cost)) {
		throw new Error("The stated payment is unavailable, restricted, duplicated, or does not cover the stated cost.");
	}

	const changes: Change[] = [
		// Whoever casts or plays it controls it, though another seat may own it (110.2, 305.2).
		...(activation.timing === "spell" ? [{ do: "move" as const, what: source.id, to: "stack" as const, reason: "cast" as const, controller, ...(activation.face !== undefined ? { face: activation.face } : {}) }] : []),
		...(activation.timing === "land" ? [{ do: "move" as const, what: source.id, to: "battlefield" as const, reason: "play-land" as const, controller }] : []),
		...costChanges(cost, source, controller),
	];
	// Mana abilities activated during payment (601.2g). Their mana is spent in this same group.
	changes.push(...paying({ paid, taps: funding }, controller, table.cursor.clock, changes.length));
	if (activation.timing === "spell" && object.copy) changes.push({ do: "prepare", what: object.copy.source.id, prepared: false });
	const future = activation.timing === "spell" ? castWords(scope, spell, traits) : [];
	const prepared = structuredClone(activation);
	const grantedWords = activation.timing === "spell" ? [...future.flatMap((note) => note.words), ...spentWords({ paid, taps: funding }, pool)] : [];
	if (grantedWords.length) prepared.words = [...new Set([...(prepared.words ?? []), ...grantedWords])];
	changes.push({ do: "activate", what: source.id, id: `ability-${table.cursor.clock + 1}`, ability: prepared }, ...future.filter((note) => note.next).map((note): Change => ({ do: "use-note", id: note.id })));
	if (activation.timing === "mana") for (const instruction of activation.instructions) {
		if (instruction.do !== "mana" || !instruction.colors) throw new Error("A mana ability only adds mana of stated colors.");
		const times = instruction.times === undefined ? 1 : amount(scope, instruction.times);
		const colors = Array.from({ length: times }, () => instruction.colors as Mana["color"][]).flat();
		for (const who of players(scope, instruction.who)) changes.push({ do: "add-mana", who, colors, ...manaTerms(instruction, scope) });
	}
	return [...changes, { do: "turn", action: "act", who: controller, ...(activation.timing === "land" ? { land: true } : {}) }];
}

/** One announced activation is one recorded decision, including its accepted meaning. */
export function activate(table: Table, activation: Activation, choice: Pick<LedgerRow, "picked" | "offered" | "by" | "why" | "execution">,
	registered?: LedgerRow["registered"]): void {
	if (table.announcement && !table.payment) {
		const draft = table.announcement;
		const frame = { seat: draft.controller, version: table.cursor.clock, view: project(table, draft.controller) };
		const expected = choice.picked.startsWith("announce:payment:")
			? announcementPayments(frame, draft)?.find(one => one.option.id === choice.picked)?.activation : announcedActivation(frame, draft);
		if (!expected || !isDeepStrictEqual(activation, expected)) throw new Error("Finish or cancel the selected announcement before performing another action.");
		choice = { ...choice, execution: choice.execution ?? draft.execution };
	}
	if (table.payment) {
		const expected = { ...table.payment.activation, cost: { ...table.payment.activation.cost, exiled: table.payment.picked } };
		if (!isDeepStrictEqual(activation, expected)) throw new Error("Finish or cancel the pending payment before announcing another action.");
		if (!choice.execution && table.payment.execution) choice = { ...choice, execution: table.payment.execution };
	}
	if (activation.exileSelection && !activation.cost.exiled) {
		const { exileSelection, ...rest } = activation;
		activationChanges(table, rest); // Validate the other resources without spending them.
		const source = table.things.get(activation.source.id)!;
		const scope = { world: tableWorld(table), controller: activation.controller, source: activation.timing === "spell" ? { ...source, zone: "stack" as const } : source, targets: activation.targets, x: activation.x };
		if (!enoughExile(scope, exileSelection)) throw new Error("The graveyard cannot pay the required mana value.");
		const { execution, ...answer } = choice;
		table.ledger.push({ seq: table.ledger.length, clock: table.cursor.clock + 1, situation: "priority", seat: activation.controller, ...structuredClone(answer), activation: structuredClone(activation),
			...(execution ? { preparing: structuredClone(execution) } : {}) });
		commit(table, [{ do: "payment", payment: { activation, picked: [], ...(execution ? { execution } : {}) } }], "cost-payment");
		return;
	}
	const changes = activationChanges(table, activation);
	if (table.announcement) changes.push({ do: "announcement" });
	if (table.payment) changes.push({ do: "payment" });
	const entered = attach(table, changes, registered);
	table.ledger.push({ seq: table.ledger.length, clock: table.cursor.clock + 1, situation: "priority", seat: activation.controller,
		...structuredClone(choice), activation: structuredClone(activation), ...(Object.keys(entered).length ? { registered: entered } : {}) });
	const reason = activation.timing === "spell" ? "cast" : activation.timing === "land" ? "play-land" : "activate";
	commit(table, beforeEntry(table, changes, reason), reason);
}

export { offers };
