/** Countering records the consumed stack object, and source-bound ability loss
 * affects native and granted uses without following a different incarnation.
 * Past 150 lines to keep the source lifetime and payment branches in one invariant. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { characteristics, intrinsic } from "../src/core/characteristics.ts";
import { checkReferences, printedCast, procedureOptions, activationChanges } from "../src/core/procedures.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { preparation } from "../src/core/readiness.ts";
import { activatedUses } from "../src/core/activated.ts";
import { matches, objects, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import type { Procedure, Registration } from "../src/core/language.ts";
import { announce, example, finish, main, pack, passBoth, place, step } from "./play.ts";

const native = () => example("Kellan becomes a Detective");
const prepareTide = (table: Table) => editWork(table, 0, [{ do: "package.put", package: {
 card: "Tishana's Tidebinder", registers: pack("Tishana's Tidebinder"), procedures: [], printedCast: true,
} }], "prepare-tidebinder");
function position(triggered = false) {
 const table = start(standard, [{ deck: alpha(deck("Dimir Midrange")) }, { deck: deck("Mono-Red Aggro") }], `ability-counter-${triggered}`);
 const kellan = place(table, 1, "battlefield", "Kellan, Planar Trailblazer")[0]!;
 const tide = place(table, 0, "hand", "Tishana's Tidebinder")[0]!;
 prepareTide(table);
 editWork(table, 1, [{ do: "package.put", package: { card: kellan.card!, registers: [], procedures: [native()] } }], "prepare-kellan");
 main(table, 1);
 commit(table, [{ do: "add-mana", who: 0, colors: ["U", "C", "C"] }, { do: "add-mana", who: 1, colors: ["R", "R", "R", "R", "C", "C", "C"] }], "game-setup");
 announce(table, native());
 if (triggered) {
  passBoth(table); finish(table);
  commit(table, [{ do: "damage", source: kellan.id, target: { player: 0 }, amount: 2, combat: true }], "combat");
  apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
 }
 const target = cardsIn(table, "stack")[0]!;
 // The target ability gives the opponent priority to cast the flash creature.
 if (nextDecision(table)!.seat !== 0) apply(table, "pass", "model", "chosen");
 announce(table, printedCast(tide.card!, table.printed[tide.card!]!)); passBoth(table); finish(table);
 return { table, kellan, tide, target };
}
const aimed = (table: Table, id: string) => nextDecision(table)!.options.find(one => one.trigger?.targets.some(target => "id" in target && target.id === id))!;

test("countered ability bindings preserve the source incarnation and ability-removal lifetime through replay", () => {
 assert.throws(() => checkReferences({ instructions: [{ do: "modify", what: "source:bound:missing", until: "indefinite", change: { loseAbilities: true } }] }), /before an instruction binds/);
 assert.throws(() => checkReferences({ instructions: [{ do: "counter", what: "source:target:1" }] }, 1), /target slot/);
 for (const triggered of [false, true]) for (const branch of ["counter", "decline", "departed-tide", "blinked-source", "gone-target"] as const) {
  const { table, kellan, tide, target } = position(triggered);
  const scope = { world: tableWorld(table), controller: 0 };
  assert.ok(matches(scope, target, { zones: ["stack"], ability: "any" }));
  assert.equal(matches(scope, target, { zones: ["stack"], ability: "triggered" }), triggered);
  assert.equal(matches(scope, target, { zones: ["stack"], ability: "activated" }), !triggered);
  assert.ok(!matches(scope, tide, { zones: ["battlefield"], ability: "any" }));
  if (branch === "departed-tide") commit(table, [{ do: "move", what: tide.id, to: "hand", reason: "bounce" }], "resolve");
  if (branch === "blinked-source") commit(table, [{ do: "move", what: kellan.id, to: "exile", reason: "exile" }, { do: "move", what: kellan.id, to: "battlefield", reason: "resolve" }], "resolve");
  const initial = structuredClone(table), from = table.ledger.length;
  const option = branch === "decline" ? nextDecision(table)!.options.find(one => one.trigger?.targets.length === 0)! : aimed(table, target.id);
  assert.ok(option); apply(table, option.id, "model", "chosen");
  if (branch === "gone-target") commit(table, [{ do: "cease", what: target.id }], "resolve");
  const pending = structuredClone(table), at = table.ledger.length;
  passBoth(table);
  if (branch !== "gone-target") {
   step(table);
   const countered = table.resolution!.bound.countered!;
   assert.deepEqual(countered.objects, branch === "decline" ? [] : [{ id: target.id, incarnation: target.incarnation }]);
   assert.equal(countered.amount, Number(branch !== "decline"));
   const source = objects({ world: tableWorld(table), controller: 0, bound: { countered } }, "source:bound:countered");
   assert.deepEqual(source.map(one => one.id), branch === "decline" || branch === "blinked-source" ? [] : [kellan.id]);
  }
  finish(table);
  const lost = branch === "counter";
  assert.equal(!!characteristics(table, kellan)!.lostAbilities, lost);
  assert.deepEqual(characteristics(table, kellan)!.types, ["creature"]);
  assert.equal(table.things.has(target.id), branch === "decline");
  for (const viewer of [0, 1, "spectator"] as const) {
   const view = project(table, viewer), world = viewWorld(view);
   assert.equal(!!world.read(world.objects.find(one => one.id === kellan.id)!)!.lostAbilities, lost);
  }
  assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
  if (branch !== "gone-target") assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
  if (!lost) continue;

  const frame = workFrame(table, 1);
  assert.equal(procedureOptions(native(), frame, "test").length, 0, "a prepared native activation is unavailable after ability loss");
  const beforeLoss = structuredClone(table);
  commit(beforeLoss, [{ do: "move", what: tide.id, to: "hand", reason: "bounce" }], "resolve");
  const old = procedureOptions(native(), workFrame(beforeLoss, 1), "test")[0]!.activation;
  assert.throws(() => activationChanges(table, old), /lost its prepared abilities/);
  const deferred = example("Kellan becomes a Rogue with double strike");
  editWork(table, 1, [{ do: "package.put", package: { card: kellan.card!, registers: [], procedures: [native()], deferred: [{
   claim: deferred.claim, basis: deferred.basis, source: deferred.source, timing: "stack",
  }] } }], "defer-removed-use");
  assert.equal(preparation(workFrame(table, 1)).length, 0, "an absent native ability needs no interpretation");
  const mountain = place(table, 1, "battlefield", "Mountain")[0]!;
  commit(table, [{ do: "note", note: { kind: "label", on: mountain, source: tide, by: 0, until: "while-source", text: "Ability-loss fixture", change: { loseAbilities: true } } }], "resolve");
  assert.deepEqual(intrinsic(characteristics(table, mountain)), [], "ability loss also removes intrinsic basic-land mana");
  // A later complete grant is still usable while the native inventory remains absent.
  commit(table, [{ do: "note", note: { kind: "label", on: kellan, by: 1, until: "end-of-turn", text: "Later ability grant", change: { registers: [{
   kind: "activated", basis: native().basis, cost: native().cost!, effect: { instructions: native().instructions },
  }] } } }], "resolve");
  const granted = activatedUses(workFrame(table, 1)).find(one => one.procedure.source.refs?.some(ref => ref.id === kellan.id))!;
  assert.ok(granted); const ways = procedureOptions(granted.procedure, workFrame(table, 1), "granted"); assert.ok(ways.length);
  assert.doesNotThrow(() => activationChanges(table, ways[0]!.activation));
  commit(table, [{ do: "move", what: tide.id, to: "hand", reason: "bounce" }], "resolve");
  assert.equal(characteristics(table, kellan)!.lostAbilities, undefined);
  assert.ok(procedureOptions(native(), workFrame(table, 1), "test").length);
  assert.equal(preparation(workFrame(table, 1)).length, 1);
  assert.deepEqual(intrinsic(characteristics(table, mountain)), ["R"]);
 }
 otherSourceTypes();
});

/** Each registered card supplies one quoted ability to isolate the source-type condition. */
function otherSourceTypes() {
 for (const kind of ["artifact", "planeswalker", "land", "enchantment"] as const) {
  const other = kind === "planeswalker" ? "Lifegain" : kind === "enchantment" ? "Mono-Black Aggro" : "Mono-Red Aggro";
  const card = kind === "artifact" ? "Ghost Vacuum" : kind === "planeswalker" ? "Ajani Resolute" : kind === "land" ? "Soulstone Sanctuary" : "Corpses of the Lost";
  const table = start(standard, [{ deck: alpha(deck("Dimir Midrange")) }, { deck: deck(other) }], `counter-source-${kind}`);
  const source = place(table, 1, "hand", card)[0]!, tide = place(table, 0, "hand", "Tishana's Tidebinder")[0]!;
  prepareTide(table); main(table, 1);
  const registers: Registration[] = kind === "enchantment" ? [{ kind: "watch",
   basis: "When this enchantment enters, create a 2/2 black Skeleton Pirate creature token.",
   event: { on: "enters", of: { is: "this" } }, effect: { instructions: [{ do: "token", count: 1, spec: { name: "Skeleton Pirate Token", types: ["creature"], subtypes: ["Skeleton", "Pirate"], colors: ["B"], power: 2, toughness: 2 } }] },
  }] : [];
  commit(table, [{ do: "move", what: source.id, to: "battlefield", registers, reason: "resolve" }], "resolve");
  commit(table, [{ do: "add-mana", who: 0, colors: ["U", "C", "C"] }, { do: "add-mana", who: 1, colors: Array(5).fill("C") }], "game-setup");
  if (kind === "enchantment") apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
  else {
   const use: Procedure = kind === "land" ? example("Animate Soulstone Sanctuary") : kind === "planeswalker" ? {
    source: { card, zones: ["battlefield"], controller: "self" }, claim: "Ajani gains life", basis: "0: You gain 1 life.", timing: "stack", cost: { loyalty: 0 }, instructions: [{ do: "life", who: "you", amount: 1 }],
   } : {
    source: { card, zones: ["battlefield"], controller: "self" }, claim: "Exile a graveyard card", basis: "{T}: Exile target card from a graveyard.", timing: "stack", cost: { tap: true },
    targets: [{ object: { zones: ["graveyard"] } }], instructions: [{ do: "move", what: "target:0", to: "exile", reason: "exile", link: true }],
   };
   if (kind === "artifact") place(table, 1, "graveyard", "Burst Lightning");
   announce(table, use);
  }
  const target = cardsIn(table, "stack")[0]!;
  apply(table, "pass", "model", "chosen");
  announce(table, printedCast(tide.card!, table.printed[tide.card!]!)); passBoth(table); finish(table);
  const pending = structuredClone(table), at = table.ledger.length;
  apply(table, aimed(table, target.id).id, "model", "chosen"); passBoth(table); finish(table);
  assert.equal(table.things.has(target.id), false);
  assert.deepEqual(characteristics(table, source)!.types, [kind]);
  assert.equal(!!characteristics(table, source)!.lostAbilities, kind === "artifact" || kind === "planeswalker");
  assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
 }
}
