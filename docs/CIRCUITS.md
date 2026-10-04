# Circuits, drafts, and how a seat decides

This document replaces the archived circuitry and per-card language designs
listed in `design-ref/README.md`. `docs/WORK.md` describes the implemented tool
contract and experiments. The broader menus below remain design sketches.

The design separates strategy preparation from execution through fixed choices.
The experiments establish that the calls, private edits and physical actions
can be kept distinct. Playing strength and cost benefits still need measurement.

## The vocabulary

**The syntax** supplies operations over Magic objects: select a visible source,
state a cost, order instructions and propose a physical change. Operations are
generic rather than compiled per card. Querying targets, computing amounts and
building complex payments remain future work.

**A circuit** is a sequence of menus. Each selected id can produce the next
menu mechanically, without a strategy call. The classifier can inspect, bind,
accept readiness, execute or leave the draft for later.

**A draft** holds one seat's prepared sequence, progress, bindings and reserved
resources. It is private equipment, separate from the physical table.

**A recipe** supplies a starting draft. Strategy can prepare or revise it in
response to an explicit request, including one made after the board changes.
The original recipe and the current edited draft can differ; strategy needs
both to revise unfinished work without repeating completed steps.

## Preparation and execution

Private equipment and the physical table have separate commit boundaries.
Changing a draft or appointment moves no card, spends no mana and advances no
phase. Its atomic tool batch updates only the seat's equipment revision.

Execution uses the ordinary core writer. It checks the current source,
incarnation, stated payment and reservations, then records the accepted action.
A changed position can require renewed readiness. Only an executed action
advances the draft's completed-step count.

The table enforces visibility and conservation. A prepared procedure records
its claim and basis; acceptance does not certify that its source has the claimed
ability or that its timing follows card rules. Raw declarations, objections
and judge remedies remain unfinished.

## What travels with a menu

A decision packet carries the facts and guidance needed for the current choice:

- the obligation, phase and step;
- the seat's objective and applicable pregame or strategy guidance;
- recent public turn recaps;
- completed steps, current bindings and reservations;
- available sources and payments, with colors and persistence;
- stated cost, effect order and timing for the current action;
- public registered deck counts, without hidden arrangements.

Source ids and incarnations distinguish same-name objects. Option ids remain
unchanged, but a player must not decode them to compare payments. Binding,
readiness and execution retain the same descriptive details.

`Packet` in `src/context/packet.ts` carries compact work state: guidance,
progress, step labels and windows, reservations, bindings and status. Executable
draft bodies and assessment history stay in core and the journal. Strategy
receives the full recipes and edited draft when reconsidering. Unresolved stack
instructions remain public facts, including for a seat with no private draft.

Recaps help explain how the current position arose without carrying the entire
log. Their arrival is asynchronous; exact decision-packet capture is still
needed before comparing model behavior across runs.

## Calls and accounting

| Work | Actor | Model calls |
|---|---|---|
| Recompute a menu after a change | core/context functions | none |
| Bind, inspect, adopt, execute or answer reviews | classifier | one request for the offered choices |
| Prepare recipes or reconsider a goal | strategy | on an explicit request |

Advancing a prepared circuit must not require fresh strategy for every step.
Strategy supplies guidance and editable instructions; the classifier follows
the available choices and can request reconsideration when they do not fit.

A rules-required single continuation is forced. A unique effect continuation
explicitly authorized by its seat is delegated. A strategic filter leaving one
option does not make it forced. The experiments ask separately for binding,
readiness and execution so those boundaries can be inspected.

Empty reviews need no call. Independent review concerns can share one request,
but no answer may assume that a sibling question paid a cost or moved a card.
Due attention blocks an automatic pass, not other listed plays. A bad review
batch accounts for nothing.

The forced ratio counts physical decisions. Private edits can spend classifier
calls without adding a physical ledger row. Compare total calls, tokens, cost,
elapsed time, outcomes and gaps alongside that ratio.

## Gathering context

A circuit can change what the seat reads without changing its draft. Rule
routes in `src/context/dial.ts` return exact text from `rules/cr.tsv`. Following
one keeps the same decision open and costs no inference call.

Relevance selection is another possible step. `ruling.ts` uses a classifier to
score candidate rules before a reasoner considers the survivors. The ruling
pipeline stops at a verdict; it does not apply a remedy. Extending that pattern
to cards or threats needs evidence that the extra call improves decisions or
reduces total cost.

## Experiments and next work

The equipment scenarios prepare a listed-move sequence, reserve a card, schedule
three upkeep reviews and a follow-up, and revise the remaining sequence after a
reservation is lost. Completed steps stay completed.

The ability scenario starts from an established board. Each seat prepares mana
and a Qiqirn Merchant activation; the second activation goes above the first on
the stack. Draws are delegated, discards ask the affected seat, and a clone at a
pending discard preserves the completed draw. Accepted instructions are replayed
without another interpretation call.

All three scenarios use authored strategy and classifier doubles. They establish
execution and journal behavior, not playing strength or ordinary full-deck play.
`npm run circuits` reports their calls and writes a local inspector when given
`--out`.

The next gameplay target is two selected real Standard lists, with pinned
legality date and card/rules data. Inventory their mechanics before extending
this vocabulary. Games must start from ordinary deck setup and reach outcomes
without unsupported actions being silently passed over. Card-list validation is
separate from auditing gameplay legality.

## Open questions

- Which menus earn their cost: funding, targets, damage assignment, scry and
  broader selection patterns are sketches, not implemented operations.
- How much context and menu width each classifier needs. The current authored
  doubles cannot measure that.
- Which changed facts should reopen which reviews. The current position check
  is deliberately broad and can require repeated consideration.
- How much card meaning is needed to offer useful choices while preserving the
  distinction between accepted claims and rules legality.
- How to record exact decision packets and model/interpreter versions for
  reproducible quality comparisons.

Keep the vocabulary provisional. Add operations required by the selected decks
before introducing a compiler, a larger scheduler or a multi-game framework.
