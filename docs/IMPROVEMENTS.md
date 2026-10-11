# Phase two: breadth and complete games

October 10. The measuring phase is closed: Haiku 5.5 medium writes strategy
and judges, one coordinator writes each plan, and eighty-four games on one
matchup played legally and replay-exact. Strength tuning stops here. The next
phase widens the card pool and collects whole games to find what the engine
and the models cannot yet play. [Plans](PLANS.md) stays the gameplay contract;
[Status](STATUS.md) holds results.

## Goal

Random Standard pairings from a pool of about twenty current meta decks, two
games at a time, Haiku against Haiku, every game saved. No arm comparisons.
Each finished batch yields a ledger of broken concepts: cards refused as
unsupported, interpretations that failed, gaps, help requests and rulings.
Those drive engine and syntax work, ordered by how many decks they block.

## Next implementation chunk

The pool report includes every registered sideboard: 213 stored assessments,
94 refusals, five basic lands and no unassessed cards. Cast and damage event
queries, alternative casting prices, next-turn permission expiry, mana expiry
and standing casting restrictions now have replay coverage. Airbender Ascension,
Jennifer and Roku have stored assessments. All nineteen imported lists remain
blocked; the closest three lists each lack three assessments.

1. Add bounded private look and selection, selection from an earlier binding,
   and deterministic library ordering, starting with Aang at the Crossroads.
   Keep earned visibility through the whole sequence.
2. Extend selectors with unions, intersecting types and object comparisons where
   accepted terms require them. Aang, Swift Savior needs a creature-or-spell
   target; Thor needs Equipment-or-instant-or-sorcery in one selector. Appa needs
   any number of targets and per-object permission ownership.
3. Add cast-origin and actual mana-spent facts, then token copying where the
   source requires it. Interdimensional Web Watch needs restricted spending from
   exile and independent mana-color choices; Colorstorm Stallion needs spent-mana
   facts and token copying.

Start ordinary-deck games when two lists have complete standing coverage; a
required deferred use that cannot execute becomes the next recorded blocker.
Keep Jev, the current roster and two-game concurrency. Each mechanic lands in
its own commit with invariant tests and the type check passing. Reassessment
records costs and source-backed refusals; completed games retain their journals,
gaps, rulings and replay checks. [Status](STATUS.md) holds the current evidence.

## Steps, in order

1. **Decks as a formal list of names.** A deck file is counts by card name,
   main and sideboard, with a source and the card-file date it was checked
   against. Names must exist in the legal set; double-faced, split and
   adventure cards use their full `Front // Back` name, and an import maps a
   unique front name to it. `tools/decks.ts check` validates every list
   without a game; `tools/decks.ts import` reads the plain text form meta
   sites publish. A deck that fails stays out of the collection. Done.
2. **The pool.** The top archetypes of the October 2026 Standard metagame from
   mtgdecks.net and MTGGoldfish, one representative list each, about twenty.
   Cards refused as unsupported go on `cards/unsupported.txt` with the reason,
   and a refused deck is recorded, not dropped from the list of wanted decks.
   Done: nineteen imported, Boros Dwarves refused on legality.
3. **Card interpretations once per card.** Packages are per card, not per deck
   or opponent. Seating loads the read-only seed under `prepared/packages/`
   and compatible overrides in Pi's `magic/packages/` cache. It assesses missing
   cards and caches successes there. Bad files and failed writes emit notices;
   a game's accepted equipment stays in its journal. `tools/assess.ts` maintains
   the shipped seed explicitly.
4. **Any two decks.** `tools/matchup.ts --decks "A,B"` seats two collection
   decks by name with short labels; `tools/sim.ts --random N` draws seeded
   random pairings, alternates who plays first, and runs two games at a time.
   `/magic play random` does the same inside Pi. The two tools are done; the
   Pi verb is done.
5. **Deck guides.** One write-up per deck under `decks/guides/`, written once by
   the pregame model from the list and card text: how the deck is designed to
   be played, its engine, sequencing, mulligans, what beats it. The brief
   wave reads the two guides as inputs, so matchup briefs start from a
   considered account of each list rather than from the raw cards.
   `tools/guide.ts` writes them; none is written yet.
6. **The loop.** Run a batch, read the ledger, fix the top blocker in core or
   syntax with its offline test, add back the decks it unblocks, run again.
   Keep every game: the saved journals are the benchmark material. First
   pass done: the audit in [Status](STATUS.md) ranks the blockers; shock
   lands, Verges and turn-counted entry are built and their 24 cards stored.
   Shared face mechanics and their fresh assessment are now built. The next
   implementation chunk above names the remaining shared operations. General
   copies and control changes remain separate work after those gaps.

## Judged how

Not by wins. A batch is good when every game finishes with no gap, every deck
in the pool registers, and the ledger of broken concepts shrinks between
batches. Cost and time per game are reported, not optimized.

## Retained

- The payment forecast keeps its checks before an unknown continuation.
- An own-turn answer must keep or replace `steps` and `theirTurn` explicitly.
- Interpretation refusals name every compared field.

## Rejected, do not repeat

Context trims, a choose/write split, narrower analyst questions, a
win/survival/development objective, optional checked fragments, plan before
rationale, pilot tap annotations, automatic combat-fact attachments, the draft
rehearsal interface, the analyst wave, and Luna-low prompt work on growth
lethal. Details in the ignored evidence directories.
