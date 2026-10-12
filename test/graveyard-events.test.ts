/** Graveyard arrivals read after the event; departures look back, including their source's departure. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { blockConflicts } from "../src/core/combat-facts.ts";
import { tableWorld } from "../src/core/selectors.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import type { Change, Zone } from "../src/core/syntax.ts";
import type { Registration } from "../src/core/language.ts";
import { announce, example, main, pack, quiet } from "./play.ts";

const moon = "Moonshadow", academic = "Hardened Academic", ghast = "Bloodghast";
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const build = () => start(standard, [{ deck: alpha(deck("Mardu Discard")) }, { deck: alpha(deck("Mardu Discard")) }], "graveyard-events");
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function put(table: Table, card: string, zone: Zone, owner = 0, registers?: Registration[]) {
	const one = [...cardsIn(table, "library", owner), ...cardsIn(table, "hand", owner)].find(one => one.card === card)!; assert.ok(one, card);
	if (one.zone !== zone) commit(table, [{ do: "move", what: one.id, to: zone, reason: "game-setup", ...(registers ? { registers } : {}) }], "game-setup"); return one;
}
function settle(table: Table, target?: Thing) {
	for (let guard = 0; guard < 200; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		const option = decision.situation === "trigger-order" && target ? decision.options.find(one => one.objects?.some(one => one.id === target.id)) : undefined;
		apply(table, (option ?? quiet(decision.options)).id, "model", "chosen");
	} throw new Error("Resolution did not settle");
}

test("graveyard events distinguish arrival from departure and preserve grouped trigger-time meaning through replay", () => {
	const table = build(); main(table, 0);
	const lifelink = example("Discard for Hardened Academic's lifelink");
	for (const card of [moon, academic, ghast]) editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, printedCast: true, registers: pack(card), procedures: card === academic ? [lifelink] : [], deferred: [] } }], `prepare-${card}`);
	commit(table, [{ do: "add-mana", who: 0, colors: ["B", "R", "W"] }], "game-setup");
	const bodies = [moon, academic].map(card => {
		const object = put(table, card, "hand"), cast = printedCast(card, table.printed[card]!); cast.source.refs = [ref(object)];
		const before = structuredClone(table); announce(table, cast); settle(table); replay(table, before); return object;
	});
	const [shadow, bird] = bodies as [Thing, Thing]; assert.equal(shadow.counters["-1/-1"], 6);
	const blood = put(table, ghast, "hand"), beforeDiscard = structuredClone(table);
	announce(table, lifelink, one => one.activation.cost.discarded?.some(one => one.id === blood.id) ?? false);
	assert.equal(blood.zone, "graveyard"); assert.equal(table.waiting.length, 1); assert.equal(table.waiting[0]!.check, undefined, "while is not an intervening if");
	const pending = structuredClone(table); settle(table); assert.equal(shadow.counters["-1/-1"], 5); assert.ok(characteristics(table, bird)!.words.includes("lifelink"));
	replay(table, pending); replay(table, beforeDiscard);
	put(table, "Mountain", "hand"); const beforeLand = structuredClone(table);
	const land = nextDecision(table)!.options.find(one => one.id.startsWith("land:") && one.label.includes("Mountain"))!; assert.ok(land); apply(table, land.id, "model", "chosen");
	assert.equal(table.waiting.length, 1); settle(table, shadow); assert.equal(blood.zone, "battlefield"); assert.equal(shadow.counters["-1/-1"], 4); replay(table, beforeLand);
	assert.ok(blockConflicts({ ...shadow, traits: characteristics(table, shadow) }, { ...blood, traits: characteristics(table, blood) }, tableWorld(table)).some(one => one.includes("can't block")));
	assert.ok(!characteristics(table, blood)!.words.includes("haste"));
	commit(table, [{ do: "change-life", who: 1, amount: -10, reason: "resolve" }], "resolve"); assert.ok(characteristics(table, blood)!.words.includes("haste"));
	commit(table, [{ do: "change-life", who: 1, amount: 1, reason: "resolve" }], "resolve"); assert.ok(!characteristics(table, blood)!.words.includes("haste"));
	// Casting from the graveyard leaves it before the spell resolves. A fixture permission grants the route.
	const nextMoon = put(table, moon, "graveyard");
	commit(table, [{ do: "note", note: { kind: "permit", by: 0, who: 0, fromTurn: 0, until: "end-of-turn", on: ref(nextMoon) } }, { do: "add-mana", who: 0, colors: ["B"] }], "game-setup");
	const recast = printedCast(moon, table.printed[moon]!); recast.source.refs = [ref(nextMoon)]; const beforeCast = structuredClone(table);
	announce(table, recast); assert.equal(nextMoon.zone, "stack"); assert.equal(table.waiting.length, 1); assert.ok(table.waiting[0]!.basis.includes("leave your graveyard"));
	settle(table, shadow); assert.equal(nextMoon.zone, "battlefield"); assert.equal(shadow.counters["-1/-1"], 3); replay(table, beforeCast);
	// Batch arrivals count once, read post-event card types, and require a surviving watcher with counters.
	for (const mode of ["batch", "separate", "opponent", "nonpermanent", "token", "exile", "dying", "entering", "zero", "removed-before-resolution", "changed-type"] as const) {
		const game = build(); main(game, 0); const watcher = put(game, moon, mode === "entering" ? "hand" : "battlefield", 0, pack(moon));
		const name = mode === "nonpermanent" ? "Burst Lightning" : ghast, owner = mode === "opponent" ? 1 : 0;
		const a = put(game, name, "hand", owner), b = put(game, "Iron-Shield Elf", "hand", owner);
		if (mode === "zero") commit(game, [{ do: "counters", what: watcher.id, kind: "-1/-1", amount: -6 }], "game-setup");
		if (mode === "token") commit(game, [{ do: "token", id: "token-copy", controller: 0, spec: { name: ghast, types: ["creature"], subtypes: ["Vampire", "Spirit"], colors: ["B"], power: 2, toughness: 1 } }], "game-setup");
		const victim = mode === "token" ? game.things.get("token-copy")! : a;
		const movement: Change[] = [{ do: "move", what: victim.id, to: mode === "exile" ? "exile" : "graveyard", reason: "resolve" }];
		if (["batch", "separate"].includes(mode)) movement.push({ do: "move", what: b.id, to: "graveyard", reason: "resolve" });
		if (mode === "dying") movement.push({ do: "move", what: watcher.id, to: "graveyard", reason: "destroy" });
		if (mode === "entering") movement.push({ do: "move", what: watcher.id, to: "battlefield", reason: "resolve", registers: pack(moon) });
		if (mode === "changed-type") movement.push({ do: "note", note: { kind: "label", on: { id: a.id, incarnation: a.incarnation + 1 }, by: 0, until: "end-of-turn", text: "Post-event type fixture", change: { types: { remove: ["creature"], add: ["instant"] } } } });
		if (mode === "separate") for (const one of movement) commit(game, [one], "resolve"); else commit(game, movement, "resolve");
		const expected = ["batch", "entering", "removed-before-resolution"].includes(mode) ? 1 : mode === "separate" ? 2 : 0;
		assert.equal(game.waiting.length, expected, mode);
		if (mode === "removed-before-resolution") {
			commit(game, [{ do: "counters", what: watcher.id, kind: "-1/-1", amount: -6 }], "resolve");
			assert.equal(game.waiting[0]!.check, undefined, "the already-raised ability still resolves with no counters left");
		}
		const before = structuredClone(game); nextDecision(game); project(game, 0); project(game, "spectator"); assert.deepEqual(game, before);
		settle(game); if (["batch", "separate", "entering"].includes(mode)) assert.equal(watcher.counters["-1/-1"], 6 - expected);
		if (mode === "removed-before-resolution") assert.ok(game.log.slice(before.log.length).some(row => row.changes.some(one => one.do === "counters" && one.what === watcher.id && one.amount === -1)), "the raised ability resolves instead of being removed for a failed intervening check");
		replay(game, before);
	}
	// Graveyard departures look back even if the watcher leaves or loses its ability in the same group.
	for (const mode of ["batch", "leaving", "entering", "lost-same-group", "lost-before", "opponent", "hidden", "typed"] as const) {
		const game = build(), registers = pack(academic); main(game, 0);
		if (mode === "typed") for (const one of registers) if (one.kind === "watch") one.event.of!.types = ["artifact"];
		const watcher = put(game, academic, mode === "entering" ? "hand" : "battlefield", 0, registers);
		const target = put(game, moon, "battlefield", 0, pack(moon));
		const owner = mode === "opponent" ? 1 : 0, a = put(game, ghast, "graveyard", owner), b = put(game, "Iron-Shield Elf", "graveyard", owner);
		if (mode === "typed") commit(game, [a, b].map(one => ({ do: "note", note: { kind: "label", on: ref(one), by: 0, until: "end-of-turn", text: "Prior graveyard types fixture", change: { types: { add: ["artifact"] } } } })), "game-setup");
		const old = [ref(a), ref(b)], loss: Change = { do: "note", note: { kind: "label", on: ref(watcher), by: 0, until: "end-of-turn", text: "Ability loss fixture", change: { loseAbilities: true } } };
		if (mode === "lost-before") commit(game, [loss], "resolve");
		const moves: Change[] = [a, b].map(one => ({ do: "move", what: one.id, to: mode === "hidden" ? "library" : "exile", reason: "resolve" }));
		if (mode === "leaving") moves.push({ do: "move", what: watcher.id, to: "graveyard", reason: "destroy" });
		if (mode === "entering") moves.push({ do: "move", what: watcher.id, to: "battlefield", reason: "resolve", registers: pack(academic) });
		if (mode === "lost-same-group") moves.push(loss);
		commit(game, moves, "resolve");
		const departure = game.waiting.filter(one => one.basis.includes("leave your graveyard"));
		assert.equal(departure.length, ["entering", "lost-before", "opponent"].includes(mode) ? 0 : 1, mode);
		if (mode === "hidden") assert.deepEqual(departure[0]!.event.objects, old, "hidden destination identities do not escape the old public refs");
		const before = structuredClone(game); settle(game, target); replay(game, before);
	}
});
