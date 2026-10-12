/** Keyword completion follows private choices, retains actual results, and waits for priority. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Package } from "../src/core/language.ts";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn } from "../src/core/table.ts";
import { relive } from "../src/core/journal.ts";
import { project, describe } from "../src/core/view.ts";
import { libraryKeyword } from "../src/core/library-keywords.ts";
import { tableWorld } from "../src/core/selectors.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { main, place, announce, passBoth, step, finish, example, establish, quiet } from "./play.ts";

test("scry and surveil complete once after ordered private choices, with no event for zero and no early trigger resolution", () => {
	for (const name of ["scry", "surveil"] as const) for (const who of [0, 1]) for (const size of [0, 4]) for (const count of [0, 4]) {
		const table = start(standard, [{ deck: alpha(deck("Izzet Prowess")) }, { deck: alpha(deck("Mono-Red Aggro")) }], `keyword-${name}-${who}-${size}-${count}`);
		main(table, 0); place(table, 0, "hand", "Opt");
		establish(table, 0, "Island", [{ kind: "watch", basis: "Fixture keyword completion observer", event: { on: "keyword", keyword: name, by: who ? "opponent" : "you" },
			effect: { instructions: [{ do: "life", who: "event:player", amount: { event: "amount" } }] } }]);
		const seen = new Set<string>();
		const window = cardsIn(table, "library", who).filter(one => !seen.has(one.card!) && !!seen.add(one.card!)).slice(0, size);
		// Larger counts, another actor and the observer are mechanic fixtures, not claims about Opt or Island.
		commit(table, [...cardsIn(table, "library", who).filter(one => !window.includes(one)).map(one => ({ do: "move" as const, what: one.id, to: "outside" as const, reason: "game-setup" as const })),
			{ do: "add-mana", who: 0, colors: ["U"] }], "game-setup");
		const procedure = checkProcedure({ ...example("Cast Opt with recorded scry completion"), claim: "Keyword completion fixture", instructions: [
			{ do: "keyword", name, who: who ? "opponent" : "you", count, as: "away" }, { do: "life", who: "you", amount: { bound: "away" } },
		] });
		const initial = structuredClone(table), from = table.ledger.length, life = table.seats.map(one => one.life);
		const cast = announce(table, procedure); passBoth(table); step(table);
		if (count) step(table); // The private look, after beginning the keyword.
		const middle = structuredClone(table), at = table.ledger.length;
		const choose = (id: string) => {
			const before = structuredClone(table), decision = nextDecision(table)!;
			assert.deepEqual(table, before, "listing choices is pure"); assert.equal(decision.seat, who);
			const option = decision.options.find(one => one.id.endsWith(`:${id}`)); assert.ok(option, decision.question);
			apply(table, option.id, "model", "chosen");
		};
		const selected = count && size ? [window[1]!, window[0]!] : [];
		if (count) {
			for (const viewer of [0, 1, "spectator"] as const) for (const one of window) {
				assert.equal(project(table, viewer).objects!.find(object => object.id === one.id)?.card, viewer === who ? one.card : undefined);
			}
			if (size && name === "surveil") assert.match(nextDecision(table)!.question, /bottommost first/);
			for (const one of selected) choose(one.id);
			choose("done");
			if (name === "scry" && selected.length) for (const one of selected) choose(one.id);
			else step(table); // Surveil's simultaneous graveyard move, or an empty bottom subset.
			assert.equal(table.waiting.length, 0, "moving selected cards is not keyword completion");
			if (size) { choose(window[3]!.id); assert.equal(table.waiting.length, 0); choose(window[2]!.id); }
			else step(table);
			assert.equal(table.waiting.length, 1); assert.equal(nextDecision(table)!.situation, "resolution");
			const bound = table.resolution!.bound.away!;
			assert.equal(bound.amount, selected.length);
			assert.deepEqual(bound.objects.map(one => [one.id, one.incarnation]), selected.map(one => [one.id, one.incarnation]));
			if (size) {
				assert.deepEqual(cardsIn(table, "library", who).map(one => one.id), [window[3]!.id, window[2]!.id, ...(name === "scry" ? selected.map(one => one.id) : [])]);
				if (name === "surveil") {
					assert.deepEqual(cardsIn(table, "graveyard", who).map(one => one.id), [...selected].reverse().map(one => one.id));
					const movement = table.log.find(one => one.changes.some(change => change.do === "move" && change.what === selected[0]!.id && change.to === "graveyard"))!;
					assert.equal(movement.changes.filter(one => one.do === "move").length, 2);
					assert.ok(movement.changes.every(one => one.do !== "move" || one.reason === "resolve"));
				}
			}
		}
		step(table); finish(table);
		assert.equal(table.seats[0]!.life, life[0]! + selected.length);
		assert.equal(table.things.get(cast.activation.source.id)!.zone, "graveyard");
		const events = table.log.filter(one => one.changes.some(change => change.do === "keyword"));
		assert.equal(events.length, count ? 1 : 0);
		if (count) {
			assert.ok(describe(table, events[0]!, "spectator").includes(String(count)));
			assert.equal(nextDecision(table)!.situation, "trigger-order");
			apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table); finish(table);
			assert.equal(table.seats[who]!.life, life[who]! + (who === 0 ? selected.length : 0) + count);
		} else assert.equal(table.waiting.length, 0);
		assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(from)), table);
		assert.deepEqual(relive(middle, JSON.parse(JSON.stringify(table.ledger.slice(at)))), table);
	}
	for (const graveyard of [false, true]) {
		const table = start(standard, [{ deck: alpha(deck("Izzet Prowess")) }, { deck: alpha(deck("Mono-Red Aggro")) }], `explore-result-${graveyard}`);
		main(table, 0); place(table, 0, "hand", "Opt");
		const explorer = establish(table, 0, "Slickshot Show-Off", []), top = cardsIn(table, "library", 0).find(one => !table.printed[one.card!]!.type.includes("Land"))!;
		commit(table, [{ do: "order", who: 0, whose: 0, cards: [{ id: top.id, incarnation: top.incarnation }], position: "top" }, { do: "add-mana", who: 0, colors: ["U"] }], "game-setup");
		const second = establish(table, 0, "Slickshot Show-Off", []), before = structuredClone(table);
		const scope = { world: tableWorld(table), controller: 0, targets: [[explorer, second].map(one => ({ id: one.id, incarnation: one.incarnation }))] };
		assert.match(libraryKeyword(table, scope, { do: "keyword", name: "explore", what: "target:0" }).blocked!, /APNAP/);
		assert.deepEqual(table, before, "a simultaneous unsupported group reveals and moves nothing");
		const procedure = checkProcedure({ ...example("Cast Opt with recorded scry completion"), claim: "Explore completion result fixture", targets: [{ object: { types: ["creature"], controller: "you" } }], instructions: [
			{ do: "keyword", name: "explore", what: "target:0", as: "away" }, { do: "life", who: "you", amount: { bound: "away" } },
		] });
		announce(table, procedure, one => one.activation.targets[0]!.some(ref => "id" in ref && ref.id === explorer.id)); passBoth(table); step(table); step(table);
		const revealed = structuredClone(table);
		while (table.resolution) {
			const decision = nextDecision(table)!;
			if (decision.options.length === 1) step(table);
			else step(table, label => graveyard ? label.includes(top.card!) : /^(Decline|Done)/.test(label));
		}
		finish(table); assert.equal(table.seats[0]!.life, 20 + Number(graveyard));
		assert.equal(top.zone, graveyard ? "graveyard" : "library");
		assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length)), table);
		assert.deepEqual(relive(revealed, table.ledger.slice(revealed.ledger.length)), table);
	}
	// These stored abilities caused live-game source failures: the choice must follow
	// a private look, and Confidant must use the surveil result's new incarnation.
	for (const card of ["Greedy Freebooter", "Enlightened Confidant"]) for (const away of [false, true]) {
		const table = start(standard, [{ deck: alpha(deck(card === "Greedy Freebooter" ? "Jund Sacrifice" : "Lifegain")) }, { deck: alpha(deck("Mono-Red Aggro")) }], `stored-keyword-${card}-${away}`);
		main(table, 0);
		const prepared: Package = JSON.parse(readFileSync(`prepared/packages/2026-10-10/${card.toLowerCase().replaceAll(" ", "-")}.json`, "utf8")).package;
		const source = establish(table, 0, card, prepared.registers);
		const top = cardsIn(table, "library", 0).find(one => table.printed[one.card!]!.type.includes("Land"))!;
		commit(table, [{ do: "order", who: 0, whose: 0, cards: [{ id: top.id, incarnation: top.incarnation }], position: "top" },
			...(card === "Greedy Freebooter" ? [{ do: "move" as const, what: source.id, to: "graveyard" as const, reason: "sacrifice" as const }] : [{ do: "change-life" as const, who: 0, amount: 3, reason: "resolve" as const }])], "resolve");
		const initial = structuredClone(table);
		for (let guard = 0; nextDecision(table)?.situation !== "trigger-order"; guard++) {
			assert.ok(guard < 100, `${card} must raise its trigger`); const decision = nextDecision(table);
			if (!decision) advance(table); else apply(table, quiet(decision.options).id, "model", "chosen");
		}
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table); step(table); step(table);
		const looked = structuredClone(table);
		for (const viewer of [0, 1, "spectator"] as const) assert.equal(project(table, viewer).objects!.find(one => one.id === top.id)?.card, viewer === 0 ? top.card : undefined);
		while (table.resolution) {
			const decision = nextDecision(table)!;
			if (decision.options.length === 1) step(table);
			else apply(table, decision.options.find(one => away ? one.objects?.some(ref => ref.id === top.id) : one.id.endsWith(":done"))!.id, "model", "chosen");
		}
		finish(table);
		assert.equal(table.log.filter(one => one.changes.some(change => change.do === "keyword")).length, 1);
		if (card === "Greedy Freebooter") {
			assert.equal(cardsIn(table, "battlefield", 0).filter(one => one.token?.name === "Treasure Token").length, 1);
			assert.equal(cardsIn(table, "library", 0)[away ? cardsIn(table, "library", 0).length - 1 : 0]!.id, top.id);
		} else {
			assert.equal(top.zone, away ? "hand" : "library");
			assert.ok(table.log.every(one => one.changes.every(change => change.do !== "move" || change.reason !== "mill")));
		}
		for (const prefix of [initial, looked]) assert.deepEqual(relive(prefix, table.ledger.slice(prefix.ledger.length)), table);
	}
});
