/** Internal plans. Only decisions.ts projects these into the options a seat reads. */
import type { Change, Reason } from "./syntax.ts";
import type { Decision, Option } from "./types.ts";
import type { Activation } from "./table.ts";

/** A move with an activation commits through `activate`, so replay and play share one path. */
export type Move = { option: Option; changes: Change[]; reason: Reason; activation?: Activation };
export type Pending = Omit<Decision, "options"> & { moves: Move[] };
