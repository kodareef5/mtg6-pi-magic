/** Internal plans. Only decisions.ts projects these into the options a seat reads. */
import type { Change, Reason } from "./syntax.ts";
import type { Decision, Option } from "./types.ts";

export type Move = { option: Option; changes: Change[]; reason: Reason };
export type Pending = Omit<Decision, "options"> & { moves: Move[] };
