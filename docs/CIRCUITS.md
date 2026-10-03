# Circuits, the syntax, and how a seat decides

This replaces four archived documents. `design-ref/README.md` says which and
why. Read `design-ref/HOW-MAGIC-WORKS.md` first: it is the physical ground
truth and nothing here contradicts it.

## The bet

A game state that has been broken down properly can be navigated by a model,
and a cheap model can navigate it fast if the pieces are the right size and the
way to manipulate them is clean.

That is the whole wager. Everything below is in service of it, and the thing
being bet against is the obvious alternative: hand a large model the board and
ask it what to do. That loses on cost, loses on consistency, and cannot say why
it did anything.

## Three nouns, and they are not the same thing

Keeping these apart is most of the design.

**The syntax is a toolbox.** A restricted set of TypeScript functions over
Magic: query objects in a zone, filter candidates, prefer some over others,
count things, compute an amount, assemble a cost, pick targets, order a
sequence, propose a physical operation. Written once, generically. Not one
entry per card.

**A circuit is navigation.** A structure built from the toolbox that a seat
walks by making choices. Closer to a phone menu than to a script, except the
whole menu is visible at once and backing out is free. Each answer can build
the next question, mechanically, from the tools.

**A draft is the working state a circuit edits.** The intended play as it is
being assembled: which sources, which targets, which order, what is reserved.
It is private to the seat and it is not the table.

## A recipe is a prepared draft

The strategy model writes recipes before they are needed: a starting structure
with its decisions left editable, for the plays this deck expects to make.
Funding a cast, assigning damage, picking targets, answering an obligation.

A seat can adopt a recipe whole, which is the shortcut, or open it and change
it. Opening the payment section of "advance the mana engine" and switching the
preference from keeping lands to keeping attackers is one choice, and it
changes which sources the next menu offers and what is left for a response
later.

A recipe is a starting point and never a cage. The playable space is always
larger than the recipe, and a route back out to the rest of it is part of every
circuit.

## The rule that makes this safe

**Circuit state and table state have different commit boundaries.**

Refining a query, changing a preference, reordering a draft or inspecting a
step changes the draft and touches nothing else. No card moves, no mana is
spent, and the table's revision does not advance. Selecting a filter is not
paying a cost.

Only an explicit execution step proposes operations against the table, and
those go through `commit` in `src/core/commit.ts` like everything else, carrying
their source, their purpose and the choices already locked.

Everything the engine already enforces keeps applying at that boundary and
nowhere earlier: one zone per object, identity on a zone change, nothing spent
that does not exist, nothing shown to a seat that has not earned it.

## What travels with the menu

The menu is not the whole message. Every question carries a condensed picture
of the game beside it, and that picture is always present rather than fetched:

- the objective, written plainly
- the strategy for this deck, and for this phase
- the recent turns, so the seat can tell what it is in the middle of
- which phase it is in, and the goals set for that phase
- what is already locked into the play being assembled, so none of it is
  argued again
- what is available to spend, with each source's own restrictions kept

Recent turns earn their place for a specific reason. A seat part way through a
plan has to be able to tell that it is part way through. A menu with no history
asks a model to re-infer the plan from the board every time, which is both
expensive and unreliable.

Three slots in `Packet`, in `src/context/packet.ts`, were named for this and are
empty today. `committed` is "choices already locked in this action" and is
hardcoded to an empty list. `options[].consequence` is what an option would do,
and nothing fills it. `routes` is the way back out, hardcoded empty, with
`follow` throwing. That is the concrete starting point: the shape anticipated
this and the fields are waiting.

## What the seat is actually asked to do

Not "pick a move". The instruction is to build a proper response to this state
and this phase, and the menu is how it gets built.

That difference changes the prompt and it changes the circuit. A seat asked to
pick hunts for the best item in a list. A seat asked to compose a response
walks a structure, adjusts the situation, looks at what changed, and commits
when it reads right. The second one tolerates a wider menu and gets more out of
it.

## Who does what, and what each costs

Three tiers, and the design succeeds or fails on how much of a turn sits in the
first two.

| Tier | Who | Cost |
|---|---|---|
| Recompute a menu after an ordinary change | the tools | free, no model call |
| Pick, refine, adopt, back out | the decision model | cheap, one classifier call over fixed ids |
| Prepare recipes, weigh a turn, reconsider a goal | the strategy model | expensive, called rarely |

**The sharp constraint, and the one to hold:** a circuit must be able to
produce its next menu without a model call. If advancing a circuit needs the
strategy model, the circuit is built wrong. The strategy model is called when
the prepared plan does not fit the board or when a card's meaning is missing,
not to move a seat one step along.

The existing cost discipline extends unchanged: a circuit node with one option
is not a decision. Take it, record it as forced, ask nobody. That ratio is why
a game costs cents instead of dollars, and it decays every time a safeguard
adds a question.

## What a choice inside a circuit can be

Not just "play this card". The useful list, from the plays we have thought
through so far:

- which zone, player, type or feature to look at
- which candidates to include, and which to leave out
- which resources to preserve
- which amount or consequence to compute
- which operation to add next, and in what order
- which part of a proposed sequence to look at closely
- adopt this recipe as it stands
- widen: drop a preference, expose another option, ask for another plan

Two illustrations, both from conversation rather than from a spec. A standard
pattern like `scry(player: self, amount: 1)` has a settled shape and exposes
its parameters, so a seat can aim it at another player or change the number. A
funding pattern can offer one complete payment as a shortcut, and opening it
exposes the source choice and the activation order with the remaining cost
visible at each gate.

These are sketches. The real vocabulary of nodes is not settled and is meant to
be found by building it.

## Some nodes gather instead of building

A node does not have to change the draft. Two kinds change only what the seat
knows, and both are cheap.

**Relevance selection.** "Of these cards, threats and rules, which bear on this
decision?" The answer narrows what the rest of the circuit carries. This is the
cheapest useful thing a classifier does, and the pattern is already proven in
shape: `src/context/ruling.ts` searches the rules mechanically for candidates,
has the classifier score each one for relevance, and hands only the survivors
to an expensive model. The same two steps work for cards and for threats.

**Asking for context.** The menu can offer "show me the rule for this". The
rules are on disk in `rules/cr.tsv` with a searchable reader in
`src/core/rules.ts`, so answering costs no model call at all. A seat that can
pull a rule into its own context mid decision is a seat that can check itself.

Neither moves a card. Both are the other half of the draft: the seat adjusts
what it is looking at rather than what it is doing.

## What this replaces, precisely

`design-ref/archive/CIRCUITRY.md` says options are concrete and nothing is
generated after a pick. For a staged circuit that is false by construction: the
next menu is generated after the pick, from the draft, by the tools.

What that rule was protecting is still true and is kept: **a seat never writes
a motion.** It answers with one id from a list the engine built. The ids now
include "narrow this to attackers" and "keep the Forest" as well as "play this
land", and every one of them is still an id the engine wrote down first.

`design-ref/archive/SYNTAX.md` builds a per card language and assumes a card is
fully structured before play. Cards do not compile. A card supplies facts and
instructions as context when they are needed, and the operations are generic.
Its measured vocabulary is still the best inventory of what the toolbox has to
be able to do, which is why it is archived and not deleted.

## How this gets built

By tooling it until it feels right, not by specifying it first. Establish the
philosophy, build a small amount, play with it, and let what is awkward decide
what changes. The examples are genuinely hard to imagine in advance, which is
an argument for building something navigable early rather than for designing
longer.

Driving a decision model this way is an unusual way of thinking, and the right
way to deploy it is not known yet. The work is imagining circuits, trying them,
and keeping the ones that make a seat play better for less. Most of the early
shapes will be wrong, which is the argument for building the toolbox so that a
new circuit is a small amount of code and throwing one away costs nothing.

So the first thing to build is whatever makes one real turn navigable end to
end, however narrow, with the three tiers visible and measured separately.

## Not settled

Written down because an honest list is worth more than a confident one.

- **The node vocabulary.** The list above is a sketch. Which kinds of choice
  earn a place, and whether they are one bucket with a parameter or several.
- **Menu width.** How many options at once helps a cheap model and where it
  starts hurting. This is measurable and nobody has measured it.
- **How much context helps.** The condensed picture beside the menu has the
  same question as the menu itself: there is a width past which more stops
  helping. The pregame already files its snippets by where they are read for
  exactly this reason, and the same discipline has to apply here.
- **Whether narrowing pays for itself.** A relevance call is a call. Asking
  which cards matter and then deciding costs two where deciding cost one, so it
  earns its place only where the narrowing makes the second answer better or
  lets it carry less. Worth measuring early, because the answer decides how
  freely gathering nodes can be used.
- **Where legality is checked, and how much.** The table enforces conservation
  and offers rules legality, and an opponent may object. If no card is
  structured, the engine cannot refuse an unfaithful operation, so the judge
  and conservation carry more weight than they do today. Both `declare` and
  the judge currently throw. This is the largest open question.
- **Whether a draft survives a window.** A prepared response that waits for an
  opportunity has to be rechecked when the board moves, and it is not decided
  what rechecks it or what happens when it no longer applies.
- **What belongs in a pattern library.** Scry, funding, damage assignment and
  target selection are obvious. The rest is unknown until a few turns have been
  played through.
- **How much card meaning is needed anyway.** The engine has to know something
  to enumerate a payment or offer a target. How little is enough is an open
  question, and the answer decides how much of the archived vocabulary comes
  back.
