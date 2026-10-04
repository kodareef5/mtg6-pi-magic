/** When to pay attention, and what still needs consideration. Listing changes nothing. */
import type { Frame } from "./types.ts";
import type { SeenObject, Task, Workspace } from "./work.ts";
import type { Query, When } from "./work-language.ts";
import { createHash } from "node:crypto";

const signature = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const occurrence = (frame: Frame): string => frame.view.window.kind === "turn"
	? `${frame.view.window.turn}/${frame.view.visit ?? frame.view.window.step}` : frame.view.window.kind;

/** Evidence for an assessment; cursor-only passes leave the position unchanged. */
export const positionStamp = (frame: Frame): string => signature({
	window: frame.view.window, visit: frame.view.visit, objects: frame.view.objects,
	public: frame.view.table.slice(1), private: frame.view.yours,
});

export function matches(when: When, frame: Frame): boolean {
	const at = frame.view.window;
	if (at.kind !== "turn") return false;
	return (!when.active || when.active === "any" || (when.active === "self" ? at.active === frame.seat : at.active !== frame.seat)) &&
		(!when.step || when.step === at.step) && (!when.phase || when.phase === at.phase) &&
		(when.fromTurn === undefined || at.turn >= when.fromTurn) &&
		(when.throughTurn === undefined || at.turn <= when.throughTurn);
}

/** Queries operate only on already projected objects. Missing names stay missing. */
export function select(query: Query, frame: Frame): SeenObject[] {
	return (frame.view.objects ?? []).filter((item) =>
		(!query.zones || query.zones.includes(item.zone)) &&
		(!query.controller || query.controller === "any" || (query.controller === "self" ? item.controller === frame.seat : item.controller !== frame.seat)) &&
		(!query.card || query.card === item.card) && (query.tapped === undefined || query.tapped === item.tapped) &&
		(!query.refs || query.refs.some((ref) => ref.id === item.id && ref.incarnation === item.incarnation)),
	).sort((a, b) => a.id.localeCompare(b.id));
}

export type Review = {
	task: string; label: string; guidance: string; occurrence: string; stamp: string;
	items: { id: string; label: string; concern: string }[];
	choices: { id: string; label: string }[];
};

export function review(task: Task, frame: Frame, work: Workspace): Review | null {
	if (task.cancelled || task.expired || !matches(task.when, frame)) return null;
	if (task.after && (work.tasks.find((other) => other.id === task.after!.task)?.runs.length ?? 0) < task.after.runs) return null;
	const key = occurrence(frame);
	const prior = task.runs.find((run) => run.occurrence === key);
	if (!prior && task.runs.length >= (task.times ?? Infinity)) return null;
	const objects = select(task.scope, frame);
	const subjects = [
		...objects.map((object) => ({ id: `${object.id}@${object.incarnation}`, label: `${object.card ?? "Unknown card"} (${object.id}@${object.incarnation})` })),
		...task.concepts.map((concept) => ({ id: `concept:${concept}`, label: concept })),
	];
	const items = subjects.flatMap((subject) => task.concerns.map((concern) => ({
		id: JSON.stringify([subject.id, concern]), label: subject.label, concern,
	})));
	for (const object of objects) for (const label of work.labels.filter((label) => label.object.id === object.id && label.object.incarnation === object.incarnation)) {
		items.push({ id: JSON.stringify([`${object.id}@${object.incarnation}`, `label:${label.role}`]), label: `${object.card ?? "Unknown card"} (${object.id}@${object.incarnation})`, concern: `${label.role}: ${label.purpose}` });
	}
	// A broader position signature deliberately reopens reviews conservatively.
	// Priority grants and passes alone do not invalidate an assessment.
	const stamp = signature({
		objects, public: frame.view.table.slice(1), private: frame.view.yours,
		labels: work.labels, concepts: task.concepts, guidance: task.guidance,
	});
	if (prior?.stamp === stamp) return null;
	return {
		task: task.id, label: task.label, guidance: task.guidance, occurrence: key, stamp, items,
		choices: [
			{ id: "no-action", label: "Considered; no action warranted under the prepared guidance." },
			...task.recipes.filter((id) => work.recipes.some((recipe) => recipe.id === id)).map((id) => ({ id: `recipe:${id}`, label: `Nominate recipe ${id} for preparation. Nothing executes.` })),
			...work.tasks.filter((other) => other.id !== task.id && !other.cancelled && !other.expired && !overdue(other, frame) && !matches(other.when, frame) && other.runs.length < (other.times ?? Infinity))
				.map((other) => ({ id: `wait:${other.id}`, label: `Considered; leave this to scheduled check ${other.id}.` })),
			{ id: "rethink", label: "The prepared guidance does not settle this; request fresh strategy." },
		],
	};
}

export function overdue(task: Task, frame: Frame): boolean {
	return !task.cancelled && !task.expired && frame.view.window.kind === "turn" &&
		task.when.throughTurn !== undefined && frame.view.window.turn > task.when.throughTurn &&
		task.runs.length < (task.times ?? 1);
}

export const pendingReviews = (frame: Frame): Review[] => {
	const work = frame.view.work;
	return work && frame.decision?.situation === "priority" ? work.tasks.flatMap((task) => review(task, frame, work) ?? []) : [];
};
