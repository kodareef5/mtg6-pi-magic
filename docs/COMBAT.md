# Combat, characteristics, and what to automate

The broad foundation for the part of the engine that has to be right before any
card matters. Rule numbers point at `rules/cr.tsv`.

Everything here is built as a seam, because the automation questions are the
ones most likely to be reopened. The last section names each seam and what
moves if it changes.

## Nothing is calculated and stored

A creature's current power is not a field. It is derived, every time it is
asked for, from printed values plus standing notes plus counters, in the order
613 fixes, which is not the order they were written in.

That is the single most important sentence in the engine. A build that writes a
number onto a creature when an effect resolves is wrong in a way that looks
right for a long time, and then a creature that loses its abilities keeps a
bonus that came from one.

### The layer walk

613 in order: copy, control, text, type, color, ability, then power and
toughness last in four sublayers.

| Sublayer | What applies | Rule |
|---|---|---|
| 7a | Characteristic-defining abilities that set power or toughness | 613.4a |
| 7b | Effects that set power or toughness to a value, including base | 613.4b |
| 7c | Effects **and counters** that modify power or toughness | 613.4c |
| 7d | Effects that switch power and toughness | 613.4d |

Counters live in 7c with ordinary modifiers. `design-ref/archive/SYNTAX.md` lists them
as a separate sublayer after modifiers, with switching fifth. The rules and
`design-ref/archive/WORKED-LOOPS.md` section I.4 agree with the table above, so the
syntax document is the odd one out and `src/core/syntax.ts` carries the correct
set.

Within one layer, effects apply in timestamp order, with dependency handled
first. A keyword counter participates in the ability layer: a flying counter
placed after an effect that removed all abilities grants flying, and one placed
before it does not.

### What a combat calculation reads

Power and toughness at the moment they are asked for, every time. Marked
damage, which is not a counter and is not a characteristic. Keywords, which are
derived too: first strike gained after blockers are declared still works, and
one lost after damage is assigned does not undo the assignment.

## The combat phase

506 to 511. Five steps, and three of them are turn-based actions rather than
anything a card does.

```
beginning of combat        priority only
declare attackers          turn-based action, then priority
declare blockers           turn-based action, then priority
combat damage              assign, deal, then priority
  [an extra damage step first when first or double strike is present]
end of combat              priority only
```

### Damage assignment, 510.1

A turn-based action with real decisions in it. The active player announces how
each attacking creature assigns its damage, then the defending player announces
the same for blockers.

- Each creature assigns damage equal to its power. Zero or less assigns nothing.
  510.1a.
- Unblocked goes to the player, planeswalker or battle being attacked. 510.1b.
- Blocked goes to the creatures blocking it, in the order chosen. 510.1c.
- The **total** assignment has to be legal, not each creature's separately.
  510.1e. Lethal damage has to be assigned to each blocker in order before any
  goes to the next one, and lethal counts damage already marked.

This is the decision that must show its work. "Four power, the first blocker
needs two because it already has one marked, so two and two" is checkable.
"I assign four damage" is not. The engine states the facts and enumerates the
legal divisions; it does not pick one.

Most of the time there is exactly one legal division, and then nobody is asked.

### Dealing it, 510.2

All assigned combat damage is dealt **simultaneously**. No player acts between
the assignment and the damage, and nothing triggers in the gap. One committed
group, because cards watch for simultaneity: two creatures dying together is
not two deaths.

Then triggers go on the stack and state-based actions run before the active
player gets priority. 510.3, 510.3a.

### First strike and double strike, 510.4

If any attacking or blocking creature has first strike or double strike as the
combat damage step begins, only those creatures assign damage in that step.
Then a second combat damage step follows, in which the creatures that did not
assign damage, plus the double strikers, assign theirs.

Two consequences worth holding. The check happens **as the step begins**, so a
creature granted first strike after that point does not get an extra step. And
a creature that dies in the first step assigns nothing in the second, which is
most of what first strike is for.

### What damage does, 120.3

Damage is not one thing. The result depends on the source's characteristics and
the recipient's.

| Recipient and source | Result | Rule |
|---|---|---|
| Player, ordinary source | lose that much life | 120.3a |
| Player, source with infect | that many poison counters | 120.3b |
| Planeswalker | remove that many loyalty counters | 120.3c |
| Creature, source with wither or infect | that many -1/-1 counters | 120.3d |
| Creature, ordinary source | that much damage marked | 120.3e |
| Any, source with lifelink | controller gains that much, as well | 120.3f |
| Player, combat damage from a creature with toxic | poison counters equal to its toxic value, as well | 120.3g |
| Battle | remove that many defense counters | 120.3h |

So "deal damage" is one motion with a branch on the source, and marked damage
is the ordinary case rather than the only one. Marked damage is wiped at
cleanup. A -1/-1 counter is not.

Deathtouch is separate again: it makes any nonzero damage lethal, which changes
what counts as lethal for assignment ordering, not what the damage does.

## Tokens, copies, and type comparisons

**Tokens**, 111. A token exists only on the battlefield. A token that leaves
ceases to exist, which is not the same as being exiled: nothing can bring it
back and nothing sees it in another zone. It is still a zone change, so the
usual leave-the-battlefield triggers fire and the incarnation rises.

**Copies**, 707. A copy takes the copiable values, which means printed values
plus other copy effects, and not the current ones. A creature that is 5/5
because of a counter is copied as its printed self. This is layer 1, so every
later layer applies on top of the copy.

**Creature type comparisons.** Types are derived in layer 4, so a comparison
reads the current type set and never the printed line. Changeling counts as
every creature type. A card that checks "shares a creature type" has to ask the
derived set on both sides, at the moment it asks.

## What the engine does without asking

The table owns the turn. Untapping, drawing for the turn, state-based actions,
emptying mana pools at every step boundary, and a priority window with nothing
in it but a pass all happen with nobody asked. That is `forced`, and it is most
of the decisions in a game.

A card's instruction belongs to the seat resolving it, and a damage assignment
with more than one legal division belongs to the player assigning it. A seat
that wants the table to take single-option steps on its behalf says so in its
intent, and the ledger records that as `delegated` rather than `forced`.

## The seams

Named so that changing one is a known-size job rather than an archaeology
expedition.

| Seam | Where | What moves if it changes |
|---|---|---|
| Which layer an effect acts in | `syntax.ts`, the `Layer` type | Nothing else. A card says a layer and the walk reads it. |
| The layer walk itself | one function in the characteristics reader | Every derived value, which is why it is written once and tested against the worked examples. |
| How damage assignment is offered | the turn-based options builder | The option list only. The legality rule stays in one place. |
| Which steps exist in a turn | the step list on the table | Nothing structural: the list is walked and can be edited mid walk, which is what an extra combat phase already is. |
| What counts as forced | `automatic()` in `loop.ts`, four lines | The ledger's mix of forced against asked, and the cost of a game. Nothing about legality. |
| What a seat may delegate | the intent record | Only which single-option steps the table takes for that seat. |
| Damage results per source | one branch in the damage motion | Adding toxic or a new flavour of damage touches that branch and nothing else. |
| Marked damage versus counters | the table's state shape | Cleanup, and nothing in combat, because one is wiped and the other is not. |

The rule that keeps those seams honest: no derived value is ever stored. If a
change would be easier by caching a power, that is the signal that the walk is
in the wrong place, not that caching is a good idea.
