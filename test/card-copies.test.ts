/** Copy exceptions and complete public-card meaning survive entry and saved continuations.
 * Past 150 lines to keep Ardyn's entry, activation, privacy and failed-target positions in one invariant. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { characteristics, sick } from "../src/core/characteristics.ts";
import { tokenCopy } from "../src/core/copies.ts";
import { activatedUses } from "../src/core/activated.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { interpret } from "../src/context/interpret.ts";
import { universe } from "../tools/matchup-fixture.ts";
import type { Package } from "../src/core/language.ts";
import { announce, example, finish, main, pack, passBoth, place, quiet, step } from "./play.ts";

const ardyn = "Ardyn, the Usurper", overlord = "Overlord of the Balemurk", hydra = "Mossborn Hydra", speaker = "Formidable Speaker";
const prepare = (table: Table, card: string, seat = 0) => editWork(table, seat, [{ do: "package.put", package: {
	card, registers: pack(card), procedures: [], printedCast: true, assessed: true,
} }], `prepare-${seat}-${card}`);
const checkpoint = (table: Table) => ({ table: structuredClone(table), row: table.ledger.length, work: table.workLog.length });
const replays = (table: Table, point: ReturnType<typeof checkpoint>) =>
	assert.deepEqual(relive(point.table, table.ledger.slice(point.row), table.workLog.slice(point.work)), table);
function combat(table: Table) {
	for (let guard = 0; guard < 100; guard++) {
		const decision = nextDecision(table);
		if (decision?.situation === "trigger-order" && table.cursor.steps[0] === "begin-combat") return decision;
		if (decision) apply(table, quiet(decision.options).id, "model", "chosen"); else advance(table);
	}
	throw new Error("Ardyn's combat trigger was not offered");
}
function cast(table: Table) {
	main(table, 0); prepare(table, ardyn);
	if (!cardsIn(table, "hand", 0).some(one => one.card === ardyn)) place(table, 0, "hand", ardyn);
	commit(table, [{ do: "add-mana", who: 0, colors: Array(8).fill("B") }], "game-setup");
	const before = checkpoint(table), choice = announce(table, printedCast(ardyn, table.printed[ardyn]!));
	passBoth(table); finish(table); replays(table, before);
	return table.things.get(choice.activation.source.id)!;
}

test("Ardyn copies an exiled card's complete meaning and fixed exceptions, preparing public activations before entry", async () => {
	for (const name of [overlord, hydra, speaker]) {
		const owner = name === overlord ? 0 : 1;
		const table = start(standard, [{ deck: alpha(deck("4c Reanimator")) }, { deck: name === hydra ? deck("Mono-Green Landfall") : alpha(deck("4c Reanimator")) }], `ardyn-${name}`);
		const original = place(table, owner, "graveyard", name)[0]!;
		if (name === speaker) {
			const stored = JSON.parse(readFileSync(new URL("../prepared/packages/2026-10-10/formidable-speaker.json", import.meta.url), "utf8")).package as Package;
			editWork(table, owner, [{ do: "package.put", package: stored }], "deferred-speaker");
		} else prepare(table, name, owner);
		const lord = cast(table), before = checkpoint(table), trigger = combat(table);
		const selected = trigger.options.find(one => one.trigger?.targets.some(target => "id" in target && target.id === original.id)); assert.ok(selected);
		apply(table, selected.id, "model", "chosen"); passBoth(table);
		const incarnation = original.incarnation; step(table);
		assert.equal(original.zone, "exile"); assert.equal(original.incarnation, incarnation + 1);
		assert.equal(cardsIn(table, "battlefield").filter(one => one.token).length, 0, "exile precedes token creation");
		const exiled = checkpoint(table), pure = structuredClone(table), decision = nextDecision(table)!;
		assert.deepEqual(table, pure, "copy discovery is pure");
		if (name === speaker) {
			assert.equal(decision.seat, owner); assert.equal(decision.blocked, undefined); assert.equal(decision.options.length, 0);
			assert.equal(decision.preparation?.[0]?.card, speaker);
			assert.throws(() => apply(table, "pass", "model", "fallback"), /Prepare the known uses/);
			const procedure = example("Untap another permanent with Formidable Speaker");
			const frame = { ...workFrame(table, owner), decision };
			const prepared = await interpret(frame, { work: async (_about, _prompt, tools) => {
				assert.equal(tools.submit.check({ procedures: [{ use: 0, cost: procedure.cost, targets: procedure.targets, instructions: procedure.instructions }], unsupported: [] }), null); return {};
			} }, universe);
			editWork(table, owner, [{ do: "package.put", package: prepared }], "interpreted-speaker");
			assert.deepEqual(table.things, pure.things); assert.equal(table.cursor.clock, pure.cursor.clock);
			assert.equal(nextDecision(table)!.seat, 0, "the resolving controller resumes after equipment preparation");
			assert.equal(project(table, 0).work?.packages?.some(one => one.card === speaker), false, "the opponent's private package is not copied into this seat's equipment");
		}
		step(table);
		const child = cardsIn(table, "battlefield", 0).find(one => one.token?.name === name)!; assert.ok(child);
		const body = characteristics(table, child)!;
		assert.equal(child.owner, 0); assert.equal(child.controller, 0); assert.equal(body.name, name);
		assert.equal(body.power, name === hydra ? 6 : 5); assert.equal(body.toughness, name === hydra ? 6 : 5);
		assert.deepEqual(body.colors, ["B"]); assert.deepEqual(body.subtypes, ["Demon"]);
		assert.equal(body.manaValue, name === overlord ? 5 : 3);
		assert.equal(body.types.includes("enchantment"), name === overlord); assert.equal(child.counters.time ?? 0, 0);
		assert.equal(sick(table, child), false, "Ardyn grants haste to the new Demon");
		for (const word of ["menace", "lifelink", "haste"]) assert.ok(body.words.includes(word));
		for (const viewer of [0, 1, "spectator"] as const) assert.deepEqual(project(table, viewer).objects!.find(one => one.id === child.id)!.traits, body);
		const copied = tokenCopy(table, child); assert.ok("spec" in copied);
		assert.equal(copied.spec.power, 5); assert.deepEqual(copied.spec.colors, ["B"]); assert.deepEqual(copied.spec.subtypes, ["Demon"]);
		assert.ok(!copied.spec.words?.includes("haste"), "Ardyn's granted words are not copiable");
		finish(table);
		if (name !== hydra) {
			assert.equal(table.waiting.length, 1, "the copied entry ability remains intact");
			apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
			if (name === overlord) { const count = cardsIn(table, "graveyard", 0).length; step(table); assert.equal(cardsIn(table, "graveyard", 0).length, count + 4); }
			step(table, label => label.startsWith("Decline") || label === "Nothing can be chosen"); finish(table);
		}
		replays(table, exiled); replays(table, before);
		if (name === hydra) {
			const attacking = checkpoint(table), life = table.seats[0]!.life, opposing = table.seats[1]!.life;
			for (let guard = 0; guard < 100; guard++) {
				const decision = nextDecision(table);
				if (decision?.options.some(one => one.id === "attack:done")) break;
				if (decision) apply(table, quiet(decision.options).id, "model", "chosen"); else advance(table);
			}
			const attack = nextDecision(table)!.options.find(one => one.id.startsWith("attack:") && one.objects?.some(one => one.id === child.id)); assert.ok(attack);
			apply(table, attack.id, "model", "chosen"); apply(table, "attack:done", "model", "chosen");
			main(table, 0, 1, "postcombat-main");
			assert.equal(table.seats[1]!.life, opposing - 6); assert.equal(table.seats[0]!.life, life + 6, "the hasty Demon deals combat damage with lifelink");
			replays(table, attacking);
		}
		if (name === speaker) {
			commit(table, [{ do: "tap", what: lord.id }, { do: "add-mana", who: 0, colors: ["C"] }], "resolve");
			const available = activatedUses(workFrame(table, 0)).find(one => one.procedure.source.refs?.[0]?.id === child.id); assert.ok(available);
			const pending = checkpoint(table);
			announce(table, available.procedure, one => one.activation.targets.flat().some(one => "id" in one && one.id === lord.id));
			assert.equal(child.tapped, true); passBoth(table); finish(table); assert.equal(lord.tapped, false);
			replays(table, pending);
		}
		commit(table, [{ do: "move", what: lord.id, to: "graveyard", reason: "destroy" }, { do: "move", what: original.id, to: "hand", reason: "resolve" }], "resolve");
		assert.deepEqual(tokenCopy(table, child), copied, "the copy retains its base after both external sources leave");
		for (const word of ["menace", "lifelink", "haste"]) assert.ok(!characteristics(table, child)!.words.includes(word));
	}
	for (const outcome of ["decline", "removed", "returned", "lord-left"] as const) {
		const table = start(standard, [{ deck: alpha(deck("4c Reanimator")) }, { deck: deck("Mono-Green Landfall") }], `ardyn-${outcome}`);
		const original = place(table, 1, "graveyard", hydra)[0]!; prepare(table, hydra, 1);
		const lord = cast(table), trigger = combat(table);
		const option = trigger.options.find(one => outcome === "decline" ? one.trigger?.targets.length === 0 : one.trigger?.targets.some(one => "id" in one && one.id === original.id)); assert.ok(option);
		apply(table, option.id, "model", "chosen");
		if (outcome === "removed" || outcome === "returned") {
			commit(table, [{ do: "move", what: original.id, to: "exile", reason: "resolve" }], "resolve");
			if (outcome === "returned") commit(table, [{ do: "move", what: original.id, to: "graveyard", reason: "resolve" }], "resolve");
		}
		if (outcome === "lord-left") commit(table, [{ do: "move", what: lord.id, to: "graveyard", reason: "destroy" }], "resolve");
		const pending = checkpoint(table); passBoth(table); finish(table);
		const tokens = cardsIn(table, "battlefield").filter(one => one.token);
		assert.equal(tokens.length, outcome === "lord-left" ? 1 : 0);
		if (outcome === "lord-left") assert.ok(!characteristics(table, tokens[0]!)!.words.includes("haste"));
		replays(table, pending);
	}
	const publicOnly = start(standard, [{ deck: alpha(deck("4c Reanimator")) }, { deck: deck("Mono-Green Landfall") }], "copy-public-only");
	prepare(publicOnly, ardyn);
	const legend = place(publicOnly, 0, "exile", ardyn)[0]!;
	const copied = tokenCopy(publicOnly, legend, { power: 5, toughness: 5, colors: ["B"], creatureTypes: ["Demon"] });
	assert.ok("spec" in copied); assert.deepEqual(copied.spec.supertypes, ["legendary"]);
	assert.ok("blocked" in tokenCopy(publicOnly, { ...legend, faceDown: true }));
	assert.ok("blocked" in tokenCopy(publicOnly, { ...legend, zone: "hand" }));
	assert.ok("blocked" in tokenCopy(publicOnly, legend, { creatureTypes: ["Not a creature type"] }));
});
