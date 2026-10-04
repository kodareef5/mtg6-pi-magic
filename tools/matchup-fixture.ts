/** Real registered lists. Only the opening line below has reviewed execution terms. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { start } from "../src/core/commit.ts";
import { load, checkDeck, card } from "../src/core/cards.ts";
import { standard } from "../src/core/format.ts";
import type { Frame } from "../src/core/types.ts";
import type { Procedure, WorkCommand } from "../src/core/work-language.ts";

export const matchup = JSON.parse(readFileSync(new URL("../decks/standard-matchup.json", import.meta.url), "utf8")) as {
	event: string; eventDate: string; legalityDate: string;
	cards: { path: string; generated: string; sha256: string }; rules: { path: string; effective: string; sha256: string };
	decks: { name: string; pilot: string; source: string; main: Record<string, number>; sideboard: Record<string, number> }[];
};
export const universe = load(matchup.cards.path);
export const expand = (counts: Record<string, number>): string[] => Object.entries(counts).flatMap(([name, count]) => Array(count).fill(name));
for (const pin of [matchup.cards, matchup.rules]) {
	if (createHash("sha256").update(readFileSync(pin.path)).digest("hex") !== pin.sha256) throw new Error(`Pinned data changed: ${pin.path}`);
}
for (const deck of matchup.decks) {
	const main = expand(deck.main), sideboard = expand(deck.sideboard);
	const problems = [...checkDeck(universe, main, standard), ...checkDeck(universe, [...main, ...sideboard], standard)];
	if (main.length !== 60 || sideboard.length !== 15 || problems.length) throw new Error(`${deck.name}: ${problems.join("; ") || "expected 60 + 15 cards"}`);
}
export const matchTable = (seed: string) => start(standard, matchup.decks.map((deck, seat) => ({ name: seat ? "Red" : "Green", deck: expand(deck.main) })), seed);

/** Accepted interpretations for one line, outside core. This is not a card compiler. */
export const elf: Procedure = {
	source: { zones: ["hand"], controller: "self", card: "Llanowar Elves" }, claim: "Cast Llanowar Elves",
	basis: `${card(universe, "Llanowar Elves").type}; ${card(universe, "Llanowar Elves").stats}; {G}. ${card(universe, "Llanowar Elves").oracle}`,
	timing: "spell", spell: { speed: "sorcery", destination: "battlefield" },
	cost: { tap: false, generic: 0, colors: ["G"] }, instructions: [], delegate: true,
};
export const shock: Procedure = {
	source: { zones: ["hand"], controller: "self", card: "Shock" }, claim: "Cast Shock",
	basis: card(universe, "Shock").oracle, timing: "spell", spell: { speed: "instant", destination: "graveyard" },
	cost: { tap: false, generic: 0, colors: ["R"] }, target: "creature-or-player", instructions: [{ do: "damage", amount: 2 }], delegate: true,
};

export function openingTools(frame: Frame): WorkCommand[] {
	const green = frame.seat === 0, land = green ? "Forest" : "Mountain", color = green ? "G" : "R";
	const when = { active: "self" as const, step: "precombat-main", fromTurn: green ? 1 : 2, throughTurn: green ? 1 : 2 };
	return [{ do: "recipe.put", recipe: { id: "opening", label: green ? "Cast the Elf" : "Remove the Elf", reserves: [],
		guidance: green ? "Play Forest, make G, cast Llanowar Elves, then pass. Do not repeat this line." : "Play Mountain, make R, cast Shock targeting the opposing Llanowar Elves. Do not target a player in this probe.",
		steps: [
			{ label: `Play ${land}`, when, action: { prefix: "land:", objects: { card: land } } },
			{ label: `Make ${color}`, when, action: { procedure: { source: { zones: ["battlefield"], controller: "self", card: land }, claim: `Tap ${land} for ${color}`,
				basis: card(universe, land).oracle, timing: "mana", cost: { tap: true, generic: 0, colors: [] }, instructions: [{ do: "mana", who: "self", colors: [color] }], delegate: true } } },
			{ label: green ? "Cast Llanowar Elves" : "Cast Shock at the Elf", when, action: { procedure: green ? elf : shock } },
		] } },
		{ do: "task.put", task: { id: "opening", label: "Consider the opening line", when, times: 1, scope: { zones: [] }, concepts: ["opening line"], concerns: ["execute once"],
			guidance: "Adopt opening once. After adopting it, finish the current draft; do not nominate it again. Completed steps stay completed.", recipes: ["opening"] } },
		{ do: "plan.accept", objective: green ? "Cast Llanowar Elves this turn." : "Answer the opposing Elf with Shock on turn two." }];
}
