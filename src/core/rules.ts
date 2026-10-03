/**
 * The Comprehensive Rules, local and searchable.
 *
 * `rules/cr.tsv` is in the repo: 4063 rows, every rule, heading and glossary
 * term, with each rule's examples folded in. `tools/rules.ts` rebuilds it and
 * checks that every body line parsed and every citation resolves.
 *
 * The judge reads this. So does anything that wants to cite a rule rather than
 * assert one, which is the difference between a ruling somebody can check and
 * a ruling they have to trust.
 */

import { readFileSync } from "node:fs";

export type Kind = "rule" | "head" | "term";

export type Entry = { kind: Kind; ref: string; text: string };

export type Rules = {
	path: string;
	/** The date the rules themselves state, read from the source. */
	effective: string;
	entries: Entry[];
	byRef: Map<string, Entry>;
	byTerm: Map<string, Entry>;
};

export function load(path: string): Rules {
	const raw = readFileSync(path, "utf8");
	const effective = raw.match(/^# Effective: ([^\n]+?)\s{2,}/m)?.[1] ?? "unknown";
	const lines = raw.split("\n").filter((line) => line && !line.startsWith("#"));
	if (lines.shift() !== "kind\tref\ttext") {
		throw new Error(`${path} is not a rules file. Run npm run rules to build it.`);
	}

	const entries: Entry[] = [];
	const byRef = new Map<string, Entry>();
	const byTerm = new Map<string, Entry>();
	for (const line of lines) {
		const [kind, ref, text] = line.split("\t");
		if (!kind || !ref) continue;
		const entry = { kind: kind as Kind, ref, text: (text ?? "").replaceAll("\\n", "\n") };
		entries.push(entry);
		if (entry.kind === "term") byTerm.set(ref.toLowerCase(), entry);
		else byRef.set(ref, entry);
	}
	return { path, effective, entries, byRef, byTerm };
}

/**
 * A rule by number. Throws rather than returning nothing, because a citation
 * that does not resolve is a mistake worth stopping for, and names the rule
 * group so the caller can widen.
 */
export function rule(rules: Rules, ref: string): Entry {
	const found = rules.byRef.get(ref);
	if (found) return found;
	const group = ref.split(".")[0];
	const near = rules.byRef.get(group ?? "");
	throw new Error(`No rule ${ref}${near ? `. Rule ${group} is "${near.text}"` : ""}`);
}

export function term(rules: Rules, word: string): Entry | undefined {
	return rules.byTerm.get(word.toLowerCase());
}

/** Every rule number a piece of text points at, so a ruling can carry its sources. */
export function cited(text: string): string[] {
	return [...text.matchAll(/\brules?\s+(\d{3}(?:\.\d+[a-z]*)?)/g)].map((m) => m[1]!);
}

/**
 * Search by words. Every word must appear, in the ref or the text.
 *
 * Ranked so the most specific answer comes first: an exact ref, then a glossary
 * term, then a rule, and shorter text ahead of longer, because a rule that says
 * one thing is a better answer than a rule that mentions it in passing.
 */
export function search(rules: Rules, query: string, limit = 8): Entry[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const rank = { term: 1, rule: 2, head: 3 } as const;
	return rules.entries
		.filter((entry) => {
			const hay = `${entry.ref}\n${entry.text}`.toLowerCase();
			return words.every((word) => hay.includes(word));
		})
		.sort((a, b) => {
			const exact = (entry: Entry) => (entry.ref.toLowerCase() === query.toLowerCase() ? 0 : 1);
			return exact(a) - exact(b) || rank[a.kind] - rank[b.kind] || a.text.length - b.text.length;
		})
		.slice(0, limit);
}
