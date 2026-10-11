/** Prevention is one event filter for every damage route. The fixtures isolate its standing terms.
 * Past 150 lines to keep ordering, simultaneous results and bindings in this invariant. */
import assert from "node:assert/strict";
import test from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { prevented } from "../src/core/damage.ts";
import { beforeDamage } from "../src/core/damage-order.ts";
import { damageSource, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { startingIntent } from "../src/context/plan.ts";
import { focus } from "../src/context/packet.ts";
import { dossier } from "../src/context/dossier.ts";
import { describe, project } from "../src/core/view.ts";
import type { Table } from "../src/core/table.ts";
import type { Change } from "../src/core/syntax.ts";
import { announce, establish, example, finish, main, pack, passBoth, place, step } from "./play.ts";

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

	for (const prevention of [false, true]) for (const prohibited of [false, true]) {
		const game = build("Boros Tokens"), { victim } = defend(game);
		main(game, 0); const [torch] = place(game, 0, "hand", "Torch the Tower");
		if (!prevention) commit(game, [{ do: "move", what: [...game.things.values()].find(one => one.card === "Crystal Barricade" && one.zone === "battlefield")!.id, to: "hand", reason: "bounce" }], "game-setup");
		if (prohibited) commit(game, [{ do: "note", note: { kind: "damage-rule", by: 0, until: "end-of-turn", mode: "unpreventable" } }], "game-setup");
		commit(game, [{ do: "add-mana", who: 0, colors: ["R"] }], "game-setup");
		const initial = structuredClone(game), at = game.ledger.length;
		announce(game, example("Cast Torch the Tower without bargain"), choice => choice.activation.source.id === torch!.id && choice.activation.targets[0]!.some(one => "id" in one && one.id === victim.id));
		passBoth(game);
		const unchanged = structuredClone(game); nextDecision(game); assert.deepEqual(game, unchanged);
		step(game);
		const dealt = !prevention || prohibited;
		assert.deepEqual(game.resolution!.bound.damaged, { objects: dealt ? [ref(victim)] : [], players: [], amount: dealt ? 2 : 0 });
		const middle = structuredClone(game), from = game.ledger.length;
		finish(game);
		assert.equal(game.notes.some(note => note.kind === "register" && note.on.id === victim.id && note.registration.kind === "replace"), dealt);
		assert.deepEqual(relive(initial, game.ledger.slice(at)), game);
		assert.deepEqual(relive(middle, game.ledger.slice(from)), game, "a saved damage binding retains the exact damaged incarnation");
		commit(game, [{ do: "move", what: victim.id, to: "graveyard", reason: "destroy" }], "resolve");
		assert.equal(victim.zone, dealt ? "exile" : "graveyard", "preventing Torch's damage prevents its later exile replacement");
	}
	const mixed = build("Izzet Spellementals"), { victim: protectedTarget } = defend(mixed);
	main(mixed, 0); place(mixed, 0, "hand", "Prismari Charm");
	commit(mixed, [{ do: "add-mana", who: 0, colors: ["U", "R"] }], "game-setup");
	const charm = example("Prismari Charm deals 1 to each of one or two targets");
	charm.instructions[0]!.as = "dealt";
	announce(mixed, charm, choice => choice.activation.targets[0]!.length === 2 &&
		choice.activation.targets[0]!.some(one => "player" in one && one.player === 0) &&
		choice.activation.targets[0]!.some(one => "id" in one && one.id === protectedTarget.id));
	passBoth(mixed); step(mixed);
	const resolved = mixed.log.at(-1)!.changes.find(change => change.do === "resolution" && change.action === "next");
	assert.ok(resolved?.do === "resolution" && resolved.action === "next");
	assert.deepEqual(resolved.bind!.dealt, { objects: [], players: [0], amount: 1 }, "a partially prevented group binds only the damaged recipient");

	for (const first of ["prevent", "add"] as const) for (const unpreventable of [false, true]) {
		const game = build("Rakdos Lizards"), { victim } = defend(game);
		const lizard = establish(game, 0, "Hired Claw", []);
		establish(game, 0, "Valley Flamecaller"); establish(game, 0, "Valley Flamecaller"); main(game, 0);
		if (unpreventable) commit(game, [{ do: "note", note: { kind: "damage-rule", by: 0, until: "end-of-turn", mode: "unpreventable" } }], "resolve");
		const group: Change[] = [{ do: "damage", source: ref(lizard), target: ref(victim), amount: 1 },
			{ do: "damage", source: ref(lizard), target: { player: 0 }, amount: 1 }];
		const untouched = structuredClone(game);
		assert.throws(() => commit(game, [{ do: "tap", what: lizard.id }, ...group], "resolve"), /replacement-order/);
		assert.deepEqual(game, untouched, "an unordered group cannot partly commit");
		commit(game, beforeDamage(game, group, "resolve"), "resolve");
		const initial = structuredClone(game), at = game.ledger.length;
		assert.equal(nextDecision(game)!.seat, 0, "the active affected player chooses before the nonactive player");
		const pure = structuredClone(game); nextDecision(game); assert.deepEqual(game, pure);
		assert.equal(game.seats[0]!.life, 20); assert.equal(victim.damage, 0);
		apply(game, nextDecision(game)!.options[0]!.id, "model", "chosen");
		assert.equal(nextDecision(game)!.seat, 1, "the damaged permanent's controller chooses its order");
		const middle = structuredClone(game), from = game.ledger.length;
		assert.equal(game.seats[0]!.life, 20, "another recipient's settled damage still waits for the group");
		while (game.damageOrder) {
			const next = nextDecision(game)!, wanted = next.options.find(one => first === "prevent" ? one.label.includes("Crystal Barricade") : one.label.includes("Valley Flamecaller"));
			apply(game, (wanted ?? next.options[0]!).id, "model", "chosen");
		}
		assert.equal(game.seats[0]!.life, 17); assert.equal(victim.damage, unpreventable ? 3 : 0);
		const hit = game.log.at(-1)!.changes.find(one => one.do === "damage" && "id" in one.target)!;
		assert.ok(hit.do === "damage"); assert.equal(hit.prevented, unpreventable ? undefined : first === "prevent" ? 1 : 3);
		assert.equal(new Set(hit.replacements).size, hit.replacements!.length, "each effect applies once");
		assert.deepEqual(relive(initial, game.ledger.slice(at)), game);
		assert.deepEqual(relive(middle, game.ledger.slice(from)), game);
	}
	// A real landfall instruction reaches ordering through the serial resolution dispatcher.
	const game = build("Rakdos Lizards"); main(game, 0);
	const terms = pack("Iridescent Vinelasher");
	for (const term of terms) if (term.kind === "watch") for (const instruction of term.effect.instructions) if (instruction.do === "damage") instruction.as = "dealt";
	const lizard = establish(game, 0, "Iridescent Vinelasher", terms);
	establish(game, 0, "Valley Flamecaller"); establish(game, 0, "Valley Flamecaller");
	place(game, 0, "hand", "Mountain");
	const initial = structuredClone(game), at = game.ledger.length;
	apply(game, nextDecision(game)!.options.find(one => one.id.startsWith("land:") && one.label.includes("Mountain"))!.id, "model", "chosen");
	apply(game, nextDecision(game)!.options[0]!.id, "model", "chosen"); passBoth(game); step(game);
	assert.ok(game.damageOrder); assert.equal(game.seats[1]!.life, 20);
	apply(game, nextDecision(game)!.options[0]!.id, "model", "chosen"); finish(game);
	assert.equal(game.seats[1]!.life, 17); assert.deepEqual(relive(initial, game.ledger.slice(at)), game);
	const bound = game.log.flatMap(receipt => receipt.changes).findLast(one => one.do === "resolution" && one.action === "next" && one.bind?.dealt);
	assert.ok(bound?.do === "resolution" && bound.action === "next");
	assert.deepEqual(bound.bind!.dealt, { objects: [], players: [1], amount: 3 }, "a damage binding includes replacement increases");
	commit(game, [{ do: "damage", source: ref(lizard), target: { player: 1 }, amount: 0 }], "resolve");
	assert.equal(game.seats[1]!.life, 17, "zero damage does not become a new event through increases");

	const single = build("Rakdos Lizards"), caller = establish(single, 0, "Valley Flamecaller"), sourceClaw = establish(single, 0, "Hired Claw", []);
	const enemy = establish(single, 1, "Crystal Barricade"), last = ref(sourceClaw);
	const increased: Change = { do: "damage", source: last, target: { player: 1 }, amount: 1 };
	commit(single, [{ do: "note", note: { kind: "label", by: 0, on: last, until: "indefinite", text: "Granted lifelink", change: { words: ["lifelink"] } } }], "game-setup");
	commit(single, [increased], "resolve"); assert.equal(single.seats[0]!.life, 22); assert.equal(single.seats[1]!.life, 18);
	commit(single, [{ ...increased, source: ref(enemy) }], "resolve"); assert.equal(single.seats[1]!.life, 17, "an opponent's unmatched source gets no increase");
	commit(single, [{ do: "move", what: sourceClaw.id, to: "graveyard", reason: "destroy" }], "resolve");
	commit(single, [increased], "resolve"); assert.equal(single.seats[1]!.life, 15); assert.equal(single.seats[0]!.life, 24, "last known source traits control increases and lifelink");
	commit(single, [{ do: "move", what: caller.id, to: "hand", reason: "bounce" }, increased], "resolve");
	assert.equal(single.seats[1]!.life, 13, "a simultaneous departure still supplies its replacement");
	commit(single, [increased], "resolve"); assert.equal(single.seats[1]!.life, 12, "the following event no longer has the replacement");

});
