/** Private equipment for a seat: its accepted plan. Its revision and history are separate from card motion. */
import type { Thing } from "./table.ts";
import type { Traits } from "./characteristics.ts";
import type { Notebook, WorkCommand } from "./work-language.ts";
import type { Package, Plan } from "./language.ts";

/** A projected object, with its characteristics as they are now. A face-down object has none. */
export type SeenObject = Omit<Thing, "card"> & { card?: string; traits?: Traits };
/** A seat's judgment at a particular decision, not a claim that an action was performed. */
export type Review = { item: string; verdict: "act" | "hold" | "skip"; reason: string; at: number; plan?: number };
export type Workspace = {
	revision: number;
	/** The plan the seat flies. Its progress is read from the ledger, never stored here. */
	plan?: Plan;
	/** The revision that accepted the plan: ledger rows name it, so a later request does not reset progress. */
	planned?: number;
	/** Stops that held when the plan was accepted. Each arms once it has been false, so a stop fires on a change. */
	unarmed?: string[];
	/** Accepted card registrations and procedures, kept across plans. Private until used. */
	packages?: Package[];
	/** The clock when this seat last accepted a plan. */
	accepted?: number;
	/** This seat plans each of its own turns, so its turn waits for that plan. */
	eachTurn?: true;
	/** Why strategy is wanted now: a request, a stop the table raised, or the pilot asking for help. */
	request?: string;
	/** The strategist's own notes, kept across plans so each call builds on the last. Never shown to the pilot. */
	notebook?: Notebook;
	/** Considered uses in the current position. The checklist ignores judgments from another physical revision or plan. */
	reviews?: Review[];
};
export type WorkEntry = {
	seq: number;
	at: number;
	clock: number;
	seat: number;
	actionId: string;
	note: string;
	tools?: WorkCommand[];
	/** An accepted workspace, so replay never needs to ask strategy again. */
	workspace: Workspace;
};
export const emptyWork = (): Workspace => ({ revision: 0 });
