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
| Imported main decks admitted to setup | 3 of 19: 4c Control, Selesnya Landfall, Izzet Spellementals |
| Completed source-reviewed alpha games | 7, covering all three admitted lists |
| Imported lists facing each other | Selesnya beat Control; both Izzet versus Control seat orders reached a recorded blocker |
| Replay and clone continuation | Every counted game matched replay and continuation from three saved prefixes |
| Current runtime blocker | Impractical Joke's prevention prohibition is implemented; both saved Izzet versus Control games have continued past it |
| Recent shared mechanics | Adventure counts, chosen creature types, spent-mana spell properties, exile-until returns, collected-evidence payment and private inspection |
| Stored card assessments | 229 accepted, 78 refused, five basic lands; these totals include deferred sideboard work |
| Main-deck guides | All 19 written; 57 provider calls, $0.8770 reported |
| Validation | Type check and 248 invariant tests pass |
| Rejected evidence | Public inspection substitutes, reordered printed instructions and incorrect library incarnation changes remain excluded |
| Bills | Reported costs omit calls whose provider supplied no cost; missing usage and cost counts accompany each result |

Standing coverage admits setup; it does not prove that every deferred use or
interaction works. A new runtime interpretation must fit its source, and a
finished game must pass source review as well as gap, replay and clone checks.
Each report writes a private `.source-review.md` with changed meanings, unused
preparation and announced programs beside pinned card text. It assists this
review without certifying play.
The [refusal ledger](../prepared/packages/2026-10-10/ledger.json) names remaining
standing blockers. Sideboard-only refusals do not delay this alpha.

Per-game seeds, journal paths, bills, continuations and review findings are in
`.pi/alpha-20261011/summary.md`, beside the raw evidence. Earlier measurements
are retained under `design-ref/experiments/` and in Git history.
[The next implementation chunk](IMPROVEMENTS.md#next-implementation-chunk)
keeps observed game failures ahead of further breadth work.
