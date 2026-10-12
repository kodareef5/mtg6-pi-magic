/** An entry copy is present for entry replacements and triggers, then ends on a zone change.
 * Past 150 lines to extend that invariant with graveyard sources and linked triggers. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { tokenCopy } from "../src/core/copies.ts";
import { beforeEntry } from "../src/core/entry-payments.ts";
import { activatedUses } from "../src/core/activated.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import type { Table, Thing } from "../src/core/table.ts";
import type { Procedure, Registration } from "../src/core/language.ts";
import { printedCast, checkReferences } from "../src/core/procedures.ts";
import { cardsIn } from "../src/core/table.ts";
import { registrationProblems } from "../src/context/strategy.ts";
import { announce, establish, example, finish, main, pack, passBoth, place, step } from "./play.ts";

const setup = () => start(standard, [{ deck: alpha(deck("Izzet Aggro")) }, { deck: deck("Mono-Green Landfall") }], "entry-copies");
const prepare = (table: Table, card: string, registers: Registration[], procedures: Procedure[] = [], seat = 0) =>
 editWork(table, seat, [{ do: "package.put", package: { card, registers, procedures } }], `prepare-${seat}-${card}`);
const cast = (table: Table, x: number) => {
 prepare(table, "Mockingbird", pack("Mockingbird"));
 main(table, 0); commit(table, [{ do: "add-mana", who: 0, colors: Array(x + 1).fill("U") }], "game-setup");
 const before = structuredClone(table), at = table.ledger.length;
 announce(table, example("Cast Mockingbird for XU"), one => one.activation.x === x); passBoth(table);
 while (!table.entry) step(table);
 return { before, at };
};
const choose = (table: Table, source?: Thing) => {
 const decision = nextDecision(table)!;
 assert.equal(decision.situation, "replacement-order");
 const option = decision.options.find(one => source ? one.id.endsWith(`copy:${source.id}@${source.incarnation}`) : one.id.endsWith("copy:decline"));
 assert.ok(option, "the named entry copy choice is offered"); apply(table, option.id, "model", "chosen");
 const pending = structuredClone(table), at = table.ledger.length;
 while (table.entry && !nextDecision(table)?.blocked) {
  const next = nextDecision(table)!; assert.equal(next.options.length, 1); apply(table, next.options[0]!.id, "engine", "forced");
 }
 if (!table.entry) finish(table);
 return { pending, at };
};

test("entry copies use actual cast mana and copiable terms, apply before entry, and preserve replay and visibility", () => {
 const table = setup(), hydra = establish(table, 1, "Mossborn Hydra"), explorer = establish(table, 1, "Icetill Explorer");
 prepare(table, "Mossborn Hydra", pack("Mossborn Hydra"), [], 1);
 const bird = place(table, 0, "hand", "Mockingbird")[0]!;
 commit(table, [{ do: "counters", what: hydra.id, kind: "+1/+1", amount: 4 }, { do: "tap", what: hydra.id },
  { do: "note", note: { kind: "label", on: { id: hydra.id, incarnation: hydra.incarnation }, by: 1, until: "indefinite", text: "Temporary boost", change: { power: 7, toughness: 7 } } }], "game-setup");
 const start = cast(table, 2), offered = nextDecision(table)!;
 assert.ok(offered.options.some(one => one.objects?.some(ref => ref.id === hydra.id)), "X=2 spends three mana and can copy a three-mana Hydra");
 assert.ok(!offered.options.some(one => one.objects?.some(ref => ref.id === explorer.id)), "four mana exceeds the actual three spent");
 const pure = structuredClone(table); nextDecision(table); assert.deepEqual(table, pure);
 assert.equal(bird.zone, "stack", "the replacement choice precedes entry");
 const middle = choose(table, hydra), traits = characteristics(table, bird)!;
 assert.equal(bird.card, "Mockingbird"); assert.equal(traits.name, "Mossborn Hydra");
 assert.equal(traits.power, 1); assert.equal(bird.counters["+1/+1"], 1); assert.equal(bird.tapped, false);
 assert.equal(traits.manaValue, 3); assert.deepEqual(traits.colors, ["G"]);
 assert.ok(traits.subtypes.includes("Bird")); assert.ok(traits.words.includes("flying")); assert.ok(traits.words.includes("trample"));
 for (const viewer of [0, 1, "spectator"] as const) assert.equal(project(table, viewer).objects!.find(one => one.id === bird.id)!.traits!.name, "Mossborn Hydra");
 assert.deepEqual(relive(start.before, table.ledger.slice(start.at)), table);
 assert.deepEqual(relive(middle.pending, table.ledger.slice(middle.at)), table, "a clone after the copy choice applies it once");
 const copied = tokenCopy(table, bird); assert.ok("spec" in copied); assert.ok(copied.spec.words?.includes("flying"));
 assert.ok(copied.spec.subtypes?.includes("Bird"));
 commit(table, [{ do: "move", what: hydra.id, to: "graveyard", reason: "destroy" }], "resolve");
 assert.equal(characteristics(table, bird)!.power, 1, "the chosen copy survives its source leaving");
 commit(table, [{ do: "move", what: bird.id, to: "hand", reason: "resolve" }], "resolve");
 assert.equal(bird.copied, undefined); assert.equal(characteristics(table, bird)!.name, "Mockingbird");

 const declined = setup(), ordinary = place(declined, 0, "hand", "Mockingbird")[0]!;
 cast(declined, 0); choose(declined);
 assert.equal(ordinary.copied, undefined); assert.equal(characteristics(declined, ordinary)!.power, 1);
 assert.ok(characteristics(declined, ordinary)!.words.includes("flying"));

 const uncast = setup(), free = place(uncast, 0, "hand", "Mockingbird")[0]!;
 establish(uncast, 1, "Mossborn Hydra"); main(uncast, 0);
 commit(uncast, beforeEntry(uncast, [{ do: "move", what: free.id, to: "battlefield", reason: "resolve", registers: pack("Mockingbird") }], "resolve"), "resolve");
 assert.deepEqual(nextDecision(uncast)!.options.map(one => one.id), ["entry:0:copy:decline"], "a noncast entry has no mana spent");
 choose(uncast); assert.equal(free.copied, undefined);

 const animated = setup(), land = establish(animated, 0, "Soulstone Sanctuary", []), landBird = place(animated, 0, "hand", "Mockingbird")[0]!;
 const animate = example("Animate Soulstone Sanctuary"); prepare(animated, "Soulstone Sanctuary", [], [animate]);
 commit(animated, [{ do: "note", note: { kind: "label", on: { id: land.id, incarnation: land.incarnation }, by: 0, until: "indefinite", text: "Animated Sanctuary",
  change: { types: { add: ["creature"] }, base: { power: 3, toughness: 3 }, words: ["vigilance"] } } }], "game-setup");
 cast(animated, 0); choose(animated, land);
 const landTraits = characteristics(animated, landBird)!;
 assert.deepEqual(landTraits.types, ["land"]); assert.equal(landTraits.power, undefined);
 assert.ok(!landTraits.subtypes.includes("Bird")); assert.ok(landTraits.words.includes("flying")); assert.ok(!landTraits.words.includes("vigilance"));
 assert.ok(activatedUses(workFrame(animated, 0)).some(one => one.procedure.source.refs?.[0]?.id === landBird.id), "the copy carries complete battlefield activations");

 const payment = setup(), vents = establish(payment, 0, "Steam Vents"), paidBird = place(payment, 0, "hand", "Mockingbird")[0]!;
 prepare(payment, "Steam Vents", pack("Steam Vents"));
 commit(payment, [{ do: "note", note: { kind: "label", on: { id: vents.id, incarnation: vents.incarnation }, by: 0, until: "indefinite", text: "Animated land fixture",
  change: { types: { add: ["creature"] }, base: { power: 3, toughness: 3 } } } }], "game-setup");
 const paymentStart = cast(payment, 0), life = payment.seats[0]!.life;
 apply(payment, nextDecision(payment)!.options.find(one => one.id.endsWith(`copy:${vents.id}@${vents.incarnation}`))!.id, "model", "chosen");
 assert.equal(paidBird.zone, "stack"); assert.equal(payment.seats[0]!.life, life, "copying has not paid or entered yet");
 const tax = nextDecision(payment)!;
 assert.equal(tax.options.length, 2); apply(payment, tax.options.find(one => one.id.endsWith(":pay"))!.id, "model", "chosen");
 finish(payment); assert.equal(paidBird.tapped, false); assert.equal(payment.seats[0]!.life, life - 2);
 assert.deepEqual(relive(paymentStart.before, payment.ledger.slice(paymentStart.at)), payment, "the copied entry payment survives replay");

 const faced = setup(), viper = establish(faced, 0, "Scalding Viper // Steam Clean"), viperBird = place(faced, 0, "hand", "Mockingbird")[0]!;
 prepare(faced, "Scalding Viper // Steam Clean", pack("Scalding Viper // Steam Clean"));
 cast(faced, 1); choose(faced, viper);
 const viperTraits = characteristics(faced, viperBird)!;
 assert.equal(viperTraits.name, "Scalding Viper"); assert.equal(viperTraits.manaValue, 2);
 assert.ok(viperTraits.registrations.some(one => one.kind === "watch" && one.face === undefined), "the copied front watch belongs to the single-faced copy");
 const triggered = setup(), novaTerms = JSON.parse(readFileSync(new URL("../prepared/packages/2026-10-10/nova-hellkite.json", import.meta.url), "utf8")).package.registers as Registration[];
 const nova = establish(triggered, 0, "Nova Hellkite", novaTerms), target = establish(triggered, 1, "Mossborn Hydra");
 prepare(triggered, "Nova Hellkite", novaTerms);
 const novaBird = place(triggered, 0, "hand", "Mockingbird")[0]!;
 cast(triggered, 4); choose(triggered, nova);
 assert.equal(triggered.waiting.length, 1); assert.equal(triggered.waiting[0]!.source?.id, novaBird.id, "the copied entry ability sees its own entry");
 const trigger = nextDecision(triggered)!; assert.equal(trigger.situation, "trigger-order");
 apply(triggered, trigger.options[0]!.id, "model", "chosen"); passBoth(triggered); step(triggered);
 assert.equal(target.damage, 1, "the copied trigger executes with its new source");

 const blocked = setup(), incomplete = establish(blocked, 0, "Soulstone Sanctuary", []);
 prepare(blocked, "Soulstone Sanctuary", []);
 commit(blocked, [{ do: "note", note: { kind: "label", on: { id: incomplete.id, incarnation: incomplete.incarnation }, by: 0, until: "indefinite", text: "Animated Sanctuary",
  change: { types: { add: ["creature"] }, base: { power: 3, toughness: 3 } } } }], "game-setup");
 const blockedBird = place(blocked, 0, "hand", "Mockingbird")[0]!;
 cast(blocked, 0);
 editWork(blocked, 0, [{ do: "package.put", package: { card: "Soulstone Sanctuary", registers: [], deferred: [
  { claim: animate.claim, basis: animate.basis, timing: "stack", source: animate.source },
 ] } }], "defer-animation");
 const needed = nextDecision(blocked)!, waiting = structuredClone(blocked), row = blocked.ledger.length, work = blocked.workLog.length;
 assert.equal(needed.blocked, undefined); assert.equal(needed.preparation?.[0]?.card, "Soulstone Sanctuary");
 assert.deepEqual(needed.options, []);
 assert.equal(blockedBird.zone, "stack"); assert.equal(blockedBird.copied, undefined, "preparation moves nothing and cannot create an incomplete copy");
 assert.throws(() => apply(blocked, "entry:finish", "engine", "forced"), /Prepare the known uses/);
 editWork(blocked, 0, [{ do: "package.put", package: { card: "Soulstone Sanctuary", registers: [], procedures: [animate], deferred: [] } }], "complete-animation");
 choose(blocked, incomplete);
 assert.ok(activatedUses(workFrame(blocked, 0)).some(one => one.procedure.source.refs?.[0]?.id === blockedBird.id));
 assert.deepEqual(relive(waiting, blocked.ledger.slice(row), blocked.workLog.slice(work)), blocked);
 graveyardCopies();
});

function spiderPosition(other = "Mono-Green Landfall", copied = "Doomsday Excruciator", owner = 0) {
 const table = start(standard, [{ deck: alpha(deck("Dimir Excruciator")) }, { deck: deck(other) }], "graveyard-copy");
 const spider = place(table, 0, "hand", "Superior Spider-Man")[0]!;
 const source = place(table, owner, "graveyard", copied)[0]!;
 prepare(table, "Superior Spider-Man", pack("Superior Spider-Man"));
 prepare(table, copied, pack(copied), [], owner);
 main(table, 0); commit(table, [{ do: "add-mana", who: 0, colors: ["U", "B", "C", "C"] }], "game-setup");
 return { table, spider, source };
}
function castSpider(table: Table) {
 announce(table, printedCast("Superior Spider-Man", table.printed["Superior Spider-Man"]!)); passBoth(table);
 while (!table.entry) step(table);
}
function graveyardCopies() {
 assert.deepEqual(registrationProblems([{ card: "Superior Spider-Man", registers: pack("Superior Spider-Man") }]), []);
 for (const exileFirst of [false, true]) {
  const { table, spider, source } = spiderPosition(), start = structuredClone(table), from = table.ledger.length;
  castSpider(table); const middle = choose(table, source), traits = characteristics(table, spider)!;
  assert.equal(traits.name, "Superior Spider-Man"); assert.equal(traits.power, 4); assert.equal(traits.toughness, 4);
  assert.equal(traits.manaValue, 6); assert.deepEqual(traits.colors, ["B"]); assert.deepEqual(traits.supertypes, []);
  assert.deepEqual([...traits.subtypes].sort(), ["Demon", "Hero", "Human", "Spider"]); assert.ok(traits.words.includes("flying"));
  assert.equal(source.zone, "graveyard"); assert.equal(table.waiting.length, 2, "copied entry and linked copy trigger coexist");
  const copy = table.waiting.find(one => one.id.includes("entry-copy"))!, enters = table.waiting.find(one => one !== copy)!;
  const order = exileFirst ? [enters, copy] : [copy, enters];
  for (const trigger of order) apply(table, nextDecision(table)!.options.find(one => one.trigger?.id === trigger.id)!.id, "model", "chosen");
  const pending = structuredClone(table), at = table.ledger.length;
  passBoth(table); finish(table);
  assert.equal(source.zone, exileFirst ? "exile" : "graveyard", "the selected card moves only when its linked trigger resolves");
  if (!exileFirst) for (const seat of [0, 1]) assert.equal(cardsIn(table, "library", seat).length, 6, "the copy was cast and its copied entry ability resolves");
  passBoth(table); finish(table);
  assert.equal(source.zone, "exile"); for (const seat of [0, 1]) assert.equal(cardsIn(table, "library", seat).length, 6);
  assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
  assert.deepEqual(relive(middle.pending, table.ledger.slice(middle.at)), table);
  assert.deepEqual(relive(start, table.ledger.slice(from)), table);
  for (const viewer of [0, 1, "spectator"] as const) assert.equal(project(table, viewer).objects!.find(one => one.id === spider.id)!.traits!.power, 4);
 }
 const { table: hydra, spider, source } = spiderPosition("Mono-Green Landfall", "Mossborn Hydra", 1);
 castSpider(hydra); choose(hydra, source);
 assert.equal(characteristics(hydra, spider)!.power, 5, "fixed 4/4 base precedes the copied Hydra entry counter");
 const copied = tokenCopy(hydra, spider); assert.ok("spec" in copied);
 assert.equal(copied.spec.name, "Superior Spider-Man"); assert.equal(copied.spec.power, 4, "later copies copy the exception, not the counter");
 apply(hydra, nextDecision(hydra)!.options[0]!.id, "model", "chosen");
 commit(hydra, [{ do: "move", what: source.id, to: "exile", reason: "exile" }, { do: "move", what: source.id, to: "graveyard", reason: "resolve" }], "resolve");
 const returned = source.incarnation; passBoth(hydra); finish(hydra);
 assert.equal(source.zone, "graveyard"); assert.equal(source.incarnation, returned, "the linked trigger cannot exile a new incarnation");
 commit(hydra, [{ do: "move", what: spider.id, to: "hand", reason: "bounce" }], "resolve");
 assert.equal(spider.copied, undefined); assert.equal(characteristics(hydra, spider)!.manaValue, 4);

 const declined = spiderPosition(); castSpider(declined.table); choose(declined.table);
 assert.equal(declined.table.waiting.length, 0); assert.equal(declined.source.zone, "graveyard");
 assert.ok(characteristics(declined.table, declined.spider)!.supertypes.includes("legendary"));

 // Copying a card with another copy replacement tests 707.9g, including declining the later choice.
 for (const laterCopy of [false, true]) {
  const { table, spider, source } = spiderPosition("Izzet Aggro", "Mockingbird", 1);
  const deceit = establish(table, 0, "Deceit", pack("Deceit")); prepare(table, "Deceit", pack("Deceit"));
  const stallionTerms = JSON.parse(readFileSync(new URL("../prepared/packages/2026-10-10/colorstorm-stallion.json", import.meta.url), "utf8")).package.registers as Registration[];
  const stallion = establish(table, 1, "Colorstorm Stallion", stallionTerms); prepare(table, "Colorstorm Stallion", stallionTerms, [], 1);
  castSpider(table);
  apply(table, nextDecision(table)!.options.find(one => one.id.endsWith(`copy:${source.id}@${source.incarnation}`))!.id, "model", "chosen");
  // Deceit costs six and cannot be copied with four mana spent; the entering copy itself is a nonbattlefield object.
  assert.ok(!nextDecision(table)!.options.some(one => one.objects?.some(ref => ref.id === deceit.id)));
  if (laterCopy) {
   choose(table, stallion);
   assert.equal(table.waiting.length, 0, "the later copy suppresses linked exile, and a copy choice does not trigger ward");
   assert.equal(characteristics(table, spider)!.name, "Colorstorm Stallion");
   assert.equal(characteristics(table, spider)!.power, 3); assert.ok(!characteristics(table, spider)!.subtypes.includes("Spider"));
  } else {
   choose(table); assert.equal(table.waiting.length, 1);
   apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table); finish(table);
  }
  assert.equal(source.zone, laterCopy ? "graveyard" : "exile");
 }
 const entry = structuredClone(pack("Superior Spider-Man"));
 if (entry[0]!.kind !== "enters") assert.fail(); entry[0]!.copy!.of = { zones: ["library"], types: ["creature"] };
 assert.throws(() => checkReferences(entry), /public battlefield/);
 assert.match(registrationProblems([{ card: "Superior Spider-Man", registers: entry }])[0]!, /public battlefield/);
}
