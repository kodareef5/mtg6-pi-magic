# Gameplay status

The alpha admits nineteen of twenty imported legal Standard main decks.
Tournament files retain their sideboards; alpha journals register an empty
sideboard explicitly. Boros Dwarves now registers after fixing accent-free
exported names; thirteen main-deck cards still need assessment. Every main-deck card still needs source-backed standing
terms and a complete use inventory before setup.

Jev pilots, Sol 6.1 high prepares briefs, and Haiku 5.5 medium writes strategy
and judges. Summary remains off. Playing strength is unproven; this round
measures whether ordinary games can execute their cards correctly.

| Measure | Current evidence |
| --- | --- |
| Imported main decks admitted to setup | 19 of 20: 4c Control, Selesnya Landfall, Izzet Spellementals, Azorius Control, Boros Dragons, Boros Tokens, Izzet Aggro, Rakdos Lizards, Izzet Prowess, Bant Airbending Combo, Jeskai Artifacts, Dimir Excruciator, Dimir Midrange, Mono-Black Aggro, 4c Reanimator, Azorius Momo, Lifegain, Jund Sacrifice, Mardu Discard |
| Completed source-reviewed alpha games | 29, covering nine admitted decks; Bant, Jeskai, both Dimir lists, Mono-Black, Reanimator, Momo, Lifegain, Jund and Mardu await their first finishes |
| Imported lists facing each other | All three pairings among Control, Landfall and Izzet completed in both seat orders; four earlier Azorius finishes were withdrawn after a mana-source audit |
| Replay and clone continuation | Every counted game matched replay and continuation from three saved prefixes |
| Current runtime work | Direct Typesafe Jev and CLI Haiku have resumed a saved game without OpenRouter calls. Jace interpretation remains a preparation gap; corrected Sleight awaits continuation |
| Recent shared mechanics | Conditional native casting prices, required-attack warnings and physical Class levels |
| Stored card assessments | 3,459 accepted: 3,300 complete and 159 deferred; 1,667 recorded refusals; sixteen unassessed cards reserved for Dwarves and sideboards |
| Wider Standard qualification | All 4,818 outside-list candidates examined: 3,172 new complete, source-reviewed packages and 1,646 refusals; no unfinished submissions or new counted games |
| Main-deck guides | Original 19 written; 57 provider calls, $0.8770 reported |
| Validation | Type check and 320 invariant tests pass; fast and whole-game lanes |
| Matchup brief reuse | A fresh reversed-seat game reused both cached briefs and made zero pregame calls; its first pairing made 15 |
| Rejected evidence | Four Azorius finishes supplied both colors from Deserted Beach and are withdrawn. Four corrected Dragons continuations replace the excluded stun runs; earlier source failures remain excluded |
| Bills | Missing usage/cost counts accompany each result. CLI costs are list-price estimates. Direct Jev has unpriced zero entries in the installed Pi catalog; see Inference routes |

Standing coverage admits setup; it does not prove that every deferred use or
interaction works. A new runtime interpretation must fit its source, and a
finished game must pass source review as well as gap, replay and clone checks.
Each report writes a private `.source-review.md` with changed meanings, unused
preparation, announced programs and actual mana outputs beside pinned card text. It assists this
review without certifying play.
The [refusal ledger](../prepared/packages/2026-10-10/ledger.json) names remaining
standing blockers. Sideboard-only refusals do not delay this alpha.

Per-game seeds, journal paths, bills, continuations and review findings are in
`.pi/alpha-20261011/summary.md`, beside the raw evidence. Earlier measurements
are retained under `design-ref/experiments/` and in Git history.
[The next implementation chunk](IMPROVEMENTS.md#next-implementation-chunk)
uses the completed wider qualification pass and its worklists. Dwarves and
sideboards remain later work. Game completion is a separate evidence gate.

[Inference routes](INFERENCE.md) documents the explicit CLI option.
[Standard coverage](COVERAGE.md) maps the remaining card and gameplay work.
