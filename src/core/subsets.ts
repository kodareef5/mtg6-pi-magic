/** Every way to choose at most `most` items, and at least `least`. */
export function subsets<T>(items: T[], most: number, least = most): T[][] {
	const found: T[][] = [];
	const walk = (from: number, chosen: T[]) => {
		if (chosen.length >= least) found.push(chosen);
		if (chosen.length === most) return;
		for (let at = from; at < items.length; at++) walk(at + 1, [...chosen, items[at]!]);
	};
	walk(0, []);
	return found;
}
