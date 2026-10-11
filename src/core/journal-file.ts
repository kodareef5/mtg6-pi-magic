/** Journals can exceed the runtime's single-string limit. Decode complete lines
 * from byte chunks, and repair only the final unterminated line. */
import { appendFileSync, closeSync, fstatSync, openSync, readSync, truncateSync } from "node:fs";

const CHUNK = 1024 * 1024;

export function* journalLines(path: string): Generator<{ text: string; complete: boolean; number: number }> {
	const file = openSync(path, "r");
	let pieces: Buffer[] = [], number = 0;
	try {
		for (;;) {
			const buffer = Buffer.allocUnsafe(CHUNK), size = readSync(file, buffer, 0, buffer.length, null);
			if (!size) break;
			let start = 0;
			for (let end = buffer.indexOf(10, start); end >= 0 && end < size; end = buffer.indexOf(10, start)) {
				const part = buffer.subarray(start, end);
				yield { text: (pieces.length ? Buffer.concat([...pieces, part]) : part).toString("utf8"), complete: true, number: ++number };
				pieces = []; start = end + 1;
			}
			if (start < size) pieces.push(buffer.subarray(start, size));
		}
		if (pieces.length) yield { text: Buffer.concat(pieces).toString("utf8"), complete: false, number: ++number };
	} finally { closeSync(file); }
}

/** Preserve every preceding byte, including historical rollback branches. */
export function repairTail(path: string): string | null {
	const file = openSync(path, "r"), pieces: Buffer[] = [];
	let start: number, end: number;
	try {
		end = fstatSync(file).size; start = end;
		while (start > 0) {
			const size = Math.min(start, CHUNK), buffer = Buffer.allocUnsafe(size);
			start -= size; readSync(file, buffer, 0, size, start);
			const newline = buffer.lastIndexOf(10);
			if (newline >= 0) { pieces.push(buffer.subarray(newline + 1)); start += newline + 1; break; }
			pieces.push(buffer);
		}
	} finally { closeSync(file); }
	if (start === end) return null;
	const tail = Buffer.concat(pieces.reverse()).toString("utf8");
	let complete = false;
	try { JSON.parse(tail); complete = true; }
	catch { /* Incomplete final JSON is discarded; earlier bytes remain untouched. */ }
	if (complete) { appendFileSync(path, "\n"); return null; }
	truncateSync(path, start);
	return tail;
}
