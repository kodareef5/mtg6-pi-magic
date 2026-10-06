# Private game benchmark inputs

These compressed journal prefixes preserve the full game knowledge needed for
replay. They are committed regression inputs, not spectator exports. `test/`
is excluded from the published package.

- `oct5.jsonl.gz`: prefix 475 of
  `next-version-gate-20261005-1791250809663`.
- `oct6.jsonl.gz`: prefix 235 of
  `next-version-gate-20261005-1791285458578`.
- `preparations.json`: the three accepted plans from the October 6 component
  review, with their source path updated to the preserved October 5 journal.
- `good-landfall.json` and `bad-landfall.json`: accepted answers with correct and
  incorrect action ordering. Both still have prose problems; the names refer
  only to the original ordering property.
- `after-explorer.jsonl.gz`: prefix 506 of the October 6 continuation
  `next-version-gate-20261005-1791294571883`, ending after the help request and
  before work row 116 accepts its answer. Cutting at that journal line preserves
  the exact pending request within a physical version. `bad-explorer-repair.json`
  keeps the failed benchmark answer, which the game itself had accepted.

Prefixes were copied through `journal.fork`, retaining accepted equipment,
briefs and rollback history. The manifest names individual earlier positions.
Regenerate a fixture from its source journal, never by editing physical facts
or deleting inconvenient records. `npm run benchmark` checks all prefixes
against the pinned cards and rules without inference.
# Blocked lethal continuation

`blocked-lethal.jsonl.gz` is the prefix of
`.pi/grounded-repair-20261006/continuation-pending/next-version-gate-20261005-1791300535238.jsonl`
immediately before Red's accepted turn-14 amendment at decision 579.
`blocked-lethal-preparation.json` expands the actual preparation submission
(trace call 1) against Red's source frame at decision 506. Its displayed full
plan was checked for exact equality with the consumed base in trace call 71.
`bad-blocked-lethal.json` contains the accepted amendment that sent Kellan
alone into Explorer. These records carry private game knowledge and stay
outside the published package.
`good-blocked-lethal.json` is a manually authored answer checked by core and
then executed through Jev in `known-lethal-play/`; it won on turn 14 with replay
matching. It establishes an executable expected line, not a Luna success.
`partial-blocked-lethal.json` is the third blocked-lethal answer from
`.pi/grounded-repair-20261006/explicit-conclusions/results.json`. It casts and
attacks with Smaug but keeps both other attackers back, missing the win. The
strengthened property rejects that partial commitment while accepting the
executed known answer. It names one verified winning line; other winning lines
still need review rather than being classified as poor play by this check.

`held-vigilance.jsonl.gz` is decision prefix 592 of
`luna-proposal-play/next-version-gate-20261005-1791305906277.jsonl` in the same
private artifact directory. It preserves the actual accepted Luna plan from
the compact-question experiment, after Kellan and Smaug were selected and
before Jev omitted Sanctuary. The plan passed the attack-list property but
missed lethal when played. Its conflicting prose remains in the fixture.
