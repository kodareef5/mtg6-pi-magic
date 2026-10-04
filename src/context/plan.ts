/** The basic-land prior. Executable preparation lives in the seat's workspace. */
import type { Intent } from "../core/intent.ts";
import type { SeatId } from "../core/types.ts";

/** No inference to begin ordinary play. The seat's plan asks strategy when it wants one. */
export const startingIntent = (seat: SeatId): Intent => ({
	seat, version: 0,
	deck: { seat, winsBy: "nothing yet. This deck is lands.", priorities: ["Play a land every turn."], delegates: ["resolution"] },
	turn: { objective: "Play a land and pass.", budget: [], hypotheses: [] },
	phase: { turn: 0, phase: "precombat-main", order: [], expectedBranches: [], reconsiderWhen: [], assumptions: [] },
});
