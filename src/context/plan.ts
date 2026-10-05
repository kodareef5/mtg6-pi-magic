/** Empty intent until the seat receives its pregame guidance and turn plan. */
import type { Intent } from "../core/intent.ts";
import type { SeatId } from "../core/types.ts";

/** No inference to begin ordinary play. The seat's plan asks strategy when it wants one. */
export const startingIntent = (seat: SeatId): Intent => ({
	seat, version: 0,
	deck: { seat },
	turn: { objective: "", budget: [], hypotheses: [] },
	phase: { turn: 0, phase: "precombat-main", order: [], expectedBranches: [], reconsiderWhen: [], assumptions: [] },
});
