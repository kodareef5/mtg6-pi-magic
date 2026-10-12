/** Announced allocations survive every draft and resolution boundary. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { activationChanges, checkProcedure } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { project } from "../src/core/view.ts";
import { fork, open, replay, save, relive, type Header } from "../src/core/journal.ts";
import { load } from "../src/core/cards.ts";
import { instructionStep } from "../src/core/instructions.ts";
import { tableWorld, targetKey } from "../src/core/selectors.ts";
import { targetings, assignedAmount } from "../src/core/targeting.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { example, finish, main, offered, passBoth, place, step } from "./play.ts";

function position() {
	const table = start(standard, [{ deck: alpha(deck("Izzet Prowess")) }, { deck: deck("Mono-Red Aggro") }], "divided-targets", undefined, { announcementsFrom: 0 });
	place(table, 0, "hand", "Elusive Otter // Grove's Bounty");
	place(table, 0, "battlefield", "Drake Hatcher", "Drake Hatcher", "Slickshot Show-Off");
	commit(table, [{ do: "add-mana", who: 0, colors: ["G", "U", "U", "U", "U", "U"], until: "end-of-turn" }], "game-setup");
	const procedure = example("Cast Grove's Bounty with divided counters");
	editWork(table, 0, [{ do: "package.put", package: { ...JSON.parse(readFileSync("prepared/packages/2026-10-10/elusive-otter-grove-s-bounty.json", "utf8")).package, deferred: [], procedures: [procedure] } }], "use");
	return table;
}
const pick = (table: Table, id: string) => { assert.ok(nextDecision(table)!.options.some(one => one.id === id), id); apply(table, id, "model", "chosen"); };
const begin = (table: Table, x: number) => {
	pick(table, nextDecision(table)!.options.find(one => one.announcement?.procedure.face === 1)!.id);
	pick(table, `announce:x:${x}`);
};

test("target divisions are announced without spending, persist through clones and never move an illegal target's share", () => {
	const procedure = example("Cast Grove's Bounty with divided counters");
	checkProcedure(procedure);
	assert.throws(() => checkProcedure({ ...procedure, targets: [{ ...procedure.targets![0], divide: undefined }] }), /announced division/);
	for (const x of [0, 1, 5]) for (const lost of [false, true]) {
		const table = position(); main(table, 0);
		const initial = structuredClone(table), at = table.ledger.length, creatures = cardsIn(table, "battlefield", 0);
		const physical = () => structuredClone({ things: table.things, seats: table.seats });
		const untouched = physical();
		const selected = creatures.slice(0, x ? Math.min(x, 2) : 0);
		const select = () => { for (const one of selected) pick(table, `announce:target:${targetKey(one)}`);
			if (nextDecision(table)!.preparing?.stage === "targets") pick(table, "announce:targets-done"); };
		begin(table, x); select();
		assert.deepEqual(physical(), untouched);
		if (x > 0) {
			assert.equal(nextDecision(table)!.preparing?.stage, "division");
			const before = structuredClone(table); nextDecision(table); assert.deepEqual(table, before);
			assert.equal(project(table, 1).announcement, undefined);
			assert.ok(!nextDecision(table)!.options.some(one => one.id === "announce:divide:0"));
			pick(table, "announce:back"); assert.equal(nextDecision(table)!.preparing?.stage, "targets");
			pick(table, "announce:targets-done");
			pick(table, `announce:divide:${x === 5 ? 3 : 1}`);
			if (x === 5) {
				pick(table, "announce:back"); assert.equal(table.announcement!.targets[0]![0]!.amount, undefined);
				pick(table, "announce:divide:3");
			}
		}
		const middle = structuredClone(table), middleVersion = table.ledger.length;
		if (x === 5) pick(table, "announce:divide:2");
		pick(table, "announce:cost:0");
		assert.deepEqual(physical(), untouched);
		const payment = nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!;
		for (const amount of [0, 8, undefined]) if (x) {
			const forged = structuredClone(payment.use!); forged.targets[0]![0]!.amount = amount;
			assert.throws(() => activationChanges(table, forged), /division/); assert.deepEqual(physical(), untouched);
		}
		pick(table, payment.id);
		const spell = cardsIn(table, "stack")[0]!;
		assert.deepEqual(spell.ability!.targets[0]!.map(one => one.amount), x === 5 ? [3, 2] : x ? [1] : []);
		assert.deepEqual(relive(structuredClone(middle), table.ledger.slice(middleVersion)), table);
		if (!lost && x === 5) {
			const directory = mkdtempSync(join(tmpdir(), "division-"));
			try {
				const universe = load("cards/standard.tsv");
				const header: Header = { id: "division", seed: table.rng.seed, format: "standard", announcementsFrom: 0,
					seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: universe.path, generated: universe.generated, names: universe.names, faces: universe.faces }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
				const journal = open(join(directory, "game.jsonl"), header); save(journal, table);
				const child = join(directory, "child.jsonl"); fork(journal.path, middleVersion, "child", child);
				const clone = replay(child, position).table; assert.deepEqual(clone, middle);
				assert.deepEqual(relive(clone, table.ledger.slice(middleVersion)), table);
			} finally { rmSync(directory, { recursive: true, force: true }); }
		}
		if (lost && selected.length) commit(table, [{ do: "move", what: selected[0]!.id, to: "graveyard", reason: "destroy" }], "destroy");
		passBoth(table); const resolving = structuredClone(table), from = table.ledger.length;
		if (x === 5) {
			const pending = table.resolution!, scope = { world: tableWorld(table), source: spell, controller: 0,
				targets: [[spell.ability!.targets[0]![0]!, { player: 1, amount: 2 }]], illegal: pending.illegal };
			const damage = instructionStep(table, scope, { do: "damage", to: "target:0", amount: { divided: 0 } }, pending, "Divide damage");
			assert.deepEqual(damage.choices[0]!.changes.filter(one => one.do === "damage").map(one => one.amount), lost ? [2] : [3, 2]);
			assert.deepEqual(table, resolving, "reading the same allocation for damage is pure");
			step(table); assert.equal(selected[1]!.counters["+1/+1"], 2); }
		finish(table);
		assert.equal(selected[0]?.counters["+1/+1"] ?? 0, lost ? 0 : x === 5 ? 3 : x);
		assert.equal(spell.zone, lost && x === 1 ? "graveyard" : "exile");
		assert.deepEqual(relive(resolving, table.ledger.slice(from)), table);
		if (!lost) assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
	const table = position(); main(table, 0); const initial = structuredClone(table), at = table.ledger.length;
	begin(table, 2); pick(table, `announce:target:${targetKey(cardsIn(table, "battlefield", 0)[0]!)}`);
	pick(table, "announce:targets-done"); pick(table, "announce:divide:2"); pick(table, "announce:cost:0");
	pick(table, "announce:back"); pick(table, "announce:back"); assert.equal(nextDecision(table)!.preparing?.stage, "division");
	pick(table, "announce:cancel"); assert.deepEqual(table.things, initial.things); assert.deepEqual(table.seats, initial.seats);
	assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	const variants = offered(table, procedure).filter(one => one.activation.x === 5 && one.activation.targets[0]?.length === 2);
	assert.equal(variants.length, 12); assert.equal(new Set(variants.map(one => one.option.id)).size, 12);
	assert.deepEqual(new Set(variants.map(one => one.activation.targets[0]!.map(one => one.amount).join(","))), new Set(["1,4", "2,3", "3,2", "4,1"]));
	const scope = { world: tableWorld(table), controller: 0, targets: [[{ player: 0, amount: 1 }, { player: 1, amount: 2 }]] };
	assert.equal(assignedAmount(scope, { divided: 0 }, { player: 1 }), 2);
	assert.equal(targetings([{ player: "any", count: "any", divide: 3 }], scope).length, 4);
});
