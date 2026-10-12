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
The initial alpha uses the nineteen imported main decks without sideboards.
`--alpha` on the assessment, guide, matchup and simulation tools selects that
scope. A new game registers the sideboardless copy and records it in its journal;
the tournament files retain their original lists. Main-deck cards remain subject
to the full standing and runtime-use requirements. Sideboard work is deferred
until the alpha decks complete ordinary games with replay and clone parity.
Each finished batch yields a ledger of broken concepts: cards refused as
unsupported, interpretations that failed, gaps, help requests and rulings.
Those drive engine and syntax work, ordered by how many decks they block.

## Next implementation chunk

Nineteen imported main decks have complete standing coverage. [Status](STATUS.md)
tracks source-reviewed finishes and withdrawn evidence. The wider qualification
pass is complete: 3,172 new
complete meanings from existing mechanics, with source-backed refusals for the
rest. Dwarves and sideboards remain later work. [Coverage](COVERAGE.md) defines
the preparation states, known source issues and resumable worklists. [Status](STATUS.md) holds
the current game evidence. Direct Jev and CLI Haiku have cleared the provider
funding blocker.

1. Finish the queued continuations and fill the remaining gaps in reviewed deck
   coverage, including replacements for withdrawn results. Use direct Jev and CLI Haiku,
   two games at a time, carrying each journal's accepted meanings and briefs.
   A stopped game supplies the next concrete runtime or interpretation fix.
2. Review every completed game's new procedures, exercised standing terms and
   casting opportunities against the pinned source. Repair before the first
   affected action, preserve rejected branches, and check replay and continuation
   from saved prefixes. Only then count a finish. Retain reviewed runtime uses
   in the reusable store, preserving target scope, order and additional costs.
3. Repair the imported source issues identified in Coverage before their affected
   interactions. Complete the original nineteen lists' first reviewed games
   before widening the pool. Repeat imported pairings in both seat orders using
   compatible saved briefs; exercise Grove's Bounty's announced division and
   the newer graveyard, discard, mayhem and returned-creature grants in play.
4. After those finishes, exercise representative newly prepared families through
   registered real decks. Revisit refusals with a concrete existing expression
   or a shared operation. Keep inference failures separate from unsupported
   meanings. Dwarves and sideboards remain later work.

Staged announcements are live. Priority chooses a use; X, targets, additional
costs and complete mana payments follow as recorded decisions, with individual
source selection available when needed. Large historical menus
use ordered hashes and counts in the journal. The Control versus Azorius
continuation finished and matched replay and three clone continuations.
Pregame requests have a fifteen-minute timeout independent of effort scaling.

One assessed imported list can play an established opponent; it need not wait
for a second imported list. A required deferred use that cannot execute becomes
the next recorded blocker.
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
   Twenty imported. Boros Dwarves previously failed name matching because the
   export omitted three accents; all its cards are legal in the pinned file.
   Its thirteen unassessed main-deck cards remain outside alpha admission.
   [Standard coverage](COVERAGE.md) maps this work and the wider card pool.
3. **Card interpretations once per card.** Packages are per card, not per deck
   or opponent. Seating loads the read-only seed under `prepared/packages/`
   and compatible overrides in Pi's `magic/packages/` cache. It assesses missing
   cards and caches successes there. Bad files and failed writes emit notices;
   a game's accepted equipment stays in its journal. `tools/assess.ts` maintains
   the shipped seed explicitly.
4. **Any two decks.** `tools/matchup.ts --decks "A,B"` seats two collection
   decks by name with short labels; `tools/sim.ts --random N` draws seeded
   random pairings, alternates who plays first, and runs two games at a time.
   `/magic play random` draws only admitted imported main decks, with no
   sideboards. `tools/sim.ts --random N --alpha` uses the same admission check;
   an explicitly named alpha pool refuses any list without standing coverage.
   Ordinary named games keep their full tournament lists.
5. **Deck guides.** One write-up per deck under `decks/guides/`, written once by
   the pregame model from the list and card text: how the deck is designed to
   be played, its engine, sequencing, mulligans, what beats it. The brief
   wave reads the two guides as inputs, so matchup briefs start from a
   considered account of each list rather than from the raw cards.
   All nineteen main-deck guides are written. Their scope and generation bill
   are in [the guide directory](../decks/guides/README.md).
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

### Matchup preparation reuse

Fresh games reuse complete briefs when both registered lists, roster, card and
rule contents, guides and prompt contract match. The brief addresses decks
relative to its owner and carries both play and draw opening policies, so a
new seed or seat swap reuses it. A cache hit is written into the new journal;
clones and resumed games retain their own preparation. Corrupt cache files
cause a notice and fresh preparation. Failed analysts never seed the cache.
Reports distinguish written, cached and carried briefs without inventing model
calls or saved-cost estimates.
