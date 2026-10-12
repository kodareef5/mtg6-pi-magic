/** A trace writes each system prompt and tool list once; expanding the whole trace restores every request as sent. */
import test from "node:test";
import assert from "node:assert/strict";
import { expandTraces, traceInference, type CallTrace } from "../src/context/trace.ts";

test("a repeated prompt is written once and every request expands to exactly what was sent", async () => {
	const events: CallTrace[] = [];
	const reply = { content: [], stopReason: "stop" };
	const traced = traceInference({ classify: async () => { throw new Error("unused"); }, stream: () => ({ result: async () => reply }) } as never, (event) => events.push(event));
	const model = { provider: "p", id: "m" } as never;
	const system = "S".repeat(5000), tools = [{ name: "submit", description: "d", parameters: { type: "object" } }];
	const sent = [
		{ systemPrompt: system, messages: [{ role: "user", content: "one" }], tools },
		{ systemPrompt: system, messages: [{ role: "user", content: "two" }], tools },
		{ systemPrompt: "other", messages: [{ role: "user", content: "three" }], tools },
	];
	for (const request of sent) await traced.stream(model, request as never).result();
	const requests = events.filter((event) => event.event === "request") as Extract<CallTrace, { event: "request" }>[];
	assert.equal((requests[0]!.request as { systemPrompt: unknown }).systemPrompt, system, "the first sight is written in full");
	assert.deepEqual((requests[1]!.request as { systemPrompt: unknown }).systemPrompt, { sha256: (requests[1]!.request as { systemPrompt: { sha256: string } }).systemPrompt.sha256 });
	assert.deepEqual((requests[2]!.request as { tools: unknown }).tools, { sha256: (requests[2]!.request as { tools: { sha256: string } }).tools.sha256 }, "tools repeat independently of the prompt");
	assert.equal((requests[2]!.request as { systemPrompt: unknown }).systemPrompt, "other");
	assert.ok(JSON.stringify(requests[1]!.request).length < 400, "the repeat is small");
	const expanded = expandTraces(events).filter((event) => event.event === "request") as Extract<CallTrace, { event: "request" }>[];
	expanded.forEach((event, at) => {
		assert.deepEqual(event.request, sent[at]);
		assert.equal(event.size.bytes, Buffer.byteLength(JSON.stringify(sent[at])), "size reports the request as sent");
	});
	assert.throws(() => expandTraces(events.slice(2)), /not written earlier/, "a slice without the first sight cannot be expanded silently");
});
