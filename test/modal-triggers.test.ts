/** Mode and cast ordinal are fixed before responses; every mode owns its target and binding scope. */
import assert from "node:assert/strict";
import test from "node:test";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn } from "../src/core/table.ts";
import { editWork } from "../src/core/work-tools.ts";
import { checkReferences, printedCast } from "../src/core/procedures.ts";
import { announce, establish, example, finish, main, pack, passBoth, place, step } from "./play.ts";

test("a numbered cast makes one modal trigger, fixes its mode before responses and retains it through replay", () => {
	for (const mode of [0, 1]) {
		const game = start(standard, [{ deck: alpha(deck("Azorius Momo")) }, { deck: deck("Mono-Green Landfall") }], `modal-${mode}`);
		const [zenith] = place(game, 0, "hand", "Cosmogrand Zenith");
		place(game, 0, "hand", "Springleaf Drum", "Springleaf Drum", "Erode");
		const companion = establish(game, 0, "Momo, Friendly Flier"); main(game, 0);
		const registers = pack(zenith!.card!);
		editWork(game, 0, [{ do: "package.put", package: { card: zenith!.card!, registers } }], "prepare-zenith");
		commit(game, [{ do: "add-mana", who: 0, colors: ["C", "C", "W"] }], "game-setup");
		const castDrum = () => announce(game, printedCast("Springleaf Drum", game.printed["Springleaf Drum"]!), one =>
			one.activation.paid.every(id => game.seats[0]!.pool.find(mana => mana.id === id)?.color === "C"));
		castDrum(); passBoth(game); finish(game);
		commit(game, [{ do: "move", what: zenith!.id, to: "battlefield", registers, reason: "game-setup" }], "game-setup");
		const initial = structuredClone(game), from = game.ledger.length;
		castDrum();
		assert.equal(game.waiting.length, 1, "casts before the watcher entered still count");
		const waiting = structuredClone(game), at = game.ledger.length;
		const decision = nextDecision(game)!; assert.equal(decision.situation, "trigger-order"); assert.equal(decision.options.length, 2);
		assert.deepEqual(game, waiting, "listing modes moves nothing");
		// Adversarial structured terms exercise target availability, without claiming these are Zenith's printed modes.
		const unavailable = structuredClone(game);
		const noTarget = { targets: [{ object: { types: ["planeswalker"] } }], instructions: [] };
		unavailable.waiting[0]!.effect = { modes: [noTarget, { instructions: [] }] };
		assert.deepEqual(nextDecision(unavailable)!.options.map(one => one.id.split(":mode:")[1]), ["1"], "an unavailable mode does not remove a legal one");
		unavailable.waiting[0]!.effect = { modes: [noTarget, noTarget] };
		const remove = nextDecision(unavailable)!;
		assert.equal(remove.options.length, 1); assert.ok(remove.options[0]!.id.endsWith(":removed"));
		apply(unavailable, remove.options[0]!.id, "engine", "forced");
		assert.equal(unavailable.waiting.length, 0); assert.equal(cardsIn(unavailable, "stack").length, 1, "an ability with no legal mode is removed");
		apply(game, decision.options.find(one => one.id.endsWith(`:mode:${mode}`))!.id, "model", "chosen");
		assert.equal(game.waiting.length, 0); assert.equal(cardsIn(game, "stack").length, 2);
		const ability = cardsIn(game, "stack").find(one => one.ability?.trigger)!.ability!;
		assert.equal(ability.instructions[0]!.do, mode === 0 ? "token" : "counters");
		const pending = structuredClone(game), since = game.ledger.length;
		announce(game, example("Erode with its controller's optional search"), one => one.activation.targets[0]!.some(target => "id" in target && target.id === zenith!.id));
		assert.equal(game.waiting.length, 0, "the third spell creates no second-spell trigger");
		passBoth(game); step(game); step(game, label => label.startsWith("Decline")); finish(game);
		passBoth(game); finish(game);
		assert.equal(cardsIn(game, "battlefield").filter(one => one.token?.name === "Human Soldier Token").length, mode === 0 ? 2 : 0);
		assert.equal(companion.counters["+1/+1"] ?? 0, mode === 0 ? 0 : 1, "the selected mode still resolves after a third spell and source departure");
		passBoth(game); finish(game);
		assert.deepEqual(relive(initial, game.ledger.slice(from)), game);
		assert.deepEqual(relive(waiting, game.ledger.slice(at)), game);
		assert.deepEqual(relive(pending, game.ledger.slice(since)), game);
	}
	const first = { targets: [{ object: { types: ["creature"] } }], instructions: [{ do: "damage", to: "target:0", amount: 1 }] };
	assert.doesNotThrow(() => checkReferences({ effect: { modes: [first, { instructions: [{ do: "draw", who: "you", count: 1 }] }] } }));
	assert.throws(() => checkReferences({ effect: { modes: [first, { instructions: [{ do: "damage", to: "target:0", amount: 1 }] }] } }), /target:0 names a target slot/,
		"a mode cannot borrow another mode's target slot");
	assert.throws(() => checkReferences({ effect: { modes: [
		{ instructions: [{ do: "choose", who: "you", from: { zones: ["hand"], owner: "you" }, count: 1, as: "card" }] },
		{ instructions: [{ do: "move", what: "bound:card", to: "graveyard", reason: "discard" }] },
	] } }), /bound:card is used before/, "a mode cannot borrow another mode's private binding");
});
