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
| Completed source-reviewed alpha games | 23, covering sixteen admitted decks; Azorius Control, Boros Dragons and Boros Tokens need corrected finishes |
| Imported lists facing each other | All three pairings among Control, Landfall and Izzet completed in both seat orders; earlier source failures remain excluded |
| Replay and clone continuation | Every counted game matched replay and continuation from three saved prefixes |
| Current runtime work | Direct Typesafe Jev and CLI Haiku completed seven pairings in this round. Corrected Dragons and Landfall/Azorius continuations run with carried briefs; Control/Azorius and Boros Tokens prefixes are ready |
| Recent shared mechanics | Per-controller targets, combined mana values, solved Cases, explore completion, bound sacrifice costs, ninjutsu entry and waterbend payment |
| Stored card assessments | 3,459 accepted: 3,306 complete and 153 deferred; 1,667 recorded refusals; sixteen unassessed cards reserved for Dwarves and sideboards |
| Wider Standard qualification | All 4,818 outside-list candidates examined: 3,172 new complete, source-reviewed packages and 1,646 refusals; no unfinished submissions or new counted games |
| Main-deck guides | Original 19 written; 57 provider calls, $0.8770 reported |
| Validation | Type check and all 323 invariant tests pass: 237 fast and 86 whole-game |
| Matchup brief reuse | A fresh reversed-seat game reused both cached briefs and made zero pregame calls; its first pairing made 15 |
| Rejected evidence | Thirteen previously counted finishes are withdrawn for incorrect default token names, including all four Dragons continuations and both corrected Azorius finishes. The sixteen retained older finishes created no incorrectly named tokens. Earlier mana, stun and source failures remain excluded. Braided Net and Torch now use independent rule records; Net craft is restricted to sorcery timing |
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
`.pi/alpha-20261011/summary.md` and `.pi/alpha-play-20261012/summary.md`, beside the raw evidence. Earlier measurements
are retained under `design-ref/experiments/` and in Git history.
[The next implementation chunk](IMPROVEMENTS.md#next-implementation-chunk)
uses the completed wider qualification pass and its worklists. Dwarves and
sideboards remain later work. Game completion is a separate evidence gate.

[Inference routes](INFERENCE.md) documents the explicit CLI option.
[Standard coverage](COVERAGE.md) maps the remaining card and gameplay work.
