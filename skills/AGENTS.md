# Rules for text a model reads

Everything in this directory is read by a model mid game, with a decision in
front of it. The text is the rails. A seated model plays well or badly mostly
because of what this text says.

The root `AGENTS.md` writing rules apply. These are the additional ones.

## Name what the call does not promise

This is the rule that matters most and the one most often skipped. A tool
description that lists only what works teaches a model to assume the rest. For
every tool, say what it does, then say what it does not guarantee, in the same
breath.

Worked example of the standard to match: the `pi-link-tools` skill in the
`pi-link` package. It says an `idle` snapshot does not reserve the terminal, a
successful send means accepted for delivery and not that it arrived, and silence
does not tell you whether your message was acted on. Match that.

For this repo the honest statements are: a view can be stale by the time you
act, an accepted pick is not a resolved effect, and the absence of a refusal is
not proof your action changed the game.

## Give facts, not advice

The text says what the seat has, what the seat may do, and what each option
costs. It does not say which option is good. Strategy belongs to the seat's own
reasoning and to the decision packet the host builds for that one choice, where
it is attributable and revisable.

A description that reads "usually you should counter" is a bug. It makes every
seat play the same way and it hides the alternatives.

## Name the easy path, then the full one

A listed move is answered with its id, and that is the path to describe first
and in most detail. It is cheap, it cannot be an illegal move, and it is what a
seat wants nearly always.

The text also says the list is not the limit. A seat may move specific cards
itself and say what it is doing, ask for more options, or object and call the
judge. Text that implies the list is everything teaches a seat it is less
capable than it is, which is the same mistake as telling it the list is safe
when it is not.

Never describe an id that is not in the list in front of the reader, and never
renumber one. A renumbered id is an unplayable answer.

## Show the work

Where an option involves arithmetic, the option states it: four power, the first
blocker needs two because it already has one damage marked, so two and two. A
number with no derivation is not something another player can check, and
checking is how disagreements end without a judge.

## Keep the view small and complete

Small is a retrieval discipline, not permission to drop an inconvenient rule. A
view that omits a standing restriction is wrong, not compact. Cut repetition,
cut history nobody will use, keep every fact that changes what is legal.
