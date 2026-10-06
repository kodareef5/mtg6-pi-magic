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

Prefixes were copied through `journal.fork`, retaining accepted equipment,
briefs and rollback history. The manifest names individual earlier positions.
Regenerate a fixture from its source journal, never by editing physical facts
or deleting inconvenient records. `npm run benchmark` checks all prefixes
against the pinned cards and rules without inference.
