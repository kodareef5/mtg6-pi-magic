/**
 * Driving a real table from a test: the pinned matchup, cards put where a
 * position needs them, and the decisions answered the way a seat would. The
 * packages and procedures come from docs/examples, so what strategy is taught is
 * what runs.
 */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { procedureOptions, activate, type ProcedureOption } from "../src/core/procedures.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import type { Package, Procedure, Registration } from "../src/core/language.ts";
import type { Zone } from "../src/core/syntax.ts";

/** Green plays Mono-Green Landfall, Red plays Mono-Red Aggro. */
export const matchup = (seed: string) => start(standard, [{ name: "Green", deck: deck("Mono-Green Landfall") }, { name: "Red", deck: deck("Mono-Red Aggro") }], seed);

const DIR = join(import.meta.dirname, "..", "docs", "examples");
const blocks = (kind: string) => readdirSync(DIR).filter((file) => file.endsWith(".md")).flatMap((file) =>
	[...readFileSync(join(DIR, file), "utf8").matchAll(/```json (\w+)\n([\s\S]*?)```/g)].filter(([, found]) => found === kind).map(([, , body]) => JSON.parse(body!)));
/** What a card registers, as docs/examples writes it. */
export const pack = (card: string): Registration[] => {
	const found = (blocks("package") as Package[]).find((one) => one.card === card);
	assert.ok(found, `docs/examples has a package for ${card}`);
	return found.registers;
};
/** A procedure from docs/examples, by its claim. */
export const example = (claim: string): Procedure => {
	const found = (blocks("procedure") as Procedure[]).find((one) => one.claim === claim);
	assert.ok(found, `docs/examples has a procedure claimed "${claim}"`);
	return found;
};

/** Put the first copy of each card from a seat's library, or its sideboard, where a test needs it. */
export function place(table: Table, seat: number, zone: Zone, ...cards: string[]) {
	return cards.map((card) => {
		const object = [...cardsIn(table, "library", seat), ...cardsIn(table, "outside", seat)].find((one) => one.card === card)!;
		assert.ok(object, `${card} is in seat ${seat}'s library or sideboard`);
		commit(table, [{ do: "move", what: object.id, to: zone, reason: "game-setup" }], "game-setup");
		return table.things.get(object.id)!;
	});
}
/** Put a permanent onto the battlefield with what it registers, as an established position. */
export function establish(table: Table, seat: number, card: string, registers = pack(card)) {
	const object = [...cardsIn(table, "library", seat), ...cardsIn(table, "outside", seat)].find((one) => one.card === card)!;
	commit(table, [{ do: "move", what: object.id, to: "battlefield", reason: "game-setup", registers }], "game-setup");
	return table.things.get(object.id)!;
}
/** The answer that changes least: pass, attack with nothing, block with nothing, or the first option. */
export const quiet = (options: { id: string }[]) => options.find((option) => option.id === "pass" || option.id === "attack:done" || option.id === "block:done") ?? options[0]!;
/** Keep both hands, answer forced decisions, and stop at a seat's first main phase with priority. */
export function main(table: Table, seat: number, turn = seat + 1, step = "precombat-main") {
	for (let guard = 0; guard < 2000; guard++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && decision.seat === seat && table.cursor.turn === turn && table.cursor.steps[0] === step) return;
		apply(table, decision.situation === "pregame" ? "keep" : quiet(decision.options).id, "engine", "forced");
	}
	throw new Error("Never reached the main phase.");
}
export const offered = (table: Table, procedure: Procedure) => procedureOptions(procedure, workFrame(table, table.cursor.priority!), "procedure");
export function announce(table: Table, procedure: Procedure, which: (option: ProcedureOption) => boolean = () => true) {
	const choice = offered(table, procedure).find(which);
	assert.ok(choice, `${procedure.claim} is offered`);
	activate(table, choice.activation, { picked: choice.option.id, offered: [choice.option.id], by: "model", why: "declared" });
	return choice;
}
export const passBoth = (table: Table) => { for (let at = 0; at < 2; at++) { while (!nextDecision(table)) advance(table); apply(table, "pass", "engine", "forced"); } };
/** Answer the pending resolution step with the option a test names, or its only option. */
export const step = (table: Table, pick?: (label: string) => boolean) => {
	const decision = nextDecision(table)!;
	assert.equal(decision.situation, "resolution");
	const option = pick ? decision.options.find((one) => pick(one.label)) : decision.options.length === 1 ? decision.options[0] : undefined;
	assert.ok(option, `a resolution option among: ${decision.options.map((one) => one.label).join(" | ")}`);
	apply(table, option.id, "model", "chosen");
	return decision;
};
/** Finish resolving, apply the state check, and come back to the next priority. Waiting triggers stop it. */
export const finish = (table: Table) => {
	while (table.resolution) step(table);
	for (let decision = nextDecision(table); decision?.situation !== "priority"; decision = nextDecision(table)) {
		if (decision?.situation === "trigger-order") return;
		if (!decision) advance(table);
		else apply(table, quiet(decision.options).id, "engine", "forced");
	}
};

/** What a test needs from a dossier's situation: the seat, the window and whether it is a forecast. */
export function readDossier(text: string) {
	const seat = Number(/^- You are .*? \(seat (\d+)\)/m.exec(text)?.[1]);
	const now = /^- (?:Now|Planned): (your|.+?'s) turn (\d+) on the table counter, (.+?) step\./m.exec(text);
	return { seat, opening: /The game is in its opening/.test(text), forecast: /This is a forecast/.test(text),
		turn: now ? Number(now[2]) : undefined, mine: now?.[1] === "your", step: now?.[3]!.replace(/ /g, "-") };
}

/** The quoted Oracle text under each card heading in a dossier's card text section. */
export function cardTexts(text: string): Map<string, string> {
	const section = text.split("\n## Card text\n")[1]?.split("\n## ")[0] ?? "";
	return new Map(section.split("\n### ").slice(1).map((block) => {
		const [head, ...rest] = block.split("\n");
		return [head!.trim(), rest.filter((line) => line.startsWith(">")).map((line) => line.replace(/^> ?/, "")).join("\n")];
	}));
}
