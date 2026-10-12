/** Repeated choices reveal only earned identities and commit one simultaneous action after all players answer. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { amount, tableWorld } from "../src/core/selectors.ts";
import type { Package, Procedure } from "../src/core/language.ts";
import { announce, main, pack, place, quiet } from "./play.ts";

const viper = "Rottenmouth Viper", pirate = "Greedy Freebooter";
const build = (seats = 2) => start({ ...standard, seats: { min: seats, max: seats } }, Array.from({ length: seats }, () => ({ deck: alpha(deck("Jund Sacrifice")) })), "simultaneous-choices");
const replay = (table: Table, before: Table) => {
	while (!table.outcome && !nextDecision(table)) advance(table);
	assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
};
const atChoices = (table: Table) => table.resolution?.program[0]?.instruction.do === "choose-actions";
function choices(table: Table) {
	for (let guard = 0; guard < 150; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (atChoices(table)) return;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error("Never reached action choices");
}
function pick(table: Table, match: (label: string) => boolean) {
	const before = structuredClone(table), decision = nextDecision(table)!; assert.equal(decision.situation, "resolution"); assert.deepEqual(table, before);
	const option = decision.options.find(one => match(one.label)); assert.ok(option, decision.options.map(one => one.label).join(" | "));
	apply(table, option.id, "model", "chosen");
}
function reachAttack(table: Table) {
	for (let guard = 0; guard < 200; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "turn-based" && table.cursor.steps[0] === "declare-attackers") return;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error("Never reached attack declaration");
}

test("Viper choices stay private and unspent until one group, retain departed counts and order multiple players", () => {
	const table = build(); main(table, 0);
	const source = cardsIn(table, "hand", 0).find(one => one.card === viper) ?? place(table, 0, "hand", viper)[0]!;
	const victim = place(table, 1, "hand", pirate)[0]!;
	const land = place(table, 1, "battlefield", "Swamp")[0]!;
	const registers = (JSON.parse(readFileSync(new URL("../prepared/packages/2026-10-10/greedy-freebooter.json", import.meta.url), "utf8")).package as Package).registers;
	commit(table, [{ do: "move", what: victim.id, to: "battlefield", reason: "game-setup", registers }, { do: "add-mana", who: 0, colors: ["B", "C", "C", "C", "C", "C"] }], "game-setup");
	// There is nothing eligible to sacrifice before this cast; paying all six mana is its complete available choice.
	const cast: Procedure = { source: { card: viper, zones: ["hand"], controller: "self" }, claim: "Cast Viper without sacrifices", basis: table.printed[viper]!.oracle.split("\n")[0]!, timing: "spell", cost: { mana: "{5}{B}" }, instructions: [] };
	editWork(table, 0, [{ do: "package.put", package: { card: viper, assessed: true, registers: pack(viper), procedures: [cast], deferred: [] } }], "viper-standing");
	const before = structuredClone(table); announce(table, cast); choices(table); assert.equal(source.counters.blight, 1);
	const hand = cardsIn(table, "hand", 1)[0]!, first = structuredClone(table);
	assert.ok(!nextDecision(table)!.options.some(one => one.objects?.some(object => object.id === land.id)), "lands do not satisfy the nonland sacrifice");
	assert.equal(nextDecision(table)!.seat, 1); pick(table, label => label.includes(hand.card!) && label.endsWith("to discard"));
	assert.equal(hand.zone, "hand"); assert.equal(table.seats[1]!.life, 20);
	const privatePick = structuredClone(table);
	for (const viewer of [0, "spectator"] as const) {
		const view = project(table, viewer); assert.equal(view.resolution!.actionChoices!.selected.length, 1);
		assert.equal(view.resolution!.actionChoices!.selected[0]!.on, undefined); assert.ok(!JSON.stringify(view).includes(`"${hand.id}"`));
	}
	assert.equal(project(table, 1).resolution!.actionChoices!.selected[0]!.on!.id, hand.id);
	pick(table, label => label.startsWith("Carry out all")); assert.equal(hand.zone, "graveyard");
	replay(table, privatePick); replay(table, first); replay(table, before);
	main(table, 0, 3); commit(table, [{ do: "counters", what: source.id, kind: "blight", amount: 1 }], "resolve");
	const beforeAttack = structuredClone(table); reachAttack(table); apply(table, `attack:${source.id}`, "model", "chosen"); apply(table, "attack:done", "model", "chosen"); choices(table);
	assert.equal(source.counters.blight, 3); const snapshots = [structuredClone(table)], other = cardsIn(table, "hand", 1)[0]!;
	pick(table, label => label.includes(pirate) && label.endsWith("to sacrifice")); snapshots.push(structuredClone(table));
	assert.ok(!nextDecision(table)!.options.some(one => one.objects?.some(object => object.id === victim.id)), "one permanent cannot satisfy two choices");
	pick(table, label => label.includes(other.card!) && label.endsWith("to discard")); snapshots.push(structuredClone(table));
	assert.ok(!nextDecision(table)!.options.some(one => one.objects?.some(object => object.id === other.id)), "one card cannot satisfy two choices");
	pick(table, label => label === "Choose to lose 4 life"); snapshots.push(structuredClone(table));
	assert.equal(victim.zone, "battlefield"); assert.equal(other.zone, "hand"); assert.equal(table.seats[1]!.life, 20); assert.equal(table.waiting.length, 0);
	assert.throws(() => apply(table, "pass", "model", "chosen"), /No option pass/);
	pick(table, label => label.startsWith("Carry out all"));
	assert.equal(victim.zone, "graveyard"); assert.equal(other.zone, "graveyard"); assert.equal(table.seats[1]!.life, 16); assert.equal(table.waiting.length, 1, "Freebooter's death trigger waits until all actions happen");
	const receipt = table.log.at(-1)!;
	assert.ok(receipt.changes.some(one => one.do === "move" && one.what === victim.id && one.reason === "sacrifice"));
	assert.ok(receipt.changes.some(one => one.do === "move" && one.what === other.id && one.reason === "discard"));
	assert.ok(receipt.changes.some(one => one.do === "change-life" && one.amount === -4));
	assert.equal(amount({ world: tableWorld(table), controller: 1 }, { history: "sacrificed", by: "you" }), 1);
	for (const snapshot of [...snapshots, beforeAttack]) replay(table, snapshot);
	for (const viewer of [0, 1, "spectator"] as const) assert.equal(project(table, viewer).objects!.find(one => one.id === other.id)!.card, other.card);

	for (const counters of [0, 2]) {
		const game = build(); main(game, 0); const departed = place(game, 0, "hand", viper)[0]!;
		commit(game, [{ do: "move", what: departed.id, to: "battlefield", reason: "resolve", registers: pack(viper) }], "resolve");
		if (counters) commit(game, [{ do: "counters", what: departed.id, kind: "blight", amount: counters }], "resolve");
		commit(game, [{ do: "move", what: departed.id, to: "graveyard", reason: "destroy" }], "destroy");
		const initial = structuredClone(game); choices(game); assert.equal(departed.counters.blight, undefined);
		for (let at = 0; at < counters; at++) pick(game, label => label === "Choose to lose 4 life");
		const pending = structuredClone(game); pick(game, label => counters ? label.startsWith("Carry out all") : label === "No action choices are required.");
		assert.equal(game.seats[1]!.life, 20 - 4 * counters); assert.equal(game.log.at(-1)!.changes.filter(one => one.do === "change-life").length, counters, "separate losses stay separate inside the same group");
		replay(game, pending); replay(game, initial);
	}
	// Sackville sees a token sacrificed with it, although the player selects Sackville first.
	const group = build(); main(group, 0); const b = place(group, 0, "hand", viper)[0]!, sack = place(group, 1, "hand", "The Sackville-Bagginses")[0]!;
	commit(group, [{ do: "move", what: sack.id, to: "battlefield", reason: "game-setup", registers: pack(sack.card!) }], "game-setup");
	commit(group, [{ do: "token", id: "chosen-treasure", controller: 1, spec: { name: "Treasure Token", types: ["artifact"], subtypes: ["Treasure"], colors: [],
		registers: [{ kind: "mana", basis: "{T}, Sacrifice this token: Add one mana of any color.", cost: { tap: true, sacrifice: "this" }, any: 1 }] } },
		{ do: "move", what: b.id, to: "battlefield", reason: "resolve", registers: pack(viper) }, { do: "counters", what: b.id, kind: "blight", amount: 1 }], "resolve");
	const groupStart = structuredClone(group); choices(group); pick(group, label => label.includes(sack.card!) && label.endsWith("to sacrifice"));
	pick(group, label => label === "Choose Treasure Token to sacrifice"); assert.equal(group.waiting.length, 0);
	const groupPending = structuredClone(group); pick(group, label => label.startsWith("Carry out all"));
	assert.equal(group.waiting.length, 1); assert.equal(group.waiting[0]!.source!.id, sack.id); assert.equal(group.waiting[0]!.event.amount, 1);
	replay(group, groupPending); replay(group, groupStart);

	// Active seat 2 answers before seat 1; both opponents complete all choices before anybody pays.
	const multi = build(3); main(multi, 2, 3); const snake = place(multi, 0, "hand", viper)[0]!;
	commit(multi, [{ do: "move", what: snake.id, to: "battlefield", reason: "resolve", registers: pack(viper) },
		{ do: "counters", what: snake.id, kind: "blight", amount: 1 }, { do: "change-life", who: 2, amount: -18, reason: "game-setup" }], "resolve");
	const initial = structuredClone(multi); choices(multi); const saved = [structuredClone(multi)];
	for (let at = 0; at < 2; at++) { assert.equal(nextDecision(multi)!.seat, 2); pick(multi, label => label === "Choose to lose 4 life"); saved.push(structuredClone(multi)); }
	assert.equal(nextDecision(multi)!.seat, 1); assert.equal(multi.seats[2]!.life, 2);
	const concealed = cardsIn(multi, "hand", 1)[0]!; pick(multi, label => label.includes(concealed.card!) && label.endsWith("to discard")); saved.push(structuredClone(multi));
	assert.equal(project(multi, 2).resolution!.actionChoices!.selected.at(-1)!.on, undefined);
	pick(multi, label => label === "Choose to lose 4 life"); saved.push(structuredClone(multi));
	assert.equal(concealed.zone, "hand"); assert.equal(multi.seats[1]!.life, 20); assert.equal(multi.seats[2]!.life, 2);
	pick(multi, label => label.startsWith("Carry out all")); assert.equal(concealed.zone, "graveyard"); assert.equal(multi.seats[1]!.life, 16); assert.equal(multi.seats[2]!.life, -6);
	assert.equal(multi.log.at(-1)!.changes.filter(one => one.do === "change-life").length, 3);
	for (const snapshot of [...saved, initial]) replay(multi, snapshot);
});
