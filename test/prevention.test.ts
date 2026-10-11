/** Prevention is one event filter for every damage route. The fixtures isolate its standing terms. */
import assert from "node:assert/strict";
import test from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { prevented } from "../src/core/damage.ts";
import { damageSource, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { startingIntent } from "../src/context/plan.ts";
import { focus } from "../src/context/packet.ts";
import { dossier } from "../src/context/dossier.ts";
import { describe, project } from "../src/core/view.ts";
import type { Table } from "../src/core/table.ts";
import type { Change } from "../src/core/syntax.ts";
import { announce, establish, example, finish, main, passBoth, place, step } from "./play.ts";

const ref = (one: { id: string; incarnation: number }) => ({ id: one.id, incarnation: one.incarnation });
const build = (deckName: string) => start(standard, [{ deck: deck(deckName) }, { deck: deck("Jeskai Artifacts") }], `prevention-${deckName}`);
const defend = (table: Table) => {
	const wall = establish(table, 1, "Crystal Barricade"), synthesizer = establish(table, 1, "Simulacrum Synthesizer", []);
	place(table, 1, "battlefield", "Candy Trail");
	// The Synthesizer's Construct, without asking this fixture to exercise its entry trigger.
	commit(table, [{ do: "token", id: "construct", controller: 1, spec: { name: "Construct", types: ["artifact", "creature"], subtypes: ["Construct"],
		colors: [], power: 0, toughness: 0, registers: [{ basis: table.printed[synthesizer.card!]!.oracle, kind: "continuous", affects: { is: "this" },
			change: { power: { count: { types: ["artifact"], controller: "you" } }, toughness: { count: { types: ["artifact"], controller: "you" } } } }] } }], "game-setup");
	return { wall, victim: table.things.get("construct")! };
};

test("prevention precedes damage results, yields to prohibitions, expires and replays through resolution", () => {
	const table = build("Dimir Midrange"), { wall, victim } = defend(table);
	const cecil = establish(table, 0, "Cecil, Dark Knight // Cecil, Redeemed Paladin"); main(table, 0);
	const hit: Change & { do: "damage" } = { do: "damage", source: ref(cecil), target: ref(victim), amount: 1 };
	const before = structuredClone(table), world = tableWorld(table), source = damageSource(table, hit.source);
	assert.equal(prevented(world, hit, source), true);
	const projected = viewWorld(project(table, 0));
	assert.equal(prevented(projected, hit, projected.lastKnown(ref(cecil))), true);
	assert.deepEqual(table, before, "reading prevention is pure");
	const receipt = commit(table, [hit], "resolve");
	assert.equal(hit.amount, 1, "the proposed group is not rewritten");
	assert.equal(victim.damage, 0); assert.equal(victim.deathtouched, undefined); assert.equal(table.waiting.length, 0);
	const grouped = structuredClone(table);
	commit(grouped, [hit, { ...hit, target: { player: 1 } }], "resolve");
	assert.equal(grouped.waiting.length, 1); assert.equal(grouped.waiting[0]!.event.amount, 1, "a trigger counts only damage actually dealt");
	assert.match(describe(table, receipt), /0 damage.*1 prevented/);
	commit(table, [{ do: "transform", what: cecil.id }], "resolve");
	const life = table.seats[0]!.life;
	commit(table, [hit], "resolve"); assert.equal(table.seats[0]!.life, life, "prevented damage has no lifelink result");
	commit(table, [{ ...hit, combat: true }], "resolve");
	assert.equal(victim.damage, 1); assert.equal(table.seats[0]!.life, life + 1, "noncombat prevention does not affect combat");
	commit(table, [{ ...hit, target: ref(wall) }, { ...hit, target: { player: 1 } }], "resolve");
	assert.equal(wall.damage, 1); assert.equal(table.seats[1]!.life, 19, "the wall protects neither itself nor its controller");
	commit(table, [{ do: "note", note: { kind: "label", by: 0, on: ref(wall), until: "end-of-turn", text: "Loses abilities", change: { loseAbilities: true } } }], "resolve");
	commit(table, [hit], "resolve"); assert.equal(victim.damage, 2, "the layer walk removes prevention with its ability");
	main(table, 1, 2); assert.equal(victim.damage, 0);
	commit(table, [{ do: "move", what: wall.id, to: "hand", reason: "bounce" }, hit], "resolve");
	assert.equal(victim.damage, 0, "a simultaneous departure still supplies prevention before the event");
	commit(table, [hit], "resolve"); assert.equal(victim.damage, 1, "the next event no longer has the source");

	for (const target of ["none", "legal", "lost"] as const) {
		const game = build("Izzet Spellementals"), { victim } = defend(game); main(game, 0);
		place(game, 0, "hand", "Impractical Joke");
		commit(game, [{ do: "add-mana", who: 0, colors: ["R"] }], "game-setup");
		const prefix = structuredClone(game), at = game.ledger.length;
		const chosen = announce(game, example("Cast Impractical Joke"), (one) => target === "none" ? !one.activation.targets[0]?.length
			: one.activation.targets[0]?.some((one) => "id" in one && one.id === victim.id) ?? false);
		if (target === "lost") { commit(game, [{ do: "move", what: victim.id, to: "exile", reason: "exile" }], "exile"); finish(game); }
		passBoth(game);
		if (target !== "lost") step(game);
		assert.equal(game.notes.some((note) => note.kind === "damage-rule"), target !== "lost");
		const pending = structuredClone(game), midway = game.ledger.length;
		finish(game);
		assert.equal(victim.damage, target === "legal" ? 3 : 0);
		assert.equal(game.things.get(chosen.activation.source.id)!.zone, "graveyard");
		const view = project(game, 0), frame = { seat: 0, version: game.cursor.clock, view };
		assert.equal(view.table.some((line) => line.includes("All damage can't be prevented")), target !== "lost");
		assert.equal(dossier({ frame }).includes("All damage can't be prevented"), target !== "lost");
		assert.equal(focus({ ...frame, decision: nextDecision(game)! }, startingIntent(0)).known.some((line) => line.includes("All damage can't be prevented")), target !== "lost");
		main(game, 1, 2);
		assert.equal(game.notes.some((note) => note.kind === "damage-rule"), false, "the prohibition expires with cleanup");
		assert.deepEqual(relive(pending, game.ledger.slice(midway)), game, "a clone between instructions reaches the same next turn");
		if (target !== "lost") assert.deepEqual(relive(prefix, game.ledger.slice(at)), game, "announcement and resolution replay");
		assert.ok(nextDecision(game));
	}
	const standing = build("Mono-Red Aggro"), protectedCreature = defend(standing).victim;
	const lynx = establish(standing, 0, "Sunspine Lynx"), claw = establish(standing, 0, "Hired Claw", []);
	main(standing, 0);
	const ping = { do: "damage" as const, source: ref(claw), target: ref(protectedCreature), amount: 1 };
	commit(standing, [ping], "resolve"); assert.equal(protectedCreature.damage, 1, "a standing prohibition also defeats prevention");
	commit(standing, [{ do: "move", what: lynx.id, to: "hand", reason: "bounce" }], "bounce");
	commit(standing, [ping], "resolve"); assert.equal(protectedCreature.damage, 1, "standing prohibition ends when its source leaves");

});
