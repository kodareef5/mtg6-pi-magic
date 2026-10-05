/** Narrow complete choices by public components. A path is inspection, never a partial move. */
import type { Choice } from "./choices.ts";

type Value = string | number;
export type Filter = { field: string; from: Value; to: Value };
const compare = (a: Value, b: Value) => typeof a === "number" && typeof b === "number" ? a - b : a === b ? 0 : String(a) < String(b) ? -1 : 1;

function fields(one: Choice): Record<string, Value> {
	return { ...one.parameters,
		...Object.fromEntries(Object.entries(one.targets ?? {}).map(([slot, targets]) => [`Target ${slot}`, JSON.stringify(targets)])),
		...(one.x === undefined ? {} : { X: one.x }),
		"Offered action": one.label, "Offered action id": one.id };
}

export function inspectSpace(options: Choice[], path: Filter[], capacity: number) {
	if (capacity < 2) throw new Error("Inspection needs room for a choice and backtracking.");
	const controls = options.filter((one) => ["pass", "attack:done", "block:done", "inspect:back"].includes(one.id));
	const rows = options.filter((one) => !controls.includes(one)).map((option) => ({ option, fields: fields(option) }));
	const remaining = rows.filter((row) => path.every(({ field, from, to }) => {
		const value = row.fields[field];
		return value !== undefined && compare(value, from) >= 0 && compare(value, to) <= 0;
	}));
	if (!remaining.length && path.length) throw new Error("Inspection no longer names any offered choice.");
	const scope = [...remaining.map((row) => row.option.id), ...controls.map((one) => one.id)];
	const room = capacity - controls.length - (path.length ? 1 : 0);
	if (remaining.length <= room) return { options: path.length ? [...remaining.map((row) => row.option), ...controls] : [...options], scope, enter: {} as Record<string, Filter[]> };
	if (room < 2) throw new Error("Inspection controls leave no room to narrow the choice.");
	// Prefer the core's named components, then actual target slots and X. Labels
	// provide an ordered directory for choices with no shared component (searches,
	// unrelated actions). Full labels survive; no option or text is cut to fit.
	const keys = [...new Set(remaining.flatMap((row) => Object.keys(row.fields)))];
	const field = keys.find((key) => !key.startsWith("Offered action") && remaining.every((row) => row.fields[key] !== undefined)
		&& new Set(remaining.map((row) => row.fields[key])).size > 1)
		?? (new Set(remaining.map((row) => row.option.label)).size > 1 ? "Offered action" : "Offered action id");
	const values = [...new Set(remaining.map((row) => row.fields[field]!))].sort(compare);
	// A large single domain uses explicit inclusive ranges, with every value
	// represented. The next question narrows that domain again before a move.
	const width = Math.ceil(values.length / room), enter: Record<string, Filter[]> = {};
	const listed: Choice[] = [];
	for (let at = 0; at < values.length; at += width) {
		const from = values[at]!, to = values[Math.min(at + width, values.length) - 1]!;
		const count = remaining.filter((row) => compare(row.fields[field]!, from) >= 0 && compare(row.fields[field]!, to) <= 0).length;
		const id = `inspect:component:${at}`;
		enter[id] = [...path, { field, from, to }];
		listed.push({ id, label: `${field}: ${from === to ? from : `from ${from} through ${to} (inclusive)`}`,
			shows: `Inspect ${count} complete choices. No part of an action is committed.` });
	}
	return { options: [...listed, ...controls], scope, enter, field };
}
