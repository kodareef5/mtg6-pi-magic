/**
 * Seat names: the shape rule, and that a seed replays them.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { claim, generate, valid } from "../src/core/names.ts";

test("letters, digits and hyphen up to 20", () => {
	for (const ok of ["jev", "Seat-1", "a", "x".repeat(20), "casting-goblin"]) {
		assert.equal(valid(ok), true, ok);
	}
	for (const bad of ["", "x".repeat(21), "two words", "emoji-🙂", "semi;colon", "slash/es"]) {
		assert.equal(valid(bad), false, JSON.stringify(bad));
	}
});

test("the same picks give the same name", () => {
	const fixed = () => 0;
	assert.equal(generate(fixed), generate(fixed));
	assert.equal(valid(generate(fixed)), true);
});

test("a taken name is skipped rather than reused", () => {
	const first = generate(() => 0);
	let calls = 0;
	// Walks off the first pair once it is taken.
	const second = generate(() => (calls++ < 2 ? 0 : 1), new Set([first]));
	assert.notEqual(second, first);
});

test("a duplicate is refused, not suffixed", () => {
	assert.throws(() => claim("jev", () => 0, new Set(["jev"])), /taken/);
});

test("a name of the wrong shape is refused with the rule", () => {
	assert.throws(() => claim("two words", () => 0, new Set()), /letters, digits and hyphen/);
});

test("no name asked for means one is generated", () => {
	assert.equal(valid(claim(undefined, () => 3, new Set())), true);
});
