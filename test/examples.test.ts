/**
 * Expressible. Every JSON block in docs/examples parses under the real syntax,
 * and every quoted basis appears in the oracle text of the card it names. The
 * card review in docs/STANDARD.md covers every card in both lists. At
 * least half the cards come from outside the matchup, so the examples teach
 * reading cards rather than become an answer key for two decks.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, PackageSchema, PlanSchema, ProcedureSchema, type Package, type Plan, type Procedure } from "../src/core/language.ts";
import { load } from "../src/core/cards.ts";
import { decks } from "../tools/matchup-fixture.ts";
import { planWork, syntaxReference } from "../src/context/strategy.ts";
import { workFrame, editWork } from "../src/core/work-tools.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { tally } from "../src/context/spend.ts";
import { main, matchup } from "./play.ts";

const DIR = join(import.meta.dirname, "..", "docs", "examples");
const SCHEMAS = { procedure: ProcedureSchema, package: PackageSchema, plan: PlanSchema };

test("every example block parses and quotes its card", () => {
	const cards = load(join(import.meta.dirname, "..", "cards", "standard.tsv")).cards;
	const inMatchup = new Set(decks.flatMap((deck) => [...Object.keys(deck.main), ...Object.keys(deck.sideboard)]));
	const named = new Set<string>();
	const quotes = (card: string, basis: string, where: string) => {
		const oracle = cards.get(card)?.oracle.replaceAll("\\n", " ");
		assert.ok(oracle, `${where}: ${card} is not a Standard card`);
		named.add(card);
		for (const part of basis.split(" ... ")) assert.ok(oracle.includes(part), `${where}: "${part}" is not in ${card}'s text`);
	};
	// A token is named by the card that made it; its procedures quote that card's reminder text.
	const tokens = new Set<string>();
	const procedure = (value: Procedure, where: string) => {
		checkProcedure(value);
		if (value.source.card && !tokens.has(value.source.card)) quotes(value.source.card, value.basis, where);
	};
	const pack = (value: Package, where: string) => value.registers.forEach((registration) => quotes(value.card, registration.basis, where));
	const files = readdirSync(DIR).filter((file) => file.endsWith(".md") && file !== "README.md");
	assert.ok(files.length > 0);
	for (const file of files) {
		const blocks = [...readFileSync(join(DIR, file), "utf8").matchAll(/```json (\w+)\n([\s\S]*?)```/g)];
		assert.ok(blocks.length, `${file} has no example blocks`);
		blocks.forEach(([, kind, body], index) => {
			const where = `${file} block ${index + 1}`;
			const schema = SCHEMAS[kind as keyof typeof SCHEMAS];
			assert.ok(schema, `${where}: unknown kind ${kind}`);
			const value = check(schema, JSON.parse(body!), where);
			for (const [, token] of body!.matchAll(/"spec": \{ "name": "([^"]+)"/g)) tokens.add(token!);
			if (kind === "procedure") procedure(value as Procedure, where);
			if (kind === "package") pack(value as Package, where);
			if (kind === "plan") {
				const plan = value as Plan;
				for (const option of [...plan.steps, ...plan.may ?? []]) if ("procedure" in option.action) procedure(option.action.procedure, where);
				(plan.packages ?? []).forEach((one) => pack(one, where));
			}
		});
	}
	const review = readFileSync(join(import.meta.dirname, "..", "docs", "STANDARD.md"), "utf8");
	const rows = new Set([...review.matchAll(/^\| ([^|]+?)(?: \(side\))? \|/gm)].map((row) => row[1]));
	for (const card of inMatchup) assert.ok(rows.has(card), `${card} is missing from the card review`);
	const outside = [...named].filter((card) => !inMatchup.has(card)).length;
	assert.ok(outside * 2 >= named.size, `${outside} of ${named.size} example cards come from outside the matchup`);
});

test("strategy reads the syntax and can fetch every indexed example without loading them all", async () => {
	const listed = [...readFileSync(join(DIR, "README.md"), "utf8").matchAll(/^\| `([^`]+\.md)` \|/gm)].map((match) => match[1]!);
	assert.deepEqual([...listed].sort(), readdirSync(DIR).filter((file) => file.endsWith(".md") && file !== "README.md").sort(), "the index lists every example file");
	const reference = syntaxReference();
	assert.ok(reference.startsWith(readFileSync(join(DIR, "..", "SYNTAX.md"), "utf8").trim().slice(0, 200)));
	assert.equal(reference, readFileSync(join(DIR, "..", "SYNTAX.md"), "utf8").trim());
	const table = matchup("example-tools"); main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }], "request");
	let rounds = 0;
	const stream: Stream = (_model, request) => {
		rounds++;
		if (rounds === 1) {
			const example = request.tools!.find((tool) => tool.name === "example")!;
			assert.deepEqual((example.parameters as { properties: { file: { enum: string[] } } }).properties.file.enum, listed);
			const schema = JSON.stringify(request.tools!.find((tool) => tool.name === "submit")!.parameters);
			assert.doesNotMatch(schema, /\$ref|\$defs/, "providers receive no recursive tool definitions");
			assert.ok(schema.length < 3000, `${schema.length} characters in the advertised schema`);
			assert.match(request.systemPrompt!, /The complete update schema below is checked locally/);
			assert.match(request.systemPrompt!, /\$defs/, "the writer still receives the complete nested vocabulary");
			return { result: async () => ({ stopReason: "toolUse", content: listed.map((file, at) => ({ type: "toolCall", id: `e${at}`, name: "example", arguments: { file } })) }) };
		}
		const messages = JSON.stringify(request.messages);
		for (const file of listed) assert.ok(messages.includes(JSON.stringify(readFileSync(join(DIR, file), "utf8")).slice(1, -1)), `${file} is answered by the real lookup`);
		return { result: async () => ({ stopReason: "toolUse", content: [{ type: "toolCall", id: "done", name: "submit", arguments: {
			objective: "Pass.", guidance: "Keep resources.", steps: [{ label: "Pass", when: {}, action: { option: "pass" } }] } }] }) };
	};
	await planWork(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally() }));
	assert.equal(rounds, 2);
});
