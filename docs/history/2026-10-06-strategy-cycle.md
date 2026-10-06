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

## Amendments and physical continuations

The actual post-draw positions at decisions 64, 107 and 475 used five amendment
calls, 1m16s of request time and $0.0066. Each answer was accepted and saved into
its own cloned journal. The changes included the new draw and, for Green, the
loss of creatures and its fetch during the opponent's turn. These are under
`amend-components-1791284835939/`.

Red's turn 4 continuation cast Zhao and attacked with Kellan. Turn 6 upgraded
Kellan, attacked and resolved its damage trigger. They took 7.4s and 7.9s total,
29 and 31 Jev calls, and no foreground strategy wait. Both replays matched with
no recorded gap or fallback.

Green's turn 13 cast Explorer through an ordinary prepared option instead of
the duplicate planned option. The engine failed to credit that identical
announcement to the plan, then requested a repair for the resolved cast. The
continuation took 34s, including 22s of avoidable strategy wait. The repair also
introduced incorrect prose about creatures and land plays, showing why this
unnecessary call matters beyond latency.

Progress now matches an ordinary option to a planned procedure when all accepted
announcement terms, targets and payment are identical. Different modes remain
distinct; the original option id and chosen ledger reason stay intact. Repeating
the same cloned turn took 13.6s, including 11s of play, with the same 42 Jev calls
and zero foreground strategy wait. Replay matched with no gap or fallback. The
two versions are under `continuations/green-turn13/` and
`continuations/green-turn13-fixed/`. Types and all 179 offline tests pass.

## The next full gate and opening repairs

The same-seed gate `next-version-gate-20261005-1791285458578` started from version
zero at `af3d32f`, with the same carried preparation and testing roster. Its
early turns exposed invented ids such as `land:Forest`: the plan accepted them,
then requested a repair when the land play could not bind. Movement candidates
now arrive as reusable selectors. New literal ids must be actual offered picks
or the stable pass and declaration endings. This checks newly authored context
answers without changing old plans or replay semantics.

Two isolated opening amendments under `opening-components-1791285986918/`
accepted valid movement bindings in three Luna low calls, 11.8s total and
$0.0048. They still contain strategic mistakes: Red incorrectly says its newly
cast Kellan has haste, and Green misstates how many sources its land leaves.
Syntax acceptance is not a gameplay-quality result. The full gate also chose
empty searches after sacrificing fetch lands. Those resolution packets need
their own review before another complete game is justified.

The gate finished on turn 10: Red won, replay matched, and there were no recorded
engine gaps or fallbacks. Wall time was 10m04s, play 10m03s and foreground strategy
wait 8m54s. Jev made 272 picks, with no separate reviews. Strategy made 39 requests,
15 after a refusal, including one 150-second timeout followed by a successful
retry. The 311 requests reported 1,399,114 input and 46,299 output tokens and
$0.0826. One request lacked usage and cost. Preparation was carried, summary was
off and no judge was called. This is a failed gameplay review, not a comparable
speed win: Green's empty fetches and failed development shortened the game.

## Paid searches

The exact Jev questions at decisions 150 and 221 reproduced both empty searches
in all six baseline calls. Both offered a Forest and a distinct decline. They
carried old whole-turn guidance without an action-specific purpose. Relabelling
that old guidance alone was unreliable. Adding explicit execution guidance for
an already accepted search chose the Forest in all twelve checks, including
the variant that also relabelled the old guidance. No source fact or option was
removed. The 24-call comparison is in `fetch-packets-1791286175250/`.

The chosen correction tells Jev to fulfill the accepted search and its recorded
purpose; choosing none cannot postpone the paid action. An explicit failure-to-
find policy remains valid, and an uncovered exception can request help. Six
negative checks all honored an explicit instruction to find nothing. Both real
saved resolutions then selected Forest, moved it onto the battlefield and
completed the shuffle. Fabled Passage's conditional untap correctly did not
apply. Both journals replayed to the same ledger and objects. These physical
continuations and negative checks are in `fetch-replay-1791286296154/`.

The game JSON, compact text report and flame chart are beside the gate journal.
The existing timeline index now links this diagnostic run and the earlier gate,
and labels the before/after green-turn charts as partial continuations.
