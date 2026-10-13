/**
 * The host's side of the wire: an HTTP server that hands out chairs and
 * answers each chair's guest.
 *
 * It owns no game. Everything a guest sees comes from two places: its chair,
 * which holds the frames the host's loop projected for that seat, and `view`,
 * which the host fills with the stage and what is public. It binds the loopback
 * address; a tunnel in front of it is what reaches another machine.
 */

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { SeatId } from "../core/types.ts";
import { chair, type Chair } from "./chair.ts";
import { HOLD_MS, PROTOCOL, formatInvite, mintInvite, type Agreeing, type Answering, type Briefing, type Claim, type Result, type State, type Welcome, type Working } from "./protocol.ts";

export type Hosting = {
	/** Everything but the chair's own part of a state, for the chair set up as `setAs`. */
	view(setAs: SeatId): Omit<State, "serial" | "ask" | "resets" | "agreement">;
	/** An equipment edit from a chair's guest, while the game waits. */
	work(setAs: SeatId, post: Working): Result;
	/** A chair's pregame brief, for the host to journal. */
	brief(setAs: SeatId, post: Briefing): Result;
	/** Told when a guest takes a chair. */
	claimed?(setAs: SeatId, guest: string): void;
	game: string;
	port?: number;
};

export type Hosted = Awaited<ReturnType<typeof hostTable>>;

export async function hostTable(options: Hosting) {
	const table = randomBytes(6).toString("hex");
	const chairs = new Map<SeatId, { chair: Chair; secret: string; token?: string; guest?: string; seen?: number }>();
	let serial = 0, waiting: (() => void)[] = [];
	const changed = () => { serial++; const now = waiting; waiting = []; for (const wake of now) wake(); };

	const send = (response: ServerResponse, status: number, body: unknown) => {
		response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
		response.end(JSON.stringify(body));
	};
	const refuse = (response: ServerResponse, status: number, refused: Extract<Result, { ok: false }>["refused"], message: string) => send(response, status, { ok: false, refused, message });
	async function body(request: IncomingMessage): Promise<unknown> {
		const parts: Buffer[] = [];
		let size = 0;
		for await (const part of request) {
			size += (part as Buffer).length;
			if (size > 1_000_000) throw new Error("The request is too large.");
			parts.push(part as Buffer);
		}
		return JSON.parse(Buffer.concat(parts).toString("utf8") || "null");
	}
	const holder = (request: IncomingMessage) => {
		const token = request.headers.authorization?.replace(/^Bearer /, "");
		return token ? [...chairs.entries()].find(([, one]) => one.token === token) : undefined;
	};
	const state = (setAs: SeatId, at: { chair: Chair }): State => ({ ...options.view(setAs), ...at.chair.seen(), serial });

	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", "http://host");
			if (request.method === "POST" && url.pathname === "/v1/claim") {
				const claim = await body(request) as Claim;
				if (claim?.protocol !== PROTOCOL) return refuse(response, 400, "bad-request", `This table speaks ${PROTOCOL}.`);
				const found = [...chairs.entries()].find(([, one]) => claim.table === table && one.secret === claim.secret);
				if (!found) return refuse(response, 403, "bad-invite", "No chair at this table has that secret.");
				const [setAs, one] = found;
				if (one.token) return refuse(response, 409, "seat-taken", `${one.guest} has already taken this chair.`);
				one.token = randomBytes(32).toString("base64url");
				one.guest = String(claim.name || "guest").slice(0, 40);
				changed();
				options.claimed?.(setAs, one.guest);
				return send(response, 200, { protocol: PROTOCOL, table, token: one.token, game: options.game, setAs } satisfies Welcome);
			}
			const held = holder(request);
			if (!held) return refuse(response, 401, "bad-invite", "Claim a chair first, and send its token.");
			const [setAs, one] = held;
			one.seen = Date.now();
			if (request.method === "GET" && url.pathname === "/v1/state") {
				const after = Number(url.searchParams.get("after") ?? -1);
				if (serial <= after) await new Promise<void>((wake) => {
					const timer = setTimeout(wake, HOLD_MS);
					waiting.push(() => { clearTimeout(timer); wake(); });
					request.on("close", () => { clearTimeout(timer); wake(); });
				});
				return send(response, 200, state(setAs, one));
			}
			if (request.method === "POST" && url.pathname === "/v1/answer") return send(response, 200, one.chair.supply(await body(request) as Answering));
			if (request.method === "POST" && url.pathname === "/v1/agree") {
				const post = await body(request) as Agreeing;
				return send(response, 200, one.chair.agree(post.what, !!post.yes));
			}
			if (request.method === "POST" && url.pathname === "/v1/work") return send(response, 200, options.work(setAs, await body(request) as Working));
			if (request.method === "POST" && url.pathname === "/v1/brief") return send(response, 200, options.brief(setAs, await body(request) as Briefing));
			return refuse(response, 404, "bad-request", `No ${request.method} ${url.pathname}.`);
		} catch (error) {
			if (!response.headersSent) refuse(response, 400, "bad-request", error instanceof Error ? error.message : String(error));
		}
	});
	await new Promise<void>((ready, fail) => { server.once("error", fail); server.listen(options.port ?? 0, "127.0.0.1", ready); });
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	return {
		base,
		table,
		changed,
		/** Open a chair for the seat set up as `setAs`: its invite, and the chair the host seats in the game. */
		open(setAs: SeatId, name: string): { invite: string; chair: Chair } {
			const before = chairs.get(setAs);
			if (before) return { invite: formatInvite({ base, table, secret: before.secret }), chair: before.chair };
			const invite = mintInvite(base, table), made = chair(name, changed);
			chairs.set(setAs, { chair: made, secret: invite.secret });
			changed();
			return { invite: formatInvite(invite), chair: made };
		},
		/** Who has taken the chair set up as `setAs`, and when it last asked anything. */
		guest: (setAs: SeatId) => { const one = chairs.get(setAs); return one?.guest ? { name: one.guest, seen: one.seen } : undefined; },
		async close() {
			for (const one of chairs.values()) one.chair.player.close();
			changed();
			server.closeAllConnections();
			await new Promise<void>((done) => server.close(() => done()));
		},
	};
}
