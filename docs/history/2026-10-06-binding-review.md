# Action binding and factual guidance, October 6

This round used the saved positions from the preceding review. Models remained
Jev for execution and Luna low for strategy. It ran no full game: the focused
answers still contained errors that would make another game hard to interpret.

## Changes retained

The submit schema enumerates every exact reusable action key. Previously the
writer omitted words or punctuation from keys and spent another round correcting
them. The validator now reports all unknown keys together rather than one per
reply. Accepted procedures and journal entries still contain ordinary complete
terms, not request-local keys.

Action context shares a description only when both the executable action and
its displayed facts match exactly. `sameAs` names the full description, while
every original key remains usable. Different instructions with the same claim
remain separate. No string or option list is truncated.

Player references now accept `self` and `you` with the same controller-relative
meaning. The planner had repeatedly written the action-query spelling inside a
condition and received a refusal. This is an explicit syntax rule, checked and
executed by the same selector reader, not a guessed correction after refusal.

The manifest now has 15 positions. The new cases require the funding Mountain
before Zhao's cast and an attack by the established Zhao after its old sickness
restriction has ended. Plan checks recognize selectors bound by incarnation as
well as by card name. These remain narrow regression properties.

## Trials

All artifacts below are under `.pi/review-tune-20261006/`.

| Trial | Property results | Calls | Decision time | Measured cost |
|---|---:|---:|---:|---:|
| Earlier full amendment, `registered-amendment` | 0/1 | 3 | 49.4 s | $0.006240 |
| Exact-key schema, `selection-schema` | 1/1 | 1 | 21.0 s | $0.002841 |
| Consolidated prompt, `organized-amendments` | 4/6 | 13 | 227.6 s | $0.015928 |
| Restart broken plan from playbook, `rebuilt-amendments` | 0/2 | 2 | 36.2 s | $0.003491 |
| Preserve sequence but retire old guidance, `sequence-repair` | 2/2 | 6 | 118.0 s | $0.009741 |
| Final context and syntax check, `retained-changes` | 1/2 | 2 | 45.3 s | $0.005168 |

These are different small samples, not a controlled game-speed comparison.
The first schema-only answer used the correct Explorer-before-Forest order,
but its prose still misstated the land play and remaining resources. The
consolidated prompt kept that order and handled the funding-land case, while
both established-attacker checks failed. It also introduced condition and
top-level field refusals. Restoring the original prompt avoided those new
instructions becoming production policy.

Resetting broken plans removed old bound prose but also lost useful sequence
intent. Preserving the old action order restored the tested sequence, yet
the writer still reserved mana for absent Veil and described a departed
earthbent land as a blocker. Both reset variants were withdrawn. Their
artifacts and `sequence-repair-experiment.patch` preserve the evidence.

The final check used the retained action references and player-reference alias.
Both answers submitted in one call. Green put Explorer before Forest and
correctly identified that there were currently no creatures, but still wrote
protection guidance for absent Veil. Red acknowledged that Zhao was unsick and
then omitted its attack. A successful syntax check or correct sequence must not
be reported as coherent strategy.

## Factual audit probe

One separate Luna low call reviewed the bad `sequence-repair` plan against
projected objects and printed cards, without the pregame essay or an instruction
to choose a new strategy. It took 12.0 seconds, 5,968 input and 592 output tokens,
at $0.000893. It identified absent Veil, the missing creature land and Explorer's
future graveyard permission. The model was not allowed to change the plan.

It also flagged harmless statements and suggested narrowing an accepted cast
selector merely because only one of its permitted sources was currently
present. Its first mana correction did not fix the actual after-land arithmetic.
This audit is useful review evidence, not an automatic validator or another
production call. `grounding-probe.ts` and `grounding-probe/` retain the input,
reply and bill; future evaluation needs both true and false positives.

## Next question design

The recurring defect is binding a general policy to real sources and future
windows. More reminders to read the hand did not make that binding reliable.
The next ordinary-plan question should ask for a response source, reserved
resources and useful window explicitly, then derive their factual description.
It should not ask the writer to narrate another inventory of the battlefield.

Continuation discovery also needs a forecast. The current menu shows the hand
Forest but cannot yet offer a graveyard land whose permission starts after
Explorer resolves. The writer repeatedly treated the absence of a current offer
as absence of the continuation, despite the graveyard and printed permission
being visible. A focused preview should expose uses enabled by the selected
resolved permanent through accepted shared mechanics. It must label its
assumptions and stop at unknown draws, mills, choices or responses.

Keep the existing amendment gate until those bindings work. Do not add the
audit to every turn, shorten timeouts, increase model effort or claim a speed
win from this round. Offline types and all 179 invariants pass; strategic
quality and prepared-plan reuse remain open.
