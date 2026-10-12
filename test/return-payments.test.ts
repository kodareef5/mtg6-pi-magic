/** Return payments use current combat status and finish before responses. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision, advance } from "../src/core/decisions.ts";
import { activationChanges } from "../src/core/procedures.ts";
import { relive } from "../src/core/journal.ts";
import { matches, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import type { Table, Thing } from "../src/core/table.ts";
import { announce, establish, example, finish, main, offered, passBoth, place, quiet, step } from "./play.ts";

const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const setup = () => start(standard, [{ deck: alpha(deck("Boros Tokens")) }, { deck: alpha(deck("Azorius Control")) }], "return-payments");
const reach = (table: Table, at: string) => {
 for (let guard = 0; guard < 500; guard++) {
  const next = nextDecision(table);
  if (next?.situation === "turn-based" && table.cursor.steps[0] === at) return;
  if (next) apply(table, quiet(next.options).id, "model", "chosen"); else advance(table);
 }
 throw new Error(`Did not reach ${at}`);
};

test("return payments require live distinct controlled permanents and preserve unblocked status, owners, replay and clones", () => {
 const technique = start(standard, [{ deck: alpha(deck("Bant Airbending Combo")) }, { deck: alpha(deck("Azorius Control")) }], "sneak-sorcery");
 const elf = establish(technique, 0, "Llanowar Elves", []);
 place(technique, 0, "hand", "Michelangelo's Technique");
 const sneaking = example("Cast Michelangelo's Technique for sneak");
 main(technique, 0, 3);
 assert.equal(offered(technique, sneaking).length, 0);
 reach(technique, "declare-attackers");
 apply(technique, `attack:${elf.id}`, "model", "chosen"); apply(technique, "attack:done", "model", "chosen");
 reach(technique, "declare-blockers"); apply(technique, "block:done", "model", "chosen");
 while (!nextDecision(technique)) advance(technique);
 commit(technique, [{ do: "add-mana", who: 0, colors: ["G", "C", "C", "C"] }], "game-setup");
 assert.equal(offered(technique, example("Cast Michelangelo's Technique normally")).length, 0, "ordinary sorcery timing remains restricted");
 const prior = structuredClone(technique), priorAt = technique.ledger.length;
 const cast = announce(technique, sneaking), card = technique.things.get(cast.activation.source.id)!;
 assert.equal(elf.zone, "hand"); assert.equal(card.zone, "stack");
 passBoth(technique); step(technique); step(technique, label => /Decline|Nothing/.test(label)); finish(technique);
 assert.equal(card.zone, "graveyard"); assert.deepEqual(relive(prior, technique.ledger.slice(priorAt)), technique);
 const table = setup(), free = establish(table, 0, "Stadium Headliner", []), blocked = establish(table, 0, "Stadium Headliner", []);
 const walker = establish(table, 1, "The Theorist, Jace Beleren", []);
 main(table, 0, 3);
 const spell = place(table, 0, "hand", "The Last Ronin's Technique")[0]!;
 const sneak = example("Cast The Last Ronin's Technique for sneak"), ordinary = example("Cast The Last Ronin's Technique normally");
 commit(table, [{ do: "add-mana", who: 0, colors: ["W", "C", "C", "C"] },
  { do: "token", id: "fish-blocker", controller: 1, spec: { name: "Fish", types: ["creature"], colors: ["U"], power: 1, toughness: 1 } }], "game-setup");
 assert.ok(offered(table, ordinary).length); assert.equal(offered(table, sneak).length, 0, "sneak is not a main-phase alternative");
 reach(table, "declare-attackers");
 apply(table, `attack:${free.id}`, "model", "chosen"); apply(table, `attack:${blocked.id}`, "model", "chosen"); apply(table, "attack:done", "model", "chosen");
 reach(table, "declare-blockers");
 for (const world of [tableWorld(table), viewWorld(project(table, 0))]) assert.equal(matches({ world, controller: 0 }, world.objects.find(one => one.id === free.id)!, { blocked: false }), false);
 apply(table, `block:fish-blocker:${blocked.id}`, "model", "chosen"); apply(table, "block:done", "model", "chosen");
 while (!nextDecision(table)) advance(table);
 commit(table, [{ do: "add-mana", who: 0, colors: ["W", "C"] }, { do: "move", what: "fish-blocker", to: "graveyard", reason: "destroy" }], "game-setup");
 finish(table);
 for (const world of [tableWorld(table), viewWorld(project(table, 0))]) {
  assert.equal(matches({ world, controller: 0 }, world.objects.find(one => one.id === free.id)!, { blocked: false }), true);
  assert.equal(matches({ world, controller: 0 }, world.objects.find(one => one.id === blocked.id)!, { blocked: false }), false, "a departed blocker does not unblock its attacker");
 }
 const pure = structuredClone(table), choices = offered(table, sneak); assert.ok(choices.length); assert.deepEqual(table, pure);
 assert.ok(choices.every(one => one.activation.cost.returned?.length === 1 && one.activation.cost.returned[0]!.id === free.id));
 const duplicate = structuredClone(choices[0]!.activation); duplicate.cost.sacrificed = duplicate.cost.returned;
 assert.throws(() => activationChanges(table, duplicate), /two parts/);
 const gone = structuredClone(table); commit(gone, [{ do: "move", what: free.id, to: "hand", reason: "resolve" }], "resolve");
 assert.throws(() => activationChanges(gone, choices[0]!.activation), /no longer there/);
 assert.equal(offered(table, { ...sneak, cost: { ...sneak.cost, sacrifice: { choose: { blocked: false }, count: 1 } } }).length, 0);
 const before = structuredClone(table), began = table.ledger.length, incarnation = free.incarnation;
 announce(table, sneak); assert.equal(free.zone, "hand"); assert.equal(free.incarnation, incarnation + 1); assert.equal(spell.zone, "stack");
 assert.equal(table.seats[0]!.pool.length, 0); assert.equal([...table.things.values()].filter(one => one.token?.name === "Ninja Turtle Spirit").length, 0);
 const pending = structuredClone(table), at = table.ledger.length;
 passBoth(table);
 step(table, label => label.includes("The Theorist")); step(table, label => !label.includes("The Theorist")); step(table, label => !label.includes("The Theorist")); finish(table);
 const tokens = [...table.things.values()].filter(one => one.token?.name === "Ninja Turtle Spirit");
 assert.equal(tokens.length, 3); assert.ok(tokens.every(one => one.tapped && table.combat!.attackers.some(attack => attack.id === one.id)));
 assert.deepEqual(table.combat!.attackers.find(one => one.id === tokens[0]!.id)!.to, ref(walker));
 assert.equal(table.waiting.length, 0, "entering attackers do not declare attacks");
 assert.deepEqual(relive(before, table.ledger.slice(began)), table); assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
 reach(table, "combat-damage");
 apply(table, "damage", "model", "chosen"); finish(table);
 place(table, 0, "hand", "The Last Ronin's Technique"); commit(table, [{ do: "add-mana", who: 0, colors: ["W", "C"] }], "game-setup");
 assert.equal(offered(table, sneak).length, 0, "the alternative ends after declare blockers");

 const normal = setup(); main(normal, 0);
 place(normal, 0, "hand", "The Last Ronin's Technique"); commit(normal, [{ do: "add-mana", who: 0, colors: ["W", "C", "C", "C"] }], "game-setup");
 announce(normal, ordinary); passBoth(normal); finish(normal);
 assert.ok([...normal.things.values()].filter(one => one.token).every(one => !one.tapped)); assert.equal(normal.combat, null);

 const borrowed = setup(); main(borrowed, 0);
 const foreign = place(borrowed, 1, "hand", "The Theorist, Jace Beleren")[0]!;
 commit(borrowed, [{ do: "move", what: foreign.id, to: "battlefield", controller: 0, reason: "game-setup" }, { do: "add-mana", who: 0, colors: ["W", "C"] }], "game-setup");
 place(borrowed, 0, "hand", "The Last Ronin's Technique");
 const fixture = { ...ordinary, cost: { mana: "{1}{W}", return: { choose: { name: "The Theorist, Jace Beleren" }, count: 1 } } };
 const ownedBefore = structuredClone(borrowed), ownedAt = borrowed.ledger.length;
 announce(borrowed, fixture); assert.equal(foreign.zone, "hand"); assert.equal(foreign.owner, 1); assert.equal(foreign.controller, 1);
 assert.equal(project(borrowed, 0).objects!.find(one => one.id === foreign.id)?.card, undefined);
 assert.deepEqual(relive(ownedBefore, borrowed.ledger.slice(ownedAt)), borrowed);
});
