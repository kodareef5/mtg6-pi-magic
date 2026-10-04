# The mulligan

The opening implements declarations, redraws, ordered bottom selections and
replay. Card-granted opening actions, computed odds and replacement-hand
comparisons remain unfinished.

Rule text is quoted from `rules/cr.tsv`, which is the official Comprehensive
Rules of September 25, 2026. Read 103.5 and 103.6 there rather than trusting the
summary below.

## The procedure

103.5, in the order the rules put it:

1. Each seat draws its starting hand size, normally seven.
2. The starting player declares whether it will take a mulligan. Then each
   other seat, in turn order, does the same.
3. Once every seat has declared, **all seats that declared a mulligan take it at
   the same time**: shuffle the hand into the library, draw a fresh starting
   hand.
4. Repeat from 2 until no seat declares a mulligan.
5. A seat that kept puts a number of cards on the bottom of its library equal to
   the number of mulligans it took, in any order it chooses.
6. 103.6: once the mulligan process is complete, the starting player may take
   any actions its opening hand allows, in any order. Then each other seat in
   turn order.

Two limits. A seat may take mulligans until its opening hand would be zero
cards, so seven in a seven card format. And 103.5c: in a multiplayer game and in
any Brawl game, the first mulligan does not count toward the cards to bottom or
toward the number of mulligans allowed.

### Bottoming timing

The implementation retains two format settings:

- `mulliganBottom: "on-keep"` is the default. Inspect the full hand, decide, then
  bottom after keeping.
- `mulliganBottom: "per-mulligan"` bottoms at the end of each redraw. The next
  declaration sees the smaller hand. This follows the ordering in the stored
  103.5 text.

Both paths have invariant tests. They expose different information at a
declaration; this cleanup does not change the setting or settle that rules
interpretation.

### What 103.5b allows

An effect may let a seat act "any time it could mulligan". That is a third
option at a declaration, not a replacement for one: the seat takes the action
and then declares. Serum Powder is the card that needs it. It is not built, and
a seat holding such a card is a gap until it is.

## The decisions

Declaration and bottom selections work. Card-granted opening actions remain a
gap; the current opening completes without interpreting them.

**Declare.** Situation `pregame`, one per seat per round, collected in turn
order before anything shuffles. Options: `keep`, `mulligan` when the opening
hand would not be zero, and one per permitted opening-hand action.

**Bottom.** Only for a seat that kept after at least one counting mulligan.
Choose which cards go to the bottom, and in what order.

Order is a real choice the rules give the player, so it is recorded, even though
it matters only when something later looks at the bottom of a library. The
option space is too large to list: three cards from seven is 210 ordered
choices. So it is collected one card at a time, with the remaining obligation
shown at every step, the same one-at-a-time selection combat declarations use. Seven options, then six, then five.

**Opening-hand actions.** 103.6, in turn order. Options come from cards in hand
that grant a pregame permission, which needs card structure to detect. With no
such card the only option is to do nothing, so nobody is asked.

## What a seat knows when it decides

**The hand**, exactly by card identity. Card data is available to pregame and
strategy; the classifier receives projected objects and relevant guidance.

**The count**: mulligans taken, and how many cards leave if this hand is kept.

**Play or draw.** Whether this seat is the starting player. It changes the value
of a slow hand and of a marginal land, and leaving it out makes the decision
guesswork. In a two-player game the starting player does not draw on turn one.

**Every deck's composition.** In a registered game each seat hands in a deck
list, so counts by name are known for every seat, including opponents. What is
unknown is arrangement: who holds what, and what sits where, until something is
revealed. That asymmetry is the whole reason expert mulligan decisions are
possible here, and `format.decksRegistered` is what says it applies.

**Odds, from this seat's own knowledge.** The chance of drawing what the hand
needs in the next one, two or three draws, computed over the seat's remaining
library. `odds.ts` specifies this boundary; the arithmetic is still unwritten.

**A distribution over replacement hands.** What a mulligan is actually worth.
Sampled from the seat's belief about its own library, not from the real one: a
seat knows its own deck composition, so sampling from that composition reveals
nothing and is honest. Reading the shuffled order would be cheating and is the
line to hold. This calculation is not implemented yet.

**Strategy guidance**, from `intent.ts`: how this deck wins, what it needs to
function, what it is willing to give up, and what the opponent's registered deck
means for all three. Prepared before the first hand, so it costs nothing per
decision.

## Who answers

Every kind of seat, through the same options.

A person picks `keep` or `mulligan`, then picks cards to bottom one at a time.
Nothing about that path is special.

A model seat receives the same declaration and single-card bottom options through
`focus`. Pregame guidance supplies assumptions, not a mandatory keep decision.
A future retained-hand comparison must expose alternatives; neither the expert
menu nor ordinary option widening is implemented yet.

## Failure, and what must never happen quietly

The last implementation defaulted to keeping when an answer was missing or
malformed, filled an invalid bottom choice from the tail of the hand, and marked
a seat as kept when applying a mulligan failed. All three decide for the player
without saying so.

The rules here:

- An unusable answer is asked once more. Still unusable: the table takes the
  terminating option, which is `keep`, records the ledger row as `fallback`, and
  writes a gap naming what came back. A fallback is not a choice and is never
  counted as one.
- An invalid bottom selection is refused and re-asked. It is never completed
  from the tail of the hand.
- A mulligan that fails to apply is an error, not a keep.
- There is no configured mulligan cap. The rules' limit is the limit, and a
  configured number that stops a seat early is a restriction masquerading as a
  strategic conclusion.

## What is public, and what is not

Public: each declaration, each seat's mulligan count, and each resulting hand
size. An opponent always knows you mulliganed and to how many.

Public also: registered deck names and counts. Private: which cards are in a
hand or bottom position, and the reasoning behind the decision.

That last one is a leak the last implementation had: a debug log printed the
keep reasoning, and the reasoning names cards. A seat's private information goes
nowhere, and a log is somewhere.

One thing a seat gains and keeps: the cards it put on the bottom are known
library positions for that seat afterwards. Its own draw odds must exclude them
from the top of the library until an order change says otherwise, which is
the intended region shape in `knowledge.ts`. Recording and updating that
knowledge remains unfinished.

## Resumability

Declarations, mulligan counts, kept seats and outstanding bottom choices live
in the table. Completion is derived from those obligations, without a separate
done flag. Every opening transition commits alongside its card motions, so
replaying receipts reconstructs a half-finished round too.

Journal replay and cloning preserve opening decisions and pending bottom
obligations. A prefix can freeze a position after mulligans without a separate
fixture format.

## Where the code goes

- `pregame.ts`: the procedure and listed choices for declaration and bottoming.
  Card-granted opening actions under 103.6 are still unwritten.
- `decisions.ts`: routes to pregame until its obligations settle, then routes
  to turn actions and priority. It never offers an opening choice during a turn.
- `odds.ts`: the replacement hand distribution, from belief.
- `intent.ts`: the guidance, prepared once.
- `knowledge.ts`: the bottomed cards as a known region.
- `format.ts`: starting hand size, which bottoming style the game uses, and
  whether the first mulligan is free, which is true in any multiplayer game and
  in any Brawl game.
