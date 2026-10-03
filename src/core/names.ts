/**
 * Seat names. Set once when the game starts and never changed, because a log
 * that renames a seat halfway through is a log nobody can read.
 */

const VERBS = [
	"tapping", "scrying", "milling", "casting", "blinking", "forging",
	"hexing", "kindling", "looting", "probing", "raiding", "warding",
];

const NOUNS = [
	"sphinx", "goblin", "hydra", "golem", "wurm", "drake",
	"shade", "titan", "zombie", "angel", "beast", "imp",
];

/** Letters, digits and the hyphen, up to 20. A generated name uses the hyphen. */
const SHAPE = /^[A-Za-z0-9-]{1,20}$/;

export function valid(name: string): boolean {
	return SHAPE.test(name);
}

/**
 * `pick` comes from the table's recorded random, so a seed replays the same
 * names. 144 pairs, which is enough for eight seats and not enough to stop
 * checking for a collision.
 */
export function generate(pick: (bound: number) => number, taken: Set<string> = new Set()): string {
	for (let attempt = 0; attempt < 200; attempt++) {
		const name = `${VERBS[pick(VERBS.length)]}-${NOUNS[pick(NOUNS.length)]}`;
		if (!taken.has(name)) return name;
	}
	throw new Error("No free seat name after 200 attempts, which means pick is not random");
}

/**
 * A name a seat asked for, or a generated one. Refuses a duplicate rather than
 * suffixing it: two seats called the same thing is worse than being told to
 * pick again.
 */
export function claim(
	wanted: string | undefined,
	pick: (bound: number) => number,
	taken: Set<string>,
): string {
	if (wanted === undefined) return generate(pick, taken);
	if (!valid(wanted)) {
		throw new Error(`${wanted} is not a seat name: letters, digits and hyphen, 20 or fewer`);
	}
	if (taken.has(wanted)) throw new Error(`Seat name ${wanted} is taken`);
	return wanted;
}
