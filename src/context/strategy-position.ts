/** The facts a turn decision binds, read from the projected position without forecasting effects. */
import type { Frame } from "../core/types.ts";
import { allowance } from "../core/permits.ts";
import { viewWorld } from "../core/selectors.ts";
import { sources } from "../core/funding.ts";
import { useSources } from "../core/readiness.ts";
import type { Universe } from "../core/cards.ts";

/** Only call for an identity already earned in the projected objects. No text is interpreted. */
export function cardDefinition(frame: Frame, name: string, cards?: Universe) {
	const card = cards?.cards.get(name) ?? frame.view.printed?.[name];
	return card ? { name, type: card.type, mana: card.mana, stats: card.stats, oracle: card.oracle } : undefined;
}

export function decisionFacts(frame: Frame, cards?: Universe) {
	const objects = frame.view.objects ?? [], field = objects.filter((one) => one.zone === "battlefield");
	const ref = (one: typeof objects[number]) => ({ id: one.id, incarnation: one.incarnation, name: one.card ?? one.token?.name });
	const creatures = (own: boolean) => field.filter((one) => (one.controller === frame.seat) === own && one.traits?.types.includes("creature"))
		.map((one) => ({ ...ref(one), power: one.traits!.power, toughness: one.traits!.toughness, abilities: one.traits!.words,
			tapped: one.tapped, summoningSick: one.summoningSick, damage: one.damage }));
	const lands = allowance(viewWorld(frame.view), frame.seat).lands;
	return {
		scope: "Complete current creature roster and your visible hand at the supplied position. Empty means none. These facts do not include future casts, transformations, draws or triggers; other permanent abilities and restrictions remain in objects, watches and view.notes.",
		players: { you: frame.view.players?.find((one) => one.id === frame.seat), opponents: frame.view.players?.filter((one) => one.id !== frame.seat) ?? [] },
		yourHand: objects.filter((one) => one.zone === "hand" && one.controller === frame.seat).map((one) => ({ ...ref(one),
			...(one.card ? { printed: cardDefinition(frame, one.card, cards) } : {}) })),
		yourCreatures: creatures(true), opposingCreatures: creatures(false),
		mana: { untappedSources: sources(frame).map(({ object, yields }) => ({ ...ref(object), yields })),
			floating: frame.view.pools?.find((one) => one.seat === frame.seat)?.mana ?? [] },
		landPlays: { allowance: lands, used: frame.view.landsPlayed ?? 0, remaining: Math.max(0, lands - (frame.view.landsPlayed ?? 0)),
			visibleCandidates: useSources(frame, { source: { zones: ["hand", "graveyard", "exile"], controller: "any" }, timing: "land" })
				.filter((one) => one.traits?.types.includes("land")).map((one) => ({ ...ref(one), zone: one.zone })),
			scope: "Source permission and allowance, not a promise of current timing or entry characteristics. The line still orders these plays." },
	};
}
