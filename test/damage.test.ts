/** Damage facts describe the event, including simultaneous recipients and a departed source. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { amount, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { describe, project } from "../src/core/view.ts";
import { establish, finish, main, passBoth, place } from "./play.ts";

const cecil = "Cecil, Dark Knight // Cecil, Redeemed Paladin";
const ref = (one: { id: string; incarnation: number }) => ({ id: one.id, incarnation: one.incarnation });

test("damage groups retain amounts, sources and recipients through transformation, projection and replay", () => {
	for (const combat of [false, true]) {
		const table = start({ ...standard, startingLife: 21 }, [{ name: "Cecil", deck: deck("Dimir Midrange") }, { name: "Bant", deck: deck("Bant Airbending Combo") }], `damage-${combat}`);
		const source = establish(table, 0, cecil), victim = establish(table, 1, "Appa, Steadfast Guardian", []);
		const walker = establish(table, 0, "Kaito, Bane of Nightmares", []);
		main(table, 0);
		commit(table, [{ do: "change-life", who: 0, amount: -8, reason: "game-setup" }, { do: "tap", what: source.id },
			{ do: "counters", what: walker.id, kind: "loyalty", amount: 4 }], "game-setup");
		const event = commit(table, [{ do: "damage", source: ref(source), target: ref(victim), amount: 1, ...(combat ? { combat: true } : {}) },
			{ do: "damage", source: ref(source), target: { player: 1 }, amount: 2, ...(combat ? { combat: true } : {}) }], "resolve");
		assert.equal(table.waiting.length, 1, "Cecil dealt damage once, across two recipients");
		assert.equal(table.waiting[0]!.event.amount, 3);
		assert.equal(table.waiting[0]!.event.recipient, undefined, "no arbitrary first recipient");
		assert.equal(table.waiting[0]!.event.player, undefined, "a creature and a player are not one shared player");
		assert.equal(table.seats[0]!.life, 13, "the trigger has not lost life yet");
		assert.equal(amount({ world: viewWorld(project(table, 0)), controller: 0 }, { half: { startingLife: "you" }, round: "down" }), 10);
		const prefix = structuredClone(table), from = table.ledger.length;
		finish(table); // Deathtouch settles before the waiting trigger is put on the stack.
		assert.equal(victim.zone, "graveyard");
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
		passBoth(table); finish(table);
		assert.equal(table.seats[0]!.life, 10);
		assert.equal(source.face, 1); assert.equal(source.tapped, false);
		assert.deepEqual(relive(prefix, table.ledger.slice(from)), table);
		assert.ok(characteristics(table, source)!.words.includes("lifelink"));
		commit(table, [{ do: "damage", source: ref(source), target: ref(walker), amount: 2 }], "resolve");
		assert.equal(walker.counters.loyalty, 2); assert.equal(walker.damage, 0);
		assert.equal(table.seats[0]!.life, 12, "damage to a planeswalker also has lifelink");
		assert.equal(table.waiting.length, 0, "the back face has no Darkness watch");
		const departed = ref(source);
		commit(table, [{ do: "move", what: source.id, to: "graveyard", reason: "destroy" }], "destroy");
		commit(table, [{ do: "move", what: source.id, to: "battlefield", reason: "resolve" }], "resolve");
		assert.equal(source.face, undefined);
		commit(table, [{ do: "damage", source: departed, target: { player: 1 }, amount: 2 }], "resolve");
		assert.equal(table.seats[0]!.life, 14, "the old back face supplies lifelink even beside its new front incarnation");
		assert.equal(table.waiting.length, 0, "the new Cecil did not deal that damage");
		assert.ok(describe(table, event).includes("Cecil"));
	}
	const table = start(standard, [{ name: "Lizards", deck: deck("Rakdos Lizards") }, { name: "Red", deck: deck("Mono-Red Aggro") }], "damage-batch");
	const bard = establish(table, 0, "Master of Barbs"), claw = establish(table, 1, "Hired Claw", []);
	main(table, 0);
	commit(table, [{ do: "damage", source: bard.id, target: { player: 1 }, amount: 2 }, { do: "damage", source: claw.id, target: { player: 1 }, amount: 3 },
		{ do: "damage", source: bard.id, target: { player: 0 }, amount: 1 }, { do: "damage", source: bard.id, target: { player: 1 }, amount: 4, combat: true },
		{ do: "damage", source: claw.id, target: { player: 1 }, amount: 0 }], "resolve");
	assert.equal(table.waiting.length, 1); assert.equal(table.waiting[0]!.event.amount, 5);
	assert.equal(table.waiting[0]!.event.source, undefined, "a grouped trigger does not invent one shared source");
	assert.equal(table.waiting[0]!.event.player, 1);
	const before = structuredClone(table);
	assert.throws(() => commit(table, [{ do: "damage", source: bard.id, target: { ...ref(claw), incarnation: 99 }, amount: 1 }], "resolve"), /no longer/);
	assert.deepEqual(table, before, "a stale recipient moves nothing");
	const [hidden] = place(table, 1, "hand", "Lightning Strike");
	const receipt = commit(table, [{ do: "damage", source: ref(hidden!), target: { player: 0 }, amount: 1 }], "resolve");
	commit(table, [{ do: "reveal", what: hidden!.id }, { do: "move", what: hidden!.id, to: "graveyard", reason: "resolve" }], "resolve");
	assert.ok(!describe(table, receipt).includes("Lightning Strike"), "later visibility cannot name an earlier hidden source");
	assert.equal(amount({ world: tableWorld(table), controller: 0 }, { history: "life-lost", by: "opponent" }), 9);
});
