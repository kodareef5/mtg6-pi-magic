# Strategy review cycle, October 6

Start from the completed gate at `552c2bb`, whose journal is under
`.pi/next-version-20261005/gate/`. Keep Jev and Luna low unchanged. Each example
is a journal prefix, so the replay supplies the original physical position and
accepted card terms. Full games wait until the focused failures improve.

## Source binding

The ordinary action catalog used card-name visibility. It consequently listed
casts for creatures already in play, including opponents' creatures. Offers,
readiness and the planning catalog now share the same source, zone and permission
reader. Current affordability and target availability remain separate. Unbound
prior intent stays visible to repair; absent equipment remains a lookup.

All 179 offline tests and types pass. Added positions cover a creature in play,
a second copy in hand, exile without permission, a permission opening next turn,
hand-only alternate costs and another seat's permission.

Three Luna low checks at decisions 44, 87 and 389 used six calls, 1m18s of summed
request time, 90,331 input and 3,831 output tokens, and $0.0078. They did not move
the original table. The first still copied an obsolete instruction to cast
Kellan from prior phase guidance. The second exhausted its corrections on query
and window syntax. The third submitted no ordered steps. These are failures to
improve strategic preparation, not evidence that the catalog change is enough.
The exact requests, answers and prefixes are in
`.pi/review-cycle-20261006/source-components-1791283332284/`.

## Next-turn position

Preparation previously mixed the opponent's current priority question and tapped
sources with a separate next-turn mana paragraph. It now receives one labelled
forecast after normal untap, with the known hand and no invented draw. Current
events remain observations, not events on the forecast turn. The forecast states
that it retains current characteristics and assumes the permanents survive.
The physical frame remains unchanged. A preparation must write ordered actions
or an explicit pass; branches alone do not stand in for the turn's line.

Repeating the same three prefixes produced accepted preparations in eight calls,
2m51s of request time, 136,084 input and 8,904 output tokens, and $0.0129. Red
planned attacks with the existing Kellan instead of another cast. Its later
position planned an upgrade rather than recasting Zhao. Green planned a
beneficiary before a fetch instead of returning no steps based on currently
tapped mana. The physical continuations still need checking. Syntax corrections
and resource conflicts remained, so this is not a speed improvement. Artifacts:
`.pi/review-cycle-20261006/source-components-1791283773873/`.

## Candidate payments and submission fields

The submit tool now describes ordinary queries, windows, steps and phase scripts
at their fields. Recursive conditions and card programs remain locally checked;
the tool has no recursive references. The three positions used six calls and
1m54s, but one accepted line still proposed Smaug with insufficient mana after
the forecast warning. Its saved answer is a regression example, not a successful
plan (`source-components-1791284166761/`).

Each source-bound action now includes a mana preview using the core payment
reader, both before new resources and after a named land drop. Entry restrictions
are included. Additional and variable costs are explicitly unpriced; this does
not prove an ordered line, targets or timing. The red and green positions then
each produced a preparation in one call, together 49.5s, 34,762 input and 2,564
output tokens, and $0.0039. Red stopped promising the unpayable Smaug cast. Green
ordered its beneficiary before the fetch. Artifacts:
`.pi/review-cycle-20261006/source-components-1791284677856/`.

Types and all 179 offline tests pass with these changes. The original gate's
710 ledger rows and every receipt also match replay after the shared source
reader change.
