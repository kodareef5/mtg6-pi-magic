# Gameplay status

The alpha covers the main decks of nineteen imported legal Standard lists.
Tournament files retain their sideboards; alpha journals register an empty
sideboard explicitly. Boros Dwarves remains excluded because its list fails
Standard legality. Every main-deck card still needs source-backed standing
terms and a complete use inventory before setup.

Jev pilots, Sol 6.1 high prepares briefs, and Haiku 5.5 medium writes strategy
and judges. Summary remains off. Playing strength is unproven; this round
measures whether ordinary games can execute their cards correctly.

| Measure | Current evidence |
| --- | --- |
| Imported main decks admitted to setup | 9 of 19: 4c Control, Selesnya Landfall, Izzet Spellementals, Azorius Control, Boros Dragons, Boros Tokens, Izzet Aggro, Rakdos Lizards, Izzet Prowess |
| Completed source-reviewed alpha games | 29, covering all nine admitted decks; corrected Azorius versus Landfall and Prowess versus Rakdos passed review |
| Imported lists facing each other | All three pairings among Control, Landfall and Izzet completed in both seat orders; four earlier Azorius finishes were withdrawn after a mana-source audit |
| Replay and clone continuation | Every counted game matched replay and continuation from three saved prefixes |
| Current runtime work | Two saved continuations stopped on provider credits; corrected Sleight of Hand passed local replay and awaits a live continuation |
| Recent shared mechanics | Complete payments with explicit remaining resources; plot with later-turn casting; private face-down exile and continuing play conditions; stun-counter untap replacement |
| Stored card assessments | 251 accepted, 57 refused, five basic lands; Bant needs Interdimensional Web Watch |
| Main-deck guides | All 19 written; 57 provider calls, $0.8770 reported |
| Validation | Type check and 286 invariant tests pass |
| Matchup brief reuse | A fresh reversed-seat game reused both cached briefs and made zero pregame calls; its first pairing made 15 |
| Rejected evidence | Four Azorius finishes supplied both colors from Deserted Beach and are withdrawn. Four corrected Dragons continuations replace the excluded stun runs; earlier source failures remain excluded |
| Bills | Reported costs omit calls whose provider supplied no cost; missing usage and cost counts accompany each result |

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
keeps observed game failures ahead of further breadth work.
