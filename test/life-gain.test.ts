/** Life gains trigger by source and amount; damage, exploration and prior journals retain their physical semantics. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { blockConflicts } from "../src/core/combat-facts.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { amount, tableWorld } from "../src/core/selectors.ts";
import type { Package, Registration } from "../src/core/language.ts";
import { announce, example, finish, main, pack, passBoth, step } from "./play.ts";

const cleric = "Starscape Cleric", amalia = "Amalia Benavides Aguirre", bat = "Deep-Cavern Bat", sanctifier = "Hinterland Sanctifier";
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const stored = (slug: string): Package => JSON.parse(readFileSync(new URL(`../prepared/packages/2026-10-10/${slug}.json`, import.meta.url), "utf8")).package;
const build = () => start(standard, [{ deck: alpha(deck("Lifegain")) }, { deck: alpha(deck("Lifegain")) }], "life-events");
function put(table: Table, card: string, zone: "hand" | "battlefield", who = 0, registers: Registration[] = []) {
	const one = [...cardsIn(table, "library", who), ...cardsIn(table, "hand", who)].find(one => one.card === card)!; assert.ok(one, card);
	if (one.zone !== zone) commit(table, [{ do: "move", what: one.id, to: zone, reason: "game-setup", ...(zone === "battlefield" ? { registers } : {}) }], "game-setup"); return one;
}
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function prepare(table: Table, card: string) {
	editWork(table, 0, [{ do: "package.put", package: { card, printedCast: true, assessed: true, registers: pack(card),
		procedures: card === cleric ? [example("Cast Starscape Cleric with offspring")] : [], deferred: [] } }], `prepare-${card}`);
}
function settle(table: Table, decline = false) {
	for (let guard = 0; guard < 150; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		const pick = decision.situation === "priority" ? "pass" : (decline && decision.options.find(one => /^(Decline|Done)/.test(one.label)) || decision.options[0])!.id;
		apply(table, pick, "model", "chosen");
	}
	throw new Error("Resolution did not settle");
}
function life(table: Table, n: number, who = 0) { commit(table, [{ do: "change-life", who, amount: n, reason: "resolve" }], "resolve"); }

test("life-gain watches count positive source events, retain amounts and resolve offspring and exploration without leaking or skipping choices", () => {
	// Real entry triggers and a paid offspring cast: both Clerics see each subsequent gain.
	for (const offspring of [false, true]) {
		const table = build(); main(table, 0); prepare(table, cleric); put(table, cleric, "hand");
		put(table, sanctifier, "battlefield", 0, stored("hinterland-sanctifier").registers);
		commit(table, [{ do: "add-mana", who: 0, colors: Array(offspring ? 5 : 2).fill("B") }], "game-setup");
		const before = structuredClone(table);
		announce(table, offspring ? example("Cast Starscape Cleric with offspring") : printedCast(cleric, table.printed[cleric]!)); passBoth(table); finish(table);
		if (offspring) {
			assert.equal(table.waiting.length, 2);
			apply(table, nextDecision(table)!.options.find(one => one.label.includes(sanctifier))!.id, "model", "chosen");
		}
		const pending = structuredClone(table); settle(table);
		assert.equal(table.seats[0]!.life, offspring ? 22 : 21); assert.equal(table.seats[1]!.life, offspring ? 16 : 19);
		const copies = cardsIn(table, "battlefield").filter(one => one.token?.name === cleric);
		assert.equal(copies.length, Number(offspring));
		if (offspring) {
			assert.equal(characteristics(table, copies[0]!)!.power, 1);
			const attacker = cardsIn(table, "battlefield").find(one => one.card === sanctifier)!;
			assert.ok(blockConflicts({ ...attacker, traits: characteristics(table, attacker) }, { ...copies[0]!, traits: characteristics(table, copies[0]!) }, tableWorld(table)).some(one => one.includes("can't block")));
		}
		replay(table, pending); replay(table, before);
	}
	// Split damage from one source is one gain, while distinct lifelink sources each gain life.
	for (const sources of [1, 2]) {
		const table = build(); main(table, 0); put(table, cleric, "battlefield", 0, pack(cleric));
		const bats = Array.from({ length: sources }, () => put(table, bat, "battlefield", 0, stored("deep-cavern-bat").registers));
		const victim = put(table, sanctifier, "battlefield", 1), before = structuredClone(table);
		const changes = bats.flatMap(one => [{ do: "damage" as const, source: ref(one), target: ref(victim), amount: 1, combat: true as const },
			{ do: "damage" as const, source: ref(one), target: { player: 1 }, amount: 2, combat: true as const }]);
		const receipt = commit(table, changes, "combat");
		assert.equal(table.seats[0]!.life, 20 + 3 * sources); assert.equal(table.waiting.length, sources);
		assert.deepEqual(table.waiting.map(one => one.event), Array.from({ length: sources }, () => ({ player: 0, amount: 3 })));
		assert.equal(receipt.changes.filter(one => one.do === "change-life").length, 2 * sources, "historical physical receipts retain each lifelink result");
		assert.equal(amount({ world: tableWorld(table), controller: 0 }, { history: "life-gained", by: "you" }), 3 * sources);
		const pending = structuredClone(table); nextDecision(table); nextDecision(table); assert.deepEqual(table, pending);
		settle(table); assert.equal(table.seats[1]!.life, 20 - 3 * sources); replay(table, pending);
		assert.deepEqual(relive(structuredClone(before), []), before, "no changes are invented by the new event reader");
	}
	// Neither payments, zero nor another player's gain triggers your Cleric.
	const quiet = build(); main(quiet, 0); const watcher = put(quiet, cleric, "battlefield", 0, pack(cleric));
	life(quiet, 0); life(quiet, -3); life(quiet, 4, 1); assert.equal(quiet.waiting.length, 0);
	const oldLife = quiet.seats[1]!.life; life(quiet, 7); assert.equal(quiet.waiting.length, 1); assert.equal(quiet.waiting[0]!.event.amount, 7);
	const pure = structuredClone(quiet); for (const viewer of [0, 1, "spectator"] as const) {
		const view = project(quiet, viewer); assert.equal(view.objects!.filter(one => one.zone === "library").length, 0);
	} assert.deepEqual(quiet, pure); settle(quiet); assert.equal(quiet.seats[1]!.life, oldLife - 1);
	commit(quiet, [{ do: "note", note: { kind: "label", on: ref(watcher), by: 0, until: "end-of-turn", text: "Remove watch fixture", change: { loseAbilities: true } } }], "resolve");
	life(quiet, 1); assert.equal(quiet.waiting.length, 0);
	// Prevention and departed-source lifelink are read before the damage group changes anything.
	for (const mode of ["prevent", "departed", "leaves-together"] as const) {
		const table = build(); main(table, 0); put(table, cleric, "battlefield", 0, pack(cleric));
		const source = put(table, bat, "battlefield", 0, stored("deep-cavern-bat").registers), sourceRef = ref(source);
		if (mode === "prevent") commit(table, [{ do: "note", note: { kind: "damage-rule", by: 0, until: "end-of-turn", mode: "prevent" } }], "resolve");
		if (mode === "departed") commit(table, [{ do: "move", what: source.id, to: "graveyard", reason: "destroy" }], "destroy");
		commit(table, [...(mode === "leaves-together" ? [{ do: "move" as const, what: source.id, to: "graveyard" as const, reason: "destroy" as const }] : []),
			{ do: "damage", source: sourceRef, target: { player: 1 }, amount: 3 }], "resolve");
		assert.equal(table.waiting.length, mode === "prevent" ? 0 : 1); assert.equal(table.seats[0]!.life, mode === "prevent" ? 20 : 23);
		const pending = structuredClone(table); settle(table); replay(table, pending);
	}
	// Ward pays life without producing a gain event; its player still chooses to pay or decline.
	for (const choice of ["pay", "decline", "short"] as const) {
		const table = build(); main(table, 1); const protectedOne = put(table, amalia, "battlefield", 0, pack(amalia));
		put(table, cleric, "battlefield", 1, pack(cleric)); put(table, "Erode", "hand", 1);
		commit(table, [{ do: "add-mana", who: 1, colors: ["W"] }, ...(choice === "short" ? [{ do: "change-life" as const, who: 1, amount: -18, reason: "game-setup" as const }] : [])], "game-setup");
		const before = structuredClone(table);
		announce(table, example("Erode with its controller's optional search"), one => one.activation.targets[0]!.some(target => "id" in target && target.id === protectedOne.id));
		assert.equal(table.waiting.length, 1); apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
		const pending = structuredClone(table), decision = nextDecision(table)!; assert.equal(decision.seat, 1);
		if (choice === "short") assert.ok(!decision.options.some(one => one.label.startsWith("Pay ")));
		step(table, label => label.startsWith(choice === "pay" ? "Pay " : "Do not pay"));
		assert.equal(table.waiting.length, 0); settle(table, true);
		assert.equal(table.seats[1]!.life, choice === "pay" ? 17 : choice === "short" ? 2 : 20);
		assert.equal(protectedOne.zone, choice === "pay" ? "graveyard" : "battlefield"); replay(table, pending); replay(table, before);
	}
	// Amalia checks power after exploring; a revealed land is not drawn and a nonland stays a real choice.
	for (const variant of ["land", "keep", "graveyard", "empty", "twenty", "over-twenty", "removed", "stolen", "removed-stolen"] as const) {
		const table = build(); main(table, 0); prepare(table, amalia); const explorer = put(table, amalia, "hand");
		commit(table, [{ do: "add-mana", who: 0, colors: ["W", "B"] }], "game-setup");
		announce(table, printedCast(amalia, table.printed[amalia]!)); passBoth(table); finish(table);
		const victim = put(table, sanctifier, "battlefield", 1);
		const who = variant.includes("stolen") ? 1 : 0;
		const observer = put(table, "Plains", "battlefield", 1 - who, [{ kind: "watch", basis: "Fixture observes explore completion", event: { on: "keyword", keyword: "explore", by: "opponent", of: { types: ["creature"], controller: "opponent" } },
			effect: { instructions: [{ do: "counters", on: "this", kind: "observed", amount: 1 }] } }]);
		const explored = ref(explorer);
		if (variant === "twenty" || variant === "over-twenty") commit(table, [{ do: "counters", what: explorer.id, kind: "+1/+1", amount: variant === "twenty" ? 17 : 18 }], "game-setup");
		const top = put(table, variant === "land" ? "Plains" : "Starscape Cleric", "hand", who);
		commit(table, [{ do: "move", what: top.id, to: "library", position: "top", reason: "game-setup" }], "game-setup");
		if (variant === "empty") commit(table, cardsIn(table, "library", 0).map(one => ({ do: "move" as const, what: one.id, to: "exile" as const, reason: "game-setup" as const })), "game-setup");
		life(table, 1); assert.equal(table.waiting.length, 1);
		// A hypothetical control change after triggering isolates exploration from the ability controller.
		if (who) explorer.controller = who;
		if (variant.startsWith("removed")) commit(table, [{ do: "move", what: explorer.id, to: "graveyard", reason: "destroy" }], "destroy");
		const before = structuredClone(table); apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table); step(table); step(table);
		const revealed = structuredClone(table); if (variant !== "empty") for (const viewer of [0, 1, "spectator"] as const) assert.equal(project(table, viewer).objects!.find(one => one.id === top.id)!.card, top.card);
		settle(table, variant !== "graveyard");
		assert.equal(table.outcome, null, "exploring an empty library is not a failed draw");
		assert.equal(top.zone, variant === "empty" ? "exile" : variant === "land" ? "hand" : variant === "graveyard" ? "graveyard" : "library");
		assert.equal(explorer.counters["+1/+1"] ?? 0, variant === "land" || variant.startsWith("removed") ? 0 : variant === "twenty" ? 18 : variant === "over-twenty" ? 19 : 1);
		assert.equal(victim.zone, variant === "twenty" ? "graveyard" : "battlefield");
		assert.equal(observer.counters.observed, 1, "one completion is seen even with no library card or surviving explorer");
		assert.deepEqual(table.log.flatMap(one => one.changes).filter(one => one.do === "keyword" && one.name === "explore"),
			[{ do: "keyword", name: "explore", who, count: 1, object: explored }]);
		replay(table, revealed); replay(table, before);
	}
});
