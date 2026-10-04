# Card support

A game refuses to begin while any registered card with rules text has no
supported line in `cards/support.jsonl`. The target is every legal Standard
card, then Commander. A handful of cards may stay on the list below with an
apology; nothing is played as a simpler effect in the meantime.

## What a line is

One JSON object per card name. A supported line carries interpretations in the
procedure vocabulary (`src/core/work-language.ts`), one per ability or
permission:

- `timing: "spell"` casts the card. Omit `cost` and the table pays the printed
  mana cost. `spell.speed` and `spell.destination` say when and where.
- `timing: "land"` plays it as a land, with no cost, target or instructions.
- `timing: "mana"` is a mana ability. The table activates it inside a payment,
  never as a move of its own.
- `timing: "stack"` is any other activated ability, with its stated cost.

A todo line names what the card needs, in short phrases a report can count,
and one sentence of apology saying what already fits.

A card with no rules text needs no line: the table reads its type line, mana
cost and power/toughness from `cards/standard.tsv`. Basic lands tap for their
color from their basic land type (305.6).

The table checks timing, sources, payment and targets. It does not check that
a line matches its card. A wrong line plays wrong in every game until someone
corrects it, so authored lines are reviewed before they are trusted.

## Examples

A line with an `example` field is a reference for writing others, and the
authoring prompt receives every one. Mark a line as an example when it shows a
way of expressing an action that the next card will want. Llanowar Elves
shows a creature spell plus a mana ability used inside payments; Shock shows an
announced target and a literal amount.

## Coverage

```
npm run support               the matchup lists
npm run support -- --all      every Standard card
npm run support -- --write    author missing lines live through Pi
```

The report ranks needs by how many cards each one blocks. That ranking picks
the next vocabulary work.

October 4, 2026, pinned matchup lists: 41 cards, 5 playable. The top needs are
keyword abilities (20 cards), triggered abilities (17), conditions (12) and
counters (10). Authoring the 36 lines took 6 strategy calls and $0.057.

## Apology list

Empty. Cards land here only once the vocabulary has grown past them and they
still do not fit.
