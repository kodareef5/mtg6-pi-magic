# Combat, characteristics, and what to automate

Design notes for combat and derived characteristics. The layer walk is
implemented in `src/core/characteristics.ts`; attack and block choices and
damage assignment are unfinished. Rule numbers refer to the
committed `rules/cr.tsv`; these notes do not describe working combat support.

## Nothing is calculated and stored

A creature's current power is not a field. It is derived, every time it is
asked for, from printed values plus standing notes plus counters, in the order
613 fixes, which is not the order they were written in.

Caching a bonus when an effect resolves can leave that bonus behind after the
creature loses the ability that supplied it.

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

The seat selects attackers or blocker pairs, then finishes the declaration.
Before finishing, it can withdraw any pending selection with `unattack:` or
`unblock:` and select it again. Withdrawal moves no card, taps nothing and
triggers nothing. It cannot change a finished declaration. Both the selection
and withdrawal remain recorded decisions; no automatic correction or finish
occurs. Rule conflicts remain marked choices.

### Damage assignment, 510.1

A turn-based action with real decisions in it. The active player announces how
each attacking creature assigns its damage, then the defending player announces
the same for blockers.

- Each creature assigns damage equal to its power. Zero or less assigns nothing.
  510.1a.
- Unblocked goes to the player, planeswalker or battle being attacked. 510.1b.
- A blocked attacker divides damage among its blockers as its controller
  chooses. Ordinary assignment has no blocker order or lethal-before-next
  requirement. 510.1c.
- A creature blocking several attackers divides damage among them as its
  controller chooses. 510.1d.
- Check the total assignment, including applicable restrictions and abilities.
  510.1e.

The menu must show power, marked damage and any abilities that affect assignment.
For example, a four-power attacker facing two blockers can divide its four
damage between them. The player chooses among the offered divisions.

### Dealing it, 510.2

All assigned combat damage is dealt **simultaneously**. No player acts between
the assignment and the damage, and nothing triggers in the gap. One committed
group, because cards watch for simultaneity: two creatures dying together is
not two deaths.

Before the active player receives priority, state-based actions run and waiting
triggers go on the stack, repeating those checks as required. 510.3, 117.5.

### First strike and double strike, 510.4

If any attacking or blocking creature has first strike or double strike as the
combat damage step begins, only those creatures assign damage in that step.
A second damage step follows. Its eligible creatures are those that had neither
first strike nor double strike as the first step began, plus the remaining
creatures that currently have double strike.

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

Deathtouch affects lethal assignment where relevant, such as trample, and the
state-based destruction check after damage. It does not impose blocker order.

## Tokens, copies, and type comparisons

**Tokens**, 111.7-8. A token that leaves the battlefield reaches its destination;
zone-change triggers can see that move. It cannot move again or return, and
ceases to exist at the next state-based check. Token lifecycle and those
triggers remain unfinished.

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

## Implementation boundaries

`syntax.ts` names the layers and physical changes. `turn.ts` and `steps.ts` own
turn obligations and step order; `combat.ts` builds the three combat
turn-based actions, and `characteristics.ts` is the layer reader. `loop.ts`
accounts for forced and delegated actions. Derived characteristics stay out of
stored state.

A finished block exposes its recorded assignment until the next physical
decision, within the initial declare-blockers priority window. A model-backed
seat with a judge may object directly. The judge reads a publicly reconstructed
pre-declaration position; current conflict hints do not decide historical
legality. See [the objection contract](history/2026-10-07-block-objections.md).
