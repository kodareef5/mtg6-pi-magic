/** Private equipment for a seat. Its revision and history are separate from card motion. */
import type { Thing } from "./table.ts";
import type { Recipe, TaskSpec, ObjectRef, DraftStep, WorkCommand } from "./work-language.ts";
import type { Package } from "./language.ts";

/** A projected object. `creature` is the printed base read at projection time. */
export type SeenObject = Omit<Thing, "card"> & { card?: string; creature?: { power: number; toughness: number } };
export type ReviewRun = {
	occurrence: string;
	stamp: string;
	answers: Record<string, string>;
};
export type Task = TaskSpec & { runs: ReviewRun[]; cancelled?: boolean; expired?: boolean };
export type Draft = {
	id: string;
	recipe: string;
	label: string;
	guidance: string;
	steps: DraftStep[];
	reserves: Recipe["reserves"];
	/** Completed steps stay here, and edits only replace the remainder. */
	next: number;
	bound?: string;
	boundObjects?: ObjectRef[];
	status: "editing" | "ready";
	readyStamp?: string;
	parked?: string;
};
export type Workspace = {
	revision: number;
	objective?: string;
	tasks: Task[];
	recipes: Recipe[];
	labels: { object: ObjectRef; role: string; purpose: string }[];
	suggested: string[];
	/** What this seat's permanents register when they enter, by card name. Private until one is used. */
	packages?: Package[];
	/** The clock when this seat last accepted a plan. */
	accepted?: number;
	/** This seat plans each of its own turns, so a pass waits for that plan. */
	eachTurn?: true;
	draft?: Draft;
	request?: string;
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
export const emptyWork = (): Workspace => ({ revision: 0, tasks: [], recipes: [], labels: [], suggested: [] });
