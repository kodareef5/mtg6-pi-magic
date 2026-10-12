/** Crime is one event per targeted announcement; public-zone watches keep exact source identity.
 * Past 150 lines to cover announcement kinds, target relationships, payment and saved continuation together. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn, type Ability, type Activation, type Table } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { blockConflicts } from "../src/core/combat-facts.ts";
import { tableWorld } from "../src/core/selectors.ts";
import { activeWatches } from "../src/core/triggers.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { check, PackageSchema, type Effect } from "../src/core/language.ts";
import type { Zone } from "../src/core/syntax.ts";
import { main, place, announce, passBoth, step, finish, example, pack } from "./play.ts";

const miner = "Forsaken Miner", siren = "Spyglass Siren";
const ref = (one: { id: string; incarnation: number }) => ({ id: one.id, incarnation: one.incarnation });
function position(zone: Zone = "graveyard") {
	const table = start(standard, [{ deck: alpha(deck("Mono-Black Aggro")) }, { deck: alpha(deck("Dimir Midrange")) }], "crime");
	main(table, 0);
	editWork(table, 0, [{ do: "package.put", package: { card: miner, registers: pack(miner), printedCast: true, assessed: true } }], "prepare-miner");
	const card = zone === "library" ? cardsIn(table, "library", 0).find(one => one.card === miner)! : place(table, 0, zone, miner)[0]!;
	return { table, card };
}
const ordinaryHex = () => { const extra = example("Blighted Requiting Hex"); return checkProcedure({ ...extra, claim: "Ordinary Requiting Hex", cost: {}, instructions: extra.instructions.slice(0, 1) }); };

test("crime counts once on announcing a qualifying use and only a graveyard Miner can offer its paid return", () => {
	for (const mode of ["pay", "decline", "unpaid", "left", "blink"] as const) {
		const { table, card } = position(), target = place(table, 1, "battlefield", siren)[0]!;
		place(table, 0, "hand", "Requiting Hex");
		commit(table, [{ do: "add-mana", who: 0, colors: mode === "unpaid" ? ["B"] : ["B", "B"] }], "game-setup");
		let initial = structuredClone(table), from = table.ledger.length;
		assert.ok(activeWatches(workFrame(table, 0)).some(one => one.source.id === card.id));
		announce(table, ordinaryHex(), one => one.activation.targets[0]?.some(chosen => "id" in chosen && chosen.id === target.id) ?? false);
		assert.equal(table.waiting.length, 1); assert.equal(target.zone, "battlefield", "a crime needs no resolved effect");
		const decision = nextDecision(table)!; assert.equal(decision.situation, "trigger-order");
		apply(table, decision.options[0]!.id, "model", "chosen");
		assert.equal(cardsIn(table, "stack").length, 2);
		if (mode === "left" || mode === "blink") {
			commit(table, [{ do: "move", what: card.id, to: "exile", reason: "exile" }, ...(mode === "blink" ? [
				{ do: "move" as const, what: card.id, to: "graveyard" as const, reason: "resolve" as const },
			] : [])], "resolve");
			// Replay begins after this externally arranged response; the pending trigger still names the old incarnation.
			initial = structuredClone(table); from = table.ledger.length;
		}
		const pending = structuredClone(table), at = table.ledger.length;
		passBoth(table);
		step(table, label => mode === "decline" ? label.startsWith("Decline") : !label.startsWith("Decline")); finish(table);
		assert.equal(card.zone, mode === "pay" ? "battlefield" : mode === "left" ? "exile" : "graveyard");
		assert.equal(table.seats[0]!.pool.length, mode === "decline" ? 1 : 0, "a chosen payment is spent even if the source left");
		if (mode === "pay") {
			assert.ok(blockConflicts({ ...target, traits: characteristics(table, target) },
				{ ...card, traits: characteristics(table, card) }, tableWorld(table)).some(one => one.includes("This creature can't block.")));
			assert.ok(!activeWatches(workFrame(table, 0)).some(one => one.source.id === card.id), "returning stops the graveyard watch");
		}
		assert.equal(target.zone, "battlefield", "the return resolves above the crime's original spell");
		passBoth(table); finish(table);
		assert.equal(target.zone, "graveyard"); assert.equal(table.waiting.length, 0, "resolution is not another crime");
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
	}

	for (const kind of ["spell", "activation", "trigger"] as const) for (const aim of ["opponent", "you", "permanent", "controlled", "graveyard", "own-graveyard", "spell", "ability", "many"] as const) {
		const { table, card } = position();
		const source = place(table, 0, "battlefield", "Swamp")[0]!;
		const target = place(table, 1, aim === "graveyard" ? "graveyard" : "battlefield", siren)[0]!;
		if (aim === "controlled") {
			commit(table, [{ do: "move", what: target.id, to: "exile", reason: "game-setup" }, { do: "move", what: target.id, to: "battlefield", controller: 0, reason: "game-setup" }], "game-setup");
		}
		let aimed = aim === "own-graveyard" ? card : target;
		if (aim === "spell" || aim === "ability") {
			const object = aim === "spell" ? place(table, 1, "stack", "Bitter Triumph")[0]! : target;
			const ability: Activation = { source: ref(object), controller: 1, claim: "Opposing stack fixture", basis: "Target relationship fixture", timing: aim === "spell" ? "spell" : "stack",
				cost: { generic: 0, colors: [] }, paid: [], targets: [], slots: [], instructions: [] };
			commit(table, [{ do: "activate", what: object.id, id: "opposing-ability", ability }], "game-setup");
			aimed = table.things.get(aim === "spell" ? object.id : "opposing-ability")!;
		}
		const effect: Effect = { targets: aim === "opponent" || aim === "you" ? [{ player: aim }] : [
			{ object: { zones: [aimed.zone], ...(aim === "ability" ? { ability: "any" } : {}) } }, ...(aim === "many" ? [{ player: "opponent" }] : []),
		], instructions: [] };
		const isTarget = (targets: Ability["targets"]) => aim === "opponent" || aim === "you" || targets[0]?.some(one => "id" in one && one.id === aimed.id) === true;
		let initial: Table, from: number;
		if (kind === "trigger") {
			commit(table, [{ do: "trigger", action: "wait", trigger: { id: "fixture-trigger", controller: 0, source: ref(source), basis: "Crime trigger-placement fixture", event: {}, effect } }], "game-setup");
			assert.equal(table.waiting.length, 1, "waiting before target selection commits no crime");
			initial = structuredClone(table); from = table.ledger.length;
			const decision = nextDecision(table)!, option = decision.options.find(one => isTarget([one.trigger!.targets]))!;
			assert.ok(option); apply(table, option.id, "model", "chosen");
		} else {
			if (kind === "spell") place(table, 0, "hand", "Requiting Hex");
			initial = structuredClone(table); from = table.ledger.length;
			// Complete fixture terms isolate target relationships; they do not claim these are the cards' Oracle effects.
			const procedure = checkProcedure({ source: { card: kind === "spell" ? "Requiting Hex" : "Swamp", zones: [kind === "spell" ? "hand" : "battlefield"], controller: "self" },
				claim: "Crime announcement fixture", basis: "Crime target relationship fixture", timing: kind === "spell" ? "spell" : "stack", cost: { mana: "{0}" }, ...effect });
			announce(table, procedure, one => isTarget(one.activation.targets));
		}
		const expected = ["you", "controlled", "own-graveyard"].includes(aim) ? 0 : 1;
		assert.equal(table.waiting.filter(one => one.source?.id === card.id).length, expected, `${kind} at ${aim}`);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	}

	for (const zone of ["hand", "library", "exile", "battlefield"] as const) {
		const { table, card } = position(zone), source = place(table, 0, "battlefield", "Swamp")[0]!;
		const procedure = checkProcedure({ source: { zones: ["battlefield"], refs: [ref(source)], controller: "self" }, claim: "Crime zone fixture", basis: "Crime zone fixture",
			timing: "stack", cost: {}, targets: [{ player: "opponent" }], instructions: [] });
		assert.ok(!activeWatches(workFrame(table, 0)).some(one => one.source.id === card.id));
		const initial = structuredClone(table), from = table.ledger.length;
		announce(table, procedure); assert.equal(table.waiting.length, 0, zone);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		if (zone === "hand" || zone === "library") assert.ok(!project(table, 1).objects!.some(one => one.id === card.id));
	}
	// The Miner is already in the graveyard when an announcement paid by discarding it completes.
	const paid = position("hand"), payer = place(paid.table, 0, "battlefield", "Swamp")[0]!;
	const discard = checkProcedure({ source: { zones: ["battlefield"], controller: "self", refs: [ref(payer)] }, claim: "Discard and target fixture", basis: "Crime after payment fixture",
		timing: "stack", cost: { discard: 1 }, targets: [{ player: "opponent" }], instructions: [] });
	const initial = structuredClone(paid.table), from = paid.table.ledger.length;
	const chosen = announce(paid.table, discard, one => one.activation.cost.discarded?.some(ref => paid.table.things.get(ref.id)?.card === miner) ?? false);
	const discarded = chosen.activation.cost.discarded![0]!;
	assert.equal(paid.table.things.get(discarded.id)!.zone, "graveyard");
	assert.equal(paid.table.waiting.filter(one => one.source?.id === discarded.id).length, 1);
	assert.deepEqual(relive(initial, paid.table.ledger.slice(from)), paid.table);

	// A face-down permanent still has triggered abilities granted by other effects.
	const granted = position("exile");
	commit(granted.table, [{ do: "move", what: granted.card.id, to: "battlefield", faceDown: "manifest", reason: "resolve" }], "resolve");
	commit(granted.table, [{ do: "note", note: { kind: "label", on: ref(granted.card), by: 0, until: "end-of-turn", text: "Granted crime fixture", change: { registers: [
		{ kind: "watch", basis: "Granted crime fixture", event: { on: "crime", by: "you" }, effect: { instructions: [{ do: "life", who: "you", amount: 1 }] } },
	] } } }], "resolve");
	const swamp = place(granted.table, 0, "battlefield", "Swamp")[0]!;
	const grantStart = structuredClone(granted.table), grantAt = granted.table.ledger.length;
	announce(granted.table, checkProcedure({ ...discard, source: { zones: ["battlefield"], controller: "self", refs: [ref(swamp)] }, cost: {} }));
	assert.equal(granted.table.waiting.length, 1);
	assert.ok(nextDecision(granted.table)!.options.every(one => !one.label.includes(miner)), "the public trigger names a face-down creature");
	assert.deepEqual(relive(grantStart, granted.table.ledger.slice(grantAt)), granted.table);

	const unsupported = { card: miner, registers: [{ ...pack(miner)[1], zones: ["hand"] }] };
	assert.throws(() => check(PackageSchema, unsupported, "hidden-zone watch"));
});
