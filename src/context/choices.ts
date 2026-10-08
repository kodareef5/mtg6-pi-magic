/** Shared action terms and reversible inspections of actual offers. No option is invented or removed. */
import type { Activation } from "../core/table.ts";
import type { Option } from "../core/types.ts";
import { summary } from "../core/announce.ts";
import { CHOICE_LIMIT } from "./model.ts";
import { inspectSpace, type Filter } from "./choice-space.ts";

export type Choice = Pick<Option, "id" | "label" | "shows" | "notes" | "cards" | "objects" | "spends" | "parameters"> & { use?: string; payment?: string; targets?: Activation["targets"]; x?: number };
export type Use = Pick<Activation, "source" | "claim" | "basis" | "timing" | "speed" | "slots" | "words"> & { effects: string[]; notes?: string[] };
export type Funding = NonNullable<Activation["funding"]>[number];
export type Payment = Pick<Activation, "cost" | "paid"> & { funding?: string[] };

/** Factor by equality of structured facts, never by a label or a decoded option id. */
export function choices(options: readonly Option[]) {
	const uses: Record<string, Use> = {}, payments: Record<string, Payment> = {}, funding: Record<string, Funding> = {};
	const useKeys = new Map<string, string>(), paymentKeys = new Map<string, string>(), fundingKeys = new Map<string, string>();
	const intern = <T>(facts: T, keys: Map<string, string>, records: Record<string, T>, prefix: string, identity?: unknown) => {
		const key = JSON.stringify(identity ?? facts), found = keys.get(key);
		if (found) return found;
		const id = `${prefix}${keys.size}`; keys.set(key, id); records[id] = structuredClone(facts); return id;
	};
	const listed: Choice[] = options.map((option) => {
		if (!option.use) { const { use: _, ...plain } = option; return structuredClone(plain); }
		const { source, claim, basis, timing, speed, slots, words, instructions, cost, paid, funding: taps, targets, x } = option.use;
		return { id: option.id, label: option.label,
			use: intern({ source, claim, basis, timing, ...(speed ? { speed } : {}), slots, ...(words ? { words } : {}), effects: instructions.map(summary) }, useKeys, uses, "use:", { source, claim, basis, timing, speed, slots, words, instructions }),
			payment: intern({ cost, paid, ...(taps ? { funding: taps.map((tap) => intern(tap, fundingKeys, funding, "funding:")) } : {}) }, paymentKeys, payments, "payment:"),
			targets: structuredClone(targets), ...(x === undefined ? {} : { x }), ...(option.notes?.length ? { notes: [...option.notes] } : {}) };
	});
	for (const [id, use] of Object.entries(uses)) {
		const variants = listed.filter((one) => one.use === id), shared = variants[0]?.notes?.filter((note) => variants.every((one) => one.notes?.includes(note))) ?? [];
		if (!shared.length) continue; use.notes = shared;
		for (const one of variants) { const remaining = one.notes?.filter((note) => !shared.includes(note)); if (remaining?.length) one.notes = remaining; else delete one.notes; }
	}
	return { options: listed, uses, payments, funding };
}

export type Inspection = { use?: string; binding?: string; path?: Filter[] };
export type Menu = { options: Choice[]; enter: Record<string, Inspection>; stage: "choice" | "use" | "binding" | "payment" | "component"; selected?: Use; scope?: string[]; field?: string; path?: Filter[]; facts?: string[] };
const bindingKey = (one: Choice) => JSON.stringify({ targets: one.targets, x: one.x });
function notes(variants: Choice[]): string[] {
	return [...new Set(variants.flatMap((one) => one.notes ?? []))].map((note) => {
		const count = variants.filter((one) => one.notes?.includes(note)).length;
		return count === variants.length ? note : `${count} of ${variants.length} alternatives: ${note}`;
	});
}

/** A stage partitions complete original offers. Backtracking restores the whole menu. */
function stages(facts: ReturnType<typeof choices>, selected: Inspection): Menu {
	const enter: Record<string, Inspection> = {};
	const terminals = facts.options.filter((one) => !one.use);
	if (!selected.use) {
		const seen = new Set<string>();
		return { stage: Object.keys(facts.uses).length ? "use" : "choice", enter, options: facts.options.flatMap((one) => {
			if (!one.use) return [one];
			if (seen.has(one.use)) return []; seen.add(one.use);
			const variants = facts.options.filter((other) => other.use === one.use);
			if (variants.length === 1) return [one];
			const id = `inspect:${one.use}`; enter[id] = { use: one.use };
			return [{ id, label: facts.uses[one.use]!.claim, use: one.use, notes: notes(variants), shows: `Inspect ${variants.length} offered target and payment combinations. No action is taken.` }];
		}) };
	}
	const variants = facts.options.filter((one) => one.use === selected.use);
	const bindings = [...new Set(variants.map(bindingKey))];
	const back = { id: "inspect:back", label: "Return to all uses", shows: "Changes no choice or resource at the table." };
	enter[back.id] = {};
	if (bindings.length > 1 && selected.binding === undefined) return {
		stage: "binding", enter, selected: facts.uses[selected.use],
		options: [...bindings.map((key, at) => {
			const one = variants.find((variant) => bindingKey(variant) === key)!;
			const id = `inspect:binding:${at}`; enter[id] = { use: selected.use, binding: key };
			return { id, label: `${one.label}${one.x === undefined ? "" : `, X=${one.x}`}`,
				use: one.use, targets: one.targets, ...(one.x === undefined ? {} : { x: one.x }), notes: notes(variants.filter((one) => bindingKey(one) === key)),
				shows: "Inspect the payments for these exact target bindings. No target is declared." };
		}), ...terminals, back],
	};
	return { stage: "payment", enter, selected: facts.uses[selected.use],
		options: [...variants.filter((one) => selected.binding === undefined || bindingKey(one) === selected.binding), ...terminals, back] };
}

export function inspect(facts: ReturnType<typeof choices>, selected: Inspection, capacity = CHOICE_LIMIT): Menu {
	const menu = stages(facts, selected), path = selected.path ?? [];
	const space = inspectSpace(menu.options, path, capacity);
	const enter = { ...menu.enter };
	for (const [id, path] of Object.entries(space.enter)) enter[id] = { ...selected, path };
	if (path.length) {
		enter["inspect:previous"] = { ...selected, path: path.slice(0, -1) };
		space.options.push({ id: "inspect:previous", label: "Return to the previous inspection", shows: "Changes no action, target or payment." });
	}
	const remaining = new Set(space.scope), original = new Set(facts.options.map((one) => one.id));
	const visible = menu.options.filter((one) => remaining.has(one.id));
	const common = visible[0]?.shows && visible.every((one) => one.shows === visible[0]!.shows) ? [visible[0].shows] : [];
	const scope = visible.flatMap((one) => original.has(one.id) ? [one.id]
		: one.use ? facts.options.filter((other) => other.use === one.use && (one.targets === undefined || bindingKey(other) === bindingKey(one))).map((other) => other.id) : []);
	return { ...menu, options: space.options, enter, scope,
		...(space.field ? { stage: "component", field: space.field, facts: common } : {}), ...(path.length ? { path } : {}) };
}
