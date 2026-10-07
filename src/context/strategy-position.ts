/** The facts a turn decision binds, read from the projected position without forecasting effects. */
import type { Frame } from "../core/types.ts";
import type { Universe } from "../core/cards.ts";

/** Only call for an identity already earned in the projected objects. No text is interpreted. */
export function cardDefinition(frame: Frame, name: string, cards?: Universe) {
	const card = cards?.cards.get(name) ?? frame.view.printed?.[name];
	return card ? { name, type: card.type, mana: card.mana, stats: card.stats, oracle: card.oracle } : undefined;
}
