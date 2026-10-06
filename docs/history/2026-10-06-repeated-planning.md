# Repeated planning review, October 6

This round keeps Jev for execution and Luna low for every planning probe.
Pregame remains Sol 6.1 high. The six planning positions run three times per
arm. The nine already measured pilot positions are not repeated in the paid
comparison.

## Comparisons

The baseline is the planner at `0c5da50`, with the preserved-input runner from
`c042537`. The sequence variant changes post-draw amendments only: it keeps
ordered steps, branches and holds, clears general guidance and phase scripts,
and makes the historical plan a lookup. This differs from the preceding
round's sequence-repair patch, which also retired holds and only ran when the
prepared plan had mechanical problems. The exact new patch is retained beside
the results.

| Arm | Accepted plans | Action structure | Calls | Whole decisions | Catalog cost |
|---|---:|---:|---:|---:|---:|
| Baseline | 18/18 | 13/18 | 33 | 443.4 s | $0.037404 |
| Preserve sequence, refresh prose | 17/18 | 12/18 | 32 | 509.6 s | $0.033282 |
| Automatic permission forecasts and type queries | 18/18 | 9/18 | 31 | 658.2 s | $0.040387 |

These are small exploratory samples. The two processes overlapped for part of
the comparison; latency is descriptive, not a controlled speed estimate.
Unchanged preparation questions varied too. A pass states the recorded action
property, not the quality of the whole plan.

Both arms put Explorer before Forest in two of three amendments. Neither
attacked with established Zhao in any of its three amendments. The sequence
variant also omitted the new Zhao development in one funding-land case. One
unchanged preparation exhausted its three submissions on condition and window
shape errors. The variant does not establish an improvement and is not the
production default.

The permission arm used `511af8c`. Some answers found the newly described
graveyard Passage lines, so the Vein-specific old property does not capture
every useful alternative. But all three post-draw answers still played Forest
before Explorer, and two answers invented an `activate:` move prefix. The
automatic attachment is withdrawn. The forecast remains available through the
existing named-card equipment lookup, with offline coverage; that retrieval
placement is not a demonstrated playing-strength improvement.

The Green prose still confused available mana, future blockers and absent
protection. One sequence answer correctly said Veil was absent but the lexical
check matched "Keep any remaining green available; there is no Veil". This is a
false positive. Another answer can avoid the matched wording while inventing
an earthbent blocker. The runner records text matches separately; a card-name
scan is not a factual validator. No production plan is rejected for naming a
card that is absent, hypothetical, in the graveyard or controlled by an opponent.

## Retained machinery

Benchmark journal prefixes and accepted preparations now live as compressed,
committed fixtures under `test/fixtures/benchmarks`. They preserve full game
knowledge for replay and are excluded from the package. The old correct-order
and incorrect-order answers are preserved too, including their prose defects.
The runner expands selected journals in a temporary directory and removes the
copies on exit. It needs no `.pi` input.

`objects.types` now matches any listed current type on projected objects, with
the other query fields narrowing the result. It does not inspect hidden cards
or read Oracle prose. This addresses refusals reproduced again in this round.

Permission forecasts use the existing allowance reader with assumed accepted
registrations. For an ordinary permanent cast, the context names the changed
land allowance and currently visible owned lands in newly opened zones. A
graveyard Vein can therefore be shown after Explorer resolves. This does not
resolve the spell, invent a milled card, implement conditional permissions or
alter current offers. Source bindings and casts use the existing readers.
The writer now refuses a newly invented move family such as `activate:` instead
of installing an unreachable step. Existing move families and prefixes of
actually listed options remain usable; accepted historical plans are not
rewritten. Future activations can reuse accepted procedures from equipment.

## One turn through the real seat loop

The continuation cloned the old gate at decision 475 and played through turn
13, stopping at turn 14. It took 38.6 seconds overall, 36.7 seconds of play,
with 43 Jev calls and three strategy calls, one cancelled. Strategy wait was
23.2 seconds. Replay matched; there were no gaps or fallback decisions. Reported
cost was $0.0168; the cancelled call supplied no usage, so this is the measured
portion, not a claim that cancellation was free.

Green cast Explorer before the hand Forest. Its triggers resolved and made
Explorer a 4/6 creature. The pilot then asked for help. The exact request showed
Explorer, one remaining land play and visible graveyard lands. The accepted
repair instead described Forest 0-19 as a 2/2 creature, denied another land play
and passed without using it. It also described an unfavorable first-strike
block as a trade. This was false strategic guidance despite correct projected
facts, not missing card text or a replay discrepancy.

The pending request is now the sixteenth saved benchmark, `after-explorer-repair`,
at decision 506 before the answer's equipment row. The journal prefix and bad
answer are committed. Its action property accepts any visible graveyard land;
the original answer fails. This local result does not support spending another
full game before the repair question is improved.

Three further repair probes each submitted in one call. Two included a
graveyard land play, but all three retained imaginary creature-land guidance
or combat steps. The case now also forbids attacking with Forest in this exact
position. This additional property was added after review; the three saved
answers fail the combined check. It is a stronger regression case, not a
retroactive claim that the earlier benchmark measured this defect. The probes
confirm that selecting a useful land and describing the board correctly are
separate requirements.

## Preparation and waiting

The previous gate's late preparations began near the start of the opponent's
turn. Their request traces and recorded turn boundaries show:

| Own turn | Preparation requests | Time available before turn boundary | Finished after boundary |
|---|---:|---:|---:|
| 4 | about 30 s, two calls | about 25 s | about 6 s |
| 8 | about 45 s, two calls | about 12 s | about 33 s |
| 10 | about 35 s, two calls | about 25 s | about 10 s |

These are boundary measurements, not the later draw's exact wait. Future
consumed preparations record queue, start, finish and needed-at timestamps,
plus the source turn and version. The compact report separates unfinished
preparation wait from total strategy wait and counts timed-out strategy calls.
Starting another preparation later would shorten these available windows.

Foreground planning now retries the same request after 45 seconds, preserving
the model, question and serial retry policy. Background preparation keeps its
150-second limit. A double that ignores cancellation proves that the deadline
still releases the wait, aborts the first request and meters both attempts.
Cancellation by the owner remains distinct from a timeout.

## Cache evidence

The local Pi adapter passes `sessionId` as `prompt_cache_key`. Exact-key tool
enums vary with the position, and the current application key hashes the full
system and tool definitions. In the repeated baseline, first requests for new
positions were cold; repeated identical positions reused about 16K to 22K input
tokens. Refusal follow-ups also reused their prefix.

Changing only the key is not a demonstrated remedy. OpenAI's
[prompt-caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching)
states that tool definitions participate in the rendered prefix and must match
for reuse; current models handle routing automatically. The key and schemas
remain unchanged pending a separate comparison that preserves action-reference
accuracy. A stable brief message alone cannot recover a prefix broken by an
earlier varying tool schema. No cache speed improvement is claimed here.

## Evidence

Local output lives under `.pi/review-repeat-20261006/`: `baseline/`,
`sequence/`, their source patches, `comparison.json`, and `permissions/` for
the next repeated component check. Each arm retains full requests, replies,
individual bills and accepted plans. All 179 offline tests and types passed
for each retained implementation commit.
`continuation/` holds the one-turn game, compact result and timeline;
`repair/` holds repeated probes of its newly preserved help request.
