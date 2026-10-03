/**
 * The invite and the decoder. Nothing here needs the engine.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
	decode,
	encode,
	formatInvite,
	mintInvite,
	parseInvite,
	redactInvite,
} from "../../src/seating/protocol.ts";

test("an invite round trips", () => {
	const minted = mintInvite("127.0.0.1", 49321);
	const parsed = parseInvite(formatInvite(minted));
	assert.deepEqual(parsed, minted);
});

test("two invites share no secret or table", () => {
	const a = mintInvite("127.0.0.1", 1);
	const b = mintInvite("127.0.0.1", 1);
	assert.notEqual(a.secret, b.secret);
	assert.notEqual(a.table, b.table);
});

test("a redacted invite carries no secret", () => {
	const minted = mintInvite("127.0.0.1", 49321);
	const shown = redactInvite(minted);
	assert.equal(shown.includes(minted.secret), false);
	assert.equal(shown.includes(minted.table), true);
});

test("the secret rides in the fragment", () => {
	const minted = mintInvite("127.0.0.1", 49321);
	const [beforeHash] = formatInvite(minted).split("#");
	assert.equal(beforeHash?.includes(minted.secret), false);
});

for (const [why, bad] of [
	["garbage", "sit down please"],
	["wrong scheme", "https://127.0.0.1:49321/K8F2#aaaa"],
	["no port", "pimagic://127.0.0.1/K8F2#aaaa"],
	["no table", "pimagic://127.0.0.1:49321/#aaaa"],
	["truncated secret", "pimagic://127.0.0.1:49321/K8F2#tooshort"],
	["no secret", "pimagic://127.0.0.1:49321/K8F2"],
] as const) {
	test(`parseInvite refuses ${why}`, () => {
		assert.throws(() => parseInvite(bad));
	});
}

test("decode refuses what it does not recognise", () => {
	assert.equal(decode("{"), null);
	assert.equal(decode("null"), null);
	assert.equal(decode('"a string"'), null);
	assert.equal(decode(JSON.stringify({ type: "shuffle_their_library" })), null);
});

test("decode returns a known message", () => {
	const frame = {
		type: "frame" as const,
		seat: 5,
		version: 147,
		view: { table: ["Green at 20 life"], yours: ["Forest"], since: [] },
	};
	assert.deepEqual(decode(encode(frame)), frame);
});
