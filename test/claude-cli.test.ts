/** CLI transport preserves the chosen model, bounded authority, tool round trips and accounting. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeContext } from "@earendil-works/pi-ai";
import { claudeCli } from "../src/context/claude-cli.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { bill, tally } from "../src/context/spend.ts";
import { totals } from "../src/context/metrics.ts";

test("Claude CLI isolates seats, preserves tool results and model identity, accounts estimates, and stops failed children", async () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-cli-test-")), executable = join(dir, "claude"), captures = join(dir, "requests.jsonl");
	writeFileSync(executable, `#!/usr/bin/env node
import {appendFileSync,readFileSync} from 'node:fs';
const args=process.argv.slice(2), input=JSON.parse(readFileSync(0,'utf8')), mode=process.env.CLI_TEST_MODE;
appendFileSync(process.env.CLI_TEST_CAPTURE,JSON.stringify({args,input,cwd:process.cwd(),system:readFileSync(args[args.indexOf('--system-prompt-file')+1],'utf8'),ceiling:process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS})+'\\n');
if(mode==='wait') {setInterval(()=>{},1000);} else if(mode==='exit'){console.error('auth failed');process.exitCode=7;} else if(mode==='json'){console.log('bad JSON');} else {
 const found=input.messages.some(m=>m.role==='toolResult');
 const calls=input.tools.length ? [{name:mode==='tool'?'unoffered':found?'submit':'lookup',arguments:found?{word:'Dáin'}:{}}] : [];
 const actual=mode==='model'?'claude-sonnet-4-6':'claude-haiku-5-5';
 console.log(JSON.stringify({is_error:mode==='error',subtype:mode==='error'?'error_max_turns':'success',result:'CLI diagnostic',structured_output:{text:input.tools.length?'':'Dáin',calls},stop_reason:'end_turn',usage:{input_tokens:2,output_tokens:5,cache_read_input_tokens:7,cache_creation_input_tokens:3,output_tokens_details:{thinking_tokens:1}},total_cost_usd:0.123,modelUsage:{[actual]:{canonicalModel:actual,costBasis:'list'}}}));
}
`, { mode: 0o700 });
	try {
		const provider = claudeCli(executable), model = provider.getModels()[0]!;
		const stream: Stream = (model, context, options) => provider.streamSimple(model as never, normalizeContext(context as never),
			{ ...options, env: { CLI_TEST_CAPTURE: captures } });
		const counted = tally(), worker = reasoner({ role: "strategy", model, thinking: "medium", stream, tally: counted, attempts: 1 });
		const result = await worker.work("transport", { system: "Seat 0 private prompt", user: "Read and submit the word" }, {
			lookups: [{ name: "lookup", description: "Return a word, not game advice.", parameters: { type: "object" }, answer: () => "Dáin" }],
			submit: { name: "submit", description: "Check the word, not gameplay.", parameters: { type: "object" }, check: (args) => args.word === "Dáin" ? null : "Wrong word" }, turns: 3,
		}, 20);
		assert.deepEqual(result, { word: "Dáin" });
		assert.equal(counted.spent().length, 2);
		assert.equal(totals(counted.spent()).estimatedCost, 0.246);
		assert.equal(totals(counted.spent()).estimatedCostCalls, 2);
		assert.match(bill(counted.spent()).join("\n"), /not measured subscription cash spend/);
		const requests = readFileSync(captures, "utf8").trim().split("\n").map((line) => JSON.parse(line));
		assert.notEqual(requests[0].cwd, requests[1].cwd);
		for (const request of requests) {
			assert.equal(existsSync(request.cwd), false, "private temporary files removed after exit");
			for (const flag of ["--safe-mode", "--strict-mcp-config", "--no-session-persistence"]) assert.ok(request.args.includes(flag));
			assert.equal(request.args[request.args.indexOf("--tools") + 1], "");
			assert.equal(request.args[request.args.indexOf("--model") + 1], model.id);
			assert.equal(request.args[request.args.indexOf("--effort") + 1], "medium");
			assert.equal(request.ceiling, "100");
			assert.match(request.system, /Seat 0 private prompt/);
			assert.ok(!request.args.includes("--resume") && !request.args.includes("--continue"));
		}
		assert.ok(requests[1].input.messages.some((one: { role: string }) => one.role === "toolResult"));
		const context = normalizeContext({ messages: [{ role: "user", content: "Seat 1", timestamp: 0 }] });
		const ask = (mode: string, signal?: AbortSignal) => provider.streamSimple(model, context, { signal, env: { CLI_TEST_CAPTURE: captures, CLI_TEST_MODE: mode } }).result();
		const second = await ask("text"); assert.equal(second.content[0]?.type, "text");
		const privateRequest = JSON.parse(readFileSync(captures, "utf8").trim().split("\n").at(-1)!);
		assert.ok(!JSON.stringify(privateRequest).includes("Seat 0 private prompt"));
		for (const [mode, error] of [["model", /unrequested/], ["exit", /exited 7/], ["json", /invalid JSON/], ["error", /error_max_turns/]] as const) {
			const failed = await ask(mode); assert.equal(failed.stopReason, "error"); assert.match(failed.errorMessage!, error);
		}
		const controller = new AbortController(), pending = ask("wait", controller.signal);
		setTimeout(() => controller.abort(), 100);
		assert.equal((await pending).stopReason, "aborted");
		for (const line of readFileSync(captures, "utf8").trim().split("\n")) assert.equal(existsSync(JSON.parse(line).cwd), false);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
