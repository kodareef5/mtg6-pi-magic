/** Private equipment for a seat. Its revision and history are separate from card motion. */
import type { Thing } from "./table.ts";
import type { Recipe, TaskSpec, ObjectRef, DraftStep, WorkCommand, Interpretation } from "./work-language.ts";

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
	/** Accepted meaning of this seat's cards, one entry per ability. */
	interpretations?: Interpretation[];
	/** Card text the vocabulary could not express. Those cards are not offered. */
	missing?: { card: string; text: string }[];
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
	/** An accepted workspace, so replay never needs to repeat an interpretation. */
	workspace: Workspace;
};
export const emptyWork = (): Workspace => ({ revision: 0, tasks: [], recipes: [], labels: [], suggested: [] });
