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
