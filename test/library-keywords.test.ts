/** Keyword completion follows private choices, retains actual results, and waits for priority. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn } from "../src/core/table.ts";
import { relive } from "../src/core/journal.ts";
import { project, describe } from "../src/core/view.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { main, place, announce, passBoth, step, finish, example, establish } from "./play.ts";

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
});
