/** Sacrifice counts and look-back watches agree across spell payments, mana abilities and resolving costs. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { printedCast } from "../src/core/procedures.ts";
import { activatedUses } from "../src/core/activated.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { amount, tableWorld, viewWorld } from "../src/core/selectors.ts";
import type { Package, Registration } from "../src/core/language.ts";
import type { Option } from "../src/core/types.ts";
import type { Reason } from "../src/core/syntax.ts";
import { announce, main, pack, quiet } from "./play.ts";

const biotech = "Biotech Specialist", sack = "The Sackville-Bagginses", pursuit = "Obsessive Pursuit", pirate = "Greedy Freebooter";
const build = () => start(standard, [{ deck: alpha(deck("Jund Sacrifice")) }, { deck: alpha(deck("Jund Sacrifice")) }], "sacrifices");
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const count = (table: Table, who = 0) => amount({ world: tableWorld(table), controller: who }, { history: "sacrificed", by: "you" });
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function put(table: Table, card: string, zone: "hand" | "battlefield", owner = 0, controller = owner, registers: Registration[] = []) {
	const one = [...cardsIn(table, "library", owner), ...cardsIn(table, "hand", owner)].find(one => one.card === card)!; assert.ok(one, card);
	if (one.zone !== zone) commit(table, [{ do: "move", what: one.id, to: zone, controller, reason: "game-setup", ...(zone === "battlefield" ? { registers } : {}) }], "game-setup"); return one;
}
function settle(table: Table, choose?: (options: Option[]) => Option | undefined) {
	for (let guard = 0; guard < 200; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		const option = choose?.(decision.options) ?? quiet(decision.options); apply(table, option.id, "model", "chosen");
	}
	throw new Error("Resolution did not settle");
}
function prepare(table: Table, card: string) {
	const registers = card === pirate ? (JSON.parse(readFileSync(new URL("../prepared/packages/2026-10-10/greedy-freebooter.json", import.meta.url), "utf8")).package as Package).registers : pack(card);
	editWork(table, 0, [{ do: "package.put", package: { card, printedCast: true, assessed: true, registers, procedures: [], deferred: [] } }], `prepare-${card}`);
	return put(table, card, "hand");
}
function mana(table: Table, colors: ("B" | "R" | "G" | "C")[]) { commit(table, [{ do: "add-mana", who: 0, colors }], "game-setup"); }

test("sacrifices retain their actor, pre-departure characteristics and turn count across actual Jund costs and attacks", () => {
	const table = build(); main(table, 0);
	for (const [card, colors] of [[biotech, ["R", "G"]], [pursuit, ["B", "C"]], [sack, ["B", "C"]]] as const) {
		prepare(table, card); mana(table, [...colors]); const before = structuredClone(table);
		announce(table, printedCast(card, table.printed[card]!), one => !one.activation.funding?.length);
		settle(table, options => options.find(one => one.label.startsWith("Pay ") && one.label.includes("Clue")));
		replay(table, before);
	}
	assert.equal(table.seats[0]!.life, 19); assert.equal(table.seats[1]!.life, 17); assert.equal(count(table), 1);
	const lander = cardsIn(table, "battlefield").find(one => one.token?.name === "Lander")!;
	const treasure = cardsIn(table, "battlefield").find(one => one.token?.name === "Treasure")!;
	assert.ok(lander); assert.ok(treasure); assert.equal(cardsIn(table, "battlefield").filter(one => one.token?.name === "Clue").length, 0);
	main(table, 0, 3); assert.equal(count(table), 0); assert.equal(table.seats[0]!.life, 18);
	const clue = cardsIn(table, "battlefield").find(one => one.token?.name === "Clue")!; assert.ok(clue);
	for (const token of [lander, clue]) {
		mana(table, ["C", "C"]); const before = structuredClone(table), hand = cardsIn(table, "hand", 0).length;
		const use = activatedUses(workFrame(table, 0)).find(one => one.procedure.source.refs?.[0]?.id === token.id)!;
		announce(table, use.procedure, one => !one.activation.funding?.length); assert.equal(table.waiting.length, 2, "sacrificing the token triggers before its ability resolves");
		const paid = structuredClone(table); settle(table, options => options.find(one => one.label.includes("Forest") && one.objects?.length === 1));
		assert.equal(table.things.has(token.id), false); assert.equal(table.seats[1]!.life, token === lander ? 14 : 11);
		if (token === lander) assert.ok(cardsIn(table, "battlefield").some(one => one.card === "Forest" && one.tapped));
		else assert.equal(cardsIn(table, "hand", 0).length, hand + 1);
		replay(table, paid); replay(table, before);
	}
	prepare(table, pirate); const beforeMana = structuredClone(table);
	announce(table, printedCast(pirate, table.printed[pirate]!), one => one.activation.funding?.some(tap => tap.source.id === treasure.id) ?? false);
	assert.equal(table.waiting.length, 2); settle(table); assert.equal(count(table), 3); assert.equal(table.seats[1]!.life, 8);
	assert.equal(table.things.has(treasure.id), false); replay(table, beforeMana);
	const attacker = cardsIn(table, "battlefield").find(one => one.card === biotech)!;
	const other = cardsIn(table, "battlefield").find(one => one.card === sack)!;
	const beforeAttack = structuredClone(table);
	for (let guard = 0; guard < 200; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "turn-based" && table.cursor.steps[0] === "declare-attackers") break;
		apply(table, quiet(decision.options).id, "model", "chosen");
	}
	apply(table, `attack:${attacker.id}`, "model", "chosen"); apply(table, `attack:${other.id}`, "model", "chosen"); apply(table, "attack:done", "model", "chosen");
	assert.equal(table.waiting.length, 1, "Pursuit triggers once for the declaration, not once per attacker");
	const targeting = structuredClone(table); settle(table, options => options.find(one => one.objects?.some(object => object.id === attacker.id)));
	assert.equal(attacker.counters["+1/+1"], 3); assert.ok(characteristics(table, attacker)!.words.includes("lifelink"));
	replay(table, targeting); replay(table, beforeAttack);
	main(table, 0, 3, "postcombat-main"); assert.equal(table.seats[0]!.life, 22); assert.equal(table.seats[1]!.life, 2);
	main(table, 1, 4); assert.equal(count(table), 0); assert.equal(attacker.counters["+1/+1"], 3); assert.ok(!characteristics(table, attacker)!.words.includes("lifelink"));
	const declined = build(); main(declined, 0); prepare(declined, sack); mana(declined, ["B", "C"]);
	put(declined, pirate, "battlefield"); const declineStart = structuredClone(declined), hand = cardsIn(declined, "hand", 0).length;
	announce(declined, printedCast(sack, declined.printed[sack]!)); settle(declined, options => options.find(one => /^(Decline|Do not pay)/.test(one.label)));
	assert.equal(count(declined), 0); assert.equal(cardsIn(declined, "hand", 0).length, hand - 1); assert.equal(cardsIn(declined, "battlefield").filter(one => one.token).length, 0); replay(declined, declineStart);
	// A once-only delayed sacrifice watch uses the same look-back world even when its source leaves.
	const delayed = build(); main(delayed, 0); const source = put(delayed, biotech, "battlefield"), victim = put(delayed, pirate, "battlefield");
	commit(delayed, [{ do: "note", note: { kind: "delay", by: 0, until: "end-of-turn", event: { on: "sacrificed", by: "you" },
		effect: { instructions: [{ do: "life", who: "event:player", amount: { event: "amount" } }] }, fixed: { source: ref(source), targets: [], bound: {} }, once: true } }], "game-setup");
	commit(delayed, [source, victim].map(one => ({ do: "move", what: one.id, to: "graveyard", reason: "sacrifice" })), "resolve");
	assert.equal(count(delayed), 2); assert.equal(delayed.waiting.length, 1); assert.equal(delayed.notes.some(one => one.kind === "delay"), false);
	const delayStart = structuredClone(delayed); settle(delayed); assert.equal(delayed.seats[0]!.life, 21); replay(delayed, delayStart);

	// All departures use their old controller; only sacrifices count, even if a replacement exiles them.
	for (const mode of ["sacrifice", "exile", "destroy", "bounce", "lost-watch", "batch"] as const) {
		const game = build(); main(game, 0); const watcher = put(game, biotech, "battlefield", 0, 0, pack(biotech));
		const victim = put(game, "Swamp", "battlefield", 1, 0);
		commit(game, [{ do: "note", note: { kind: "label", on: ref(victim), by: 0, until: "indefinite", text: "Artifact sacrifice fixture", change: { types: { add: ["artifact"] } } } },
			...(mode === "exile" ? [{ do: "counters" as const, what: victim.id, kind: "finality", amount: 1 }] : []),
			...(mode === "lost-watch" ? [{ do: "note" as const, note: { kind: "label" as const, on: ref(watcher), by: 0, until: "indefinite" as const, text: "Ability-loss fixture", change: { loseAbilities: true as const } } }] : []),
			...(mode === "batch" ? [{ do: "note" as const, note: { kind: "label" as const, on: ref(watcher), by: 0, until: "indefinite" as const, text: "Artifact source fixture", change: { types: { add: ["artifact"] } } } }] : [])], "game-setup");
		const reason: Reason = mode === "destroy" ? "destroy" : mode === "bounce" ? "bounce" : "sacrifice";
		commit(game, [...(mode === "batch" ? [{ do: "move" as const, what: watcher.id, to: "graveyard" as const, reason }] : []),
			{ do: "move", what: victim.id, to: mode === "bounce" ? "hand" : "graveyard", reason }], "resolve");
		const expected = ["destroy", "bounce"].includes(mode) ? 0 : mode === "batch" ? 2 : 1;
		assert.equal(count(game), expected); assert.equal(count(game, 1), 0, "ownership does not determine the sacrificing player");
		assert.equal(victim.zone, mode === "exile" ? "exile" : mode === "bounce" ? "hand" : "graveyard");
		assert.equal(game.waiting.length, mode === "lost-watch" ? 0 : expected);
		for (const trigger of game.waiting) { assert.equal(trigger.event.player, 0); assert.equal(trigger.event.amount, 1); }
		const pending = structuredClone(game); nextDecision(game); nextDecision(game);
		for (const viewer of [0, 1, "spectator"] as const) {
			const view = project(game, viewer); assert.equal(amount({ world: viewWorld(view), controller: 0 }, { history: "sacrificed", by: "you" }), expected);
			assert.ok(!JSON.stringify(view.history!.filter(one => one.kind === "physical")).includes(victim.id), "public counts carry no object identities");
		} assert.deepEqual(game, pending);
		settle(game); assert.equal(game.seats[1]!.life, 20 - 2 * (mode === "lost-watch" ? 0 : expected)); replay(game, pending);
		put(game, pursuit, "battlefield", 0, 0, pack(pursuit)); assert.equal(count(game), expected, "a later reader retains the prior sacrifices");
	}
});
