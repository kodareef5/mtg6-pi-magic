# Revising an unfinished combat declaration

The consequence-feedback experiment exposed an illegal block in an otherwise
help-free raw win. Green selected its lone Forest to block menace Zhao and then
finished. Both decisions carried the menace warning; Green's accepted phase
policy explicitly forbade the lone block. No rule fact was lost in delivery.

Once Forest was selected, the interface offered only finish or help. Help could
rewrite the plan but could not withdraw the pending selection. The correction
adds explicit withdrawal choices before a declaration finishes. It does not
establish better initial selection, strategic planning or whole-game legality.

## Contract

- Both attack selections and blocker pairs can be withdrawn before finishing.
  Existing options remain in their order; withdrawals follow in canonical order.
  The pending question names the new choice. No card moves, taps or triggers.
- The seat can reselect a withdrawn choice. No automatic finish, help request,
  permanent exclusion or production decision cap is added.
- The ledger keeps both decisions. A pure reader excludes withdrawn selections
  from `done` and `worked`, before history deduplication. Reselecting can earn
  fresh credit. Amendments cannot restore deleted steps, and a later combat
  cannot withdraw earlier finalized work.
- Replay preserves the originally offered menu. Only appended withdrawal ids
  are accepted as menu additions in historical declaration rows; other drift
  remains an error. The recorded pick must still be executable.
- The shared benchmark can stop at an explicit recorded-decision boundary,
  including forced and delegated rows. Its host checkpoint observes operations
  with no narrated receipt. A stopped game remains pending; replay comparisons
  normalize a copy, never the paused table.

The second-Strike waiting failure in the same game remains a planner placement
error. Its branch omitted `waitFor`, while the completed first step's purpose
said to cast the second after resolution. Completed steps show only their label
at subsequent action questions. The branch itself needed the existing explicit
prerequisite. This change adds no prose parsing or implicit waiting rule.

## Frozen baseline

Source: `72b2fd5`, with only the saved fixture and manifest added for the probes.
The parent is `consequence-upkeep/red-upkeep-lethal-0-receipt-consequence` under
`.pi/resume-20261007`. Decision prefixes 284 and 285 reconstruct parent request
versions 555 and 556. All six complete benchmark requests are deep-equal to the
corresponding saved parent request.

| Decision | Correct initial choice or recovery | Observed baseline |
|---|---|---|
| Before any block | Finish with no blockers | Illegal lone block, 3/3 |
| After selecting Forest | Withdraw before finishing | Finish illegal block, 3/3; no help |

The second baseline has no withdrawal option, so its failure does not measure
willingness to use an unavailable capability. It records the original failure.
Evidence: `.pi/resume-20261007/menace-baseline/{results.json,calls.jsonl}`.
Six Jev calls used 25,695 input and 297 output tokens, about 1.5 seconds of call
time and $0.0011 at reported catalogue prices. No strategy call ran.

## Recovery gate

At the checked implementation commit, repeat both pilot cases three times, then
continue `menace-recovery` three times for at most 12 further recorded decisions
or through turn 10. Preserve the accepted plans and roster. Count initial illegal
selections, withdrawals, timely help, coherent completion and repeated pending
sets separately. A select/withdraw cycle reaching the boundary fails recovery;
it is not a loss or fallback. Inspect actual traces, not the generic continuation
success field, which does not certify a legal declaration.

No result in this gate establishes generated strategy or authorizes a full-game
claim. Keep the interface correction independently of the live recovery result.

Before the live gate, types, all 179 tests and 32 saved-prefix replays passed.
The existing invariants now cover withdrawal and reselection, multiple pending
choices, both finish boundaries, a later combat, plan amendment, rollback,
replay/clone and external pauses after both withdrawal and finishing. The
paseo-committee reviewers found no remaining consequential correctness issue.
