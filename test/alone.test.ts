/**
 * What the game does when nothing else is keeping the process alive.
 *
 * This file exists because a test runner hides the answer. Under `node --test`
 * there is always a timer or a socket keeping the event loop awake, so a bounded
 * wait that cannot hold the loop open by itself still looks like it works. It
 * does not: the process exits between the unanswered work and the timeout, and
 * the await never resolves. So the invariant is stated in a child process with
 * nothing else running.
 */

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const sit = fileURLToPath(new URL("../src/context/sit.ts", import.meta.url));

test("a bounded wait on work that never answers resolves rather than ending the process", () => {
	const child = `
		const { settle } = await import(${JSON.stringify(sit)});
		const left = await settle([new Promise(() => {})], 50);
		console.log("left", left);
	`;
	// execFileSync throws on a non-zero exit, which is the failure this states:
	// Node reports an unsettled top-level await and leaves with code 13.
	const out = execFileSync(process.execPath, ["--input-type=module", "-e", child], { encoding: "utf8" });
	assert.equal(out.trim(), "left 1", "the wait resolved and said what was outstanding");
});
