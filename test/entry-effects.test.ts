/** A resolving characteristic effect applies with entry, survives only that
 * incarnation, and never becomes a copiable value. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { nextDecision, apply } from "../src/core/decisions.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { tokenCopy } from "../src/core/copies.ts";
import { beforeEntry } from "../src/core/entry-payments.ts";
import { editWork } from "../src/core/work-tools.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { check, InstructionSchema } from "../src/core/language.ts";
import { establish, finish, main, pack, passBoth, place } from "./play.ts";

const prepare = (table: Table, card: string, seat = 0) =>
 editWork(table, seat, [{ do: "package.put", package: { card, registers: pack(card), procedures: [], printedCast: true } }], `prepare-${card}-${seat}`);
const stackTrigger = (table: Table) => {
 const choice = nextDecision(table)!; assert.equal(choice.situation, "trigger-order");
 apply(table, choice.options[0]!.id, "model", "chosen");
};
const position = (controller = 0) => {
 const table = start(standard, [{ deck: alpha(deck("Dimir Midrange")) }, { deck: alpha(deck("4c Reanimator")) }], "entry-effects");
 const curiosity = establish(table, 0, "Enduring Curiosity");
 prepare(table, curiosity.card!); prepare(table, curiosity.card!, 1);
 if (controller !== 0) commit(table, [
  { do: "move", what: curiosity.id, to: "hand", reason: "game-setup" },
  { do: "move", what: curiosity.id, to: "battlefield", controller, registers: pack(curiosity.card!), reason: "game-setup" },
 ], "game-setup");
 const terror = place(table, 1, "hand", "Terror of the Peaks")[0]!;
 commit(table, [{ do: "move", what: terror.id, to: "battlefield", controller: 0, reason: "game-setup", registers: [{
  kind: "watch", basis: "Whenever another creature you control enters, this creature deals damage equal to that creature's power to any target.",
  event: { on: "enters", of: { types: ["creature"], controller: "you", other: true } },
  effect: { targets: [{ object: { types: ["creature", "planeswalker", "battle"] }, player: "any" }], instructions: [{ do: "damage", to: "target:0", amount: { power: "event:object" } }] },
 }] }], "game-setup");
 main(table, 0); return { table, curiosity, terror };
};

test("a returned permanent has its resolving characteristic effect during entry, without making that effect copiable", () => {
 assert.throws(() => check(InstructionSchema, { do: "move", what: "this", to: "hand", reason: "bounce", change: { types: { set: ["enchantment"] } } }, "move"));
 for (const controller of [0, 1]) {
  const { table, curiosity, terror } = position(controller);
  commit(table, [{ do: "move", what: curiosity.id, to: "graveyard", reason: "destroy" }], "resolve");
  assert.equal(table.waiting.length, 1); assert.equal(table.waiting[0]!.controller, controller);
  const initial = structuredClone(table), from = table.ledger.length;
  stackTrigger(table); const pending = structuredClone(table), at = table.ledger.length;
  passBoth(table); finish(table);
  assert.equal(curiosity.zone, "battlefield"); assert.equal(curiosity.controller, 0, "the owner's control, independent of the trigger's controller");
  const traits = characteristics(table, curiosity)!;
  assert.deepEqual(traits.types, ["enchantment"]); assert.deepEqual(traits.subtypes, []);
  assert.equal(traits.power, undefined); assert.equal(traits.toughness, undefined);
  assert.equal(table.waiting.length, 0, "Terror never sees an entering creature");
  assert.equal(table.notes.filter(one => one.kind === "label" && one.on.id === curiosity.id).length, 1);
  const copied = tokenCopy(table, curiosity); assert.ok("spec" in copied);
  assert.deepEqual(copied.spec.types, ["enchantment", "creature"]); assert.equal(copied.spec.power, 4);
  for (const viewer of [0, 1, "spectator"] as const) assert.deepEqual(project(table, viewer).objects!.find(one => one.id === curiosity.id)!.traits!.types, ["enchantment"]);
  assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
  assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
  const hand = cardsIn(table, "hand", 0).length;
  commit(table, [{ do: "damage", source: terror.id, target: { player: 1 }, amount: 2, combat: true }], "combat");
  assert.equal(table.waiting.length, 1, "its combat-damage draw ability remains active as an enchantment");
  stackTrigger(table); passBoth(table); finish(table);
  assert.equal(cardsIn(table, "hand", 0).length, hand + 1);
  commit(table, [{ do: "move", what: curiosity.id, to: "graveyard", reason: "destroy" }], "resolve");
  assert.equal(table.waiting.length, 0, "an enchantment that was not a creature does not trigger the return");
  assert.ok(!table.notes.some(one => "on" in one && one.on.id === curiosity.id));
  commit(table, [{ do: "move", what: curiosity.id, to: "battlefield", registers: pack(curiosity.card!), reason: "resolve" }], "resolve");
  assert.equal(table.waiting.length, 1, "Terror sees a later ordinary creature entry");
  assert.deepEqual(characteristics(table, curiosity)!.types, ["enchantment", "creature"]);
  assert.deepEqual(characteristics(table, curiosity)!.subtypes, ["Cat", "Glimmer"]);
  assert.equal(characteristics(table, curiosity)!.power, 4);
 }
 const stale = position();
 commit(stale.table, [{ do: "move", what: stale.curiosity.id, to: "graveyard", reason: "destroy" }], "resolve");
 stackTrigger(stale.table);
 commit(stale.table, [{ do: "move", what: stale.curiosity.id, to: "exile", reason: "exile" }, { do: "move", what: stale.curiosity.id, to: "graveyard", reason: "resolve" }], "resolve");
 passBoth(stale.table); finish(stale.table);
 assert.equal(stale.curiosity.zone, "graveyard"); assert.equal(stale.table.notes.length, 0, "a changed graveyard incarnation receives neither return nor label");

 // A pending entry copy keeps the physical move and characteristic effect together.
 const table = start(standard, [{ deck: alpha(deck("Dimir Excruciator")) }, { deck: alpha(deck("Izzet Aggro")) }], "entry-effect-copy");
 const spider = place(table, 0, "graveyard", "Superior Spider-Man")[0]!, demon = place(table, 0, "graveyard", "Doomsday Excruciator")[0]!;
 prepare(table, spider.card!); prepare(table, demon.card!); main(table, 0);
 const initial = structuredClone(table);
 const changes = beforeEntry(table, [
  { do: "note", note: { kind: "label", on: { id: spider.id, incarnation: spider.incarnation + 1 }, by: 0, until: "indefinite", text: "Entry characteristic fixture", change: { types: { set: ["enchantment"] } } } },
  { do: "move", what: spider.id, to: "battlefield", registers: pack(spider.card!), reason: "resolve" },
 ], "resolve");
 assert.deepEqual(table, initial, "listing the future entry effect is pure");
 commit(table, changes, "resolve"); assert.equal(table.notes.length, 0); assert.equal(spider.zone, "graveyard");
 const pending = structuredClone(table), at = table.ledger.length;
 apply(table, nextDecision(table)!.options.find(one => one.id.endsWith(`copy:${demon.id}@${demon.incarnation}`))!.id, "model", "chosen");
 apply(table, "entry:finish", "engine", "forced");
 assert.deepEqual(characteristics(table, spider)!.types, ["enchantment"]);
 assert.deepEqual(characteristics(table, spider)!.subtypes, []);
 assert.equal(table.waiting.length, 1, "only the linked exile triggers; this copy was not cast");
 assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
});
