/** The turn's steps. Effects may edit their order; a step still belongs to a phase. */
export const STEPS = {
	untap: { phase: "beginning", priority: false },
	upkeep: { phase: "beginning", priority: true },
	draw: { phase: "beginning", priority: true },
	"precombat-main": { phase: "precombat-main", priority: true },
	"begin-combat": { phase: "combat", priority: true },
	"declare-attackers": { phase: "combat", priority: true },
	"declare-blockers": { phase: "combat", priority: true },
	"combat-damage": { phase: "combat", priority: true },
	"end-of-combat": { phase: "combat", priority: true },
	"postcombat-main": { phase: "postcombat-main", priority: true },
	end: { phase: "ending", priority: true },
	cleanup: { phase: "ending", priority: false },
} as const;

export type Step = keyof typeof STEPS;
export type Phase = (typeof STEPS)[Step]["phase"];
export const TURN = Object.keys(STEPS) as Step[];
