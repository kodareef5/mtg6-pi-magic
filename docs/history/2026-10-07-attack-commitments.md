# Missing attacks and false choices

The blind brief comparison again produced plans that spent resources on useful
creatures but omitted attacks. This audit asks whether requiring an explicit
attack or stay decision would address those failures. It does not run inference,
change the writer or estimate the frequency of omissions.

The source set is the two previously cited omission examples and all six
accepted plans from the brief comparison. Exact plans, source locations and
hashes are in `.pi/resume-20261007/attack-intent-audit/sources.json`.
Ready-lethal iteration 0 and the full game's turn 12 share the same draw
position, version 354. They are two generations, not two independent positions.

## Joint changes needed

An absent attack can be a silent omission, an unbound intention or a deliberate
stay based on a false premise. Count the changes a whole line needs; adding one
missing attacker does not establish that the line wins.

| Source | What the plan records | What a winning line would need |
| --- | --- | --- |
| `combat-facts-ready`, iteration 0 | Guidance names Burst and all three attackers. The sole step finishes attackers; phases are empty. | Commit the named attacks. Kellan, Sanctuary and Zhao already suffice against the lone Hydra. Burst is another omitted action, but not required for this winning attack. |
| Scoped full game, turn 12, clock 678 | Kellan and Zhao have attack steps. Guidance leaves Sanctuary "if desired"; the phase tells Jev to reassess if Kellan is blocked. | Choose and commit Sanctuary too, or commit the available burn finish. Coverage would force a choice but cannot decide that an ambivalent author intended to attack. |
| Brief A, iteration 0 | Cast Claw and Challenger; attack Kellan only. The combat phase explicitly keeps Sanctuary back. Challenger has no attack decision. | Attack with Challenger and reverse Sanctuary's stay. Sanctuary is a Lizard, so Claw's trigger adds one to their five combat damage through an Explorer block on Kellan. Adding Challenger alone gives only two. |
| Brief A, iteration 1 | Cast Smaug, explicitly deny same-turn Smaug damage, and attack Kellan plus Sanctuary. Smaug's payment purpose spends both Sanctuaries. | Reverse the false haste policy, add Smaug's attack and preserve the selected Sanctuary in payment, or choose another coherent winning line. |
| Carried brief, iteration 0 | Animate a Sanctuary through an unbound card-name source, then attack Kellan and only Sanctuary `1-50`. The purpose says the animation provides an additional attacker. | Bind the animation to `1-51`, preserve both lands for attacking, and select the second Sanctuary. Coverage of current creatures and creature casts would miss this future animated land. |
| Carried brief, iteration 1 | Cast and attack Smaug only; explicitly keep both ground creatures back. Delivered opponent-turn policies invent trample. | Reverse the ground-creature stays and preserve Sanctuary for the combined attack. No attack is merely missing from the chosen Smaug-only policy. |
| Carried brief, iteration 2 | Kellan attacks alone because the writer says sickness prevents Explorer blocking. | Correct the blocking belief and construct sufficient damage through a block. A disposition could faithfully retain the wrong stay decision. |
| Brief A, iteration 2 | Kellan attacks alone because guidance and phase policy deny an opposing blocker. | Correct that belief and construct the additional line. Coverage alone supplies neither a cast nor an attack choice. |

The arithmetic here assumes the recorded characteristics and no intervening
responses. These are counterexamples and possible corrections, not physical
outcomes for the six rejected plans. Earlier supplied lines establish that the
engine can execute wins from these positions; they do not credit their choices
to the failed writers.

## What this establishes

The ready iteration is a clear failure to encode stated actions. The turn-12
plan is ambivalent. All six latest plans require changed choices or bindings in
addition to any silent omission. A metadata completeness check cannot by itself
make their policies correct. Requiring explanations might alter generation, but
that effect remains an empirical hypothesis.

The earlier candidate schemas requested a list of selected attackers. They did
not require a disposition for every creature, so their negative results do not
test that exact obligation. Their compilers and protocol defects also prevent
treating them as a clean coverage comparison. Conversely, an untested field is
not by itself evidence that another live arm is the best next action.

Keep disposition coverage unadopted. Any later test must distinguish selection
from completeness and cover activation-created creatures honestly, without
inventing their future characteristics or identity. Filling every field is not
the full-game goal; useful, consistent commitments and legal execution remain
the required outcome.
