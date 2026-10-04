# The first real Standard matchup

The target lists are L1X0's Mono-Green Landfall and __OVC__'s Mono-Red Aggro
from [MTGO Standard Challenge 32, event 12854496](https://www.mtgo.com/decklist/standard-challenge-32-2026-09-1812854496).
The source's embedded event starts September 18, 2026. Green finished ninth;
Red finished eighth. `decks/standard-matchup.json` preserves both main decks
and sideboards, with printings combined by card name.

Each has 60 main-deck cards and 15 sideboard cards. The local deck check accepts
both lists, including the combined copy limits, against the October 3, 2026
Standard card snapshot. The pin records SHA-256 hashes of that file and the
Comprehensive Rules effective September 25, 2026. This establishes deck
legality at the pinned date, not correctness of any gameplay interpretation.

## Run an opening

```
npm run matchup
npm run matchup -- --live
```

The first command uses authored choices. `--live` uses Pi's configured models
and makes paid calls: strategy prepares procedures and the classifier executes
them. Both commands deal the full main decks through ordinary opening setup.
Registered main-deck counts are public; hands and library order stay hidden.
The sideboards are pinned for later match play but are not used in this game.

The default seed, `real-standard-9`, was selected for an immediate interaction.
It does not stack either library. Green keeps Fabled Passage, three Forests,
Llanowar Elves, Sazh's Chocobo, and Snakeskin Veil. Red keeps Emberheart
Challenger, Hired Claw, two Mountains, Nova Hellkite, Shock, and Soulstone
Sanctuary. The operator can inspect both hands; each player receives only its own.

The requested line is Forest, green mana, Llanowar Elves on the first turn;
Mountain, red mana, Shock targeting the Elf on the second. Casting moves the
actual card to the shared stack and spends its announced payment. The Elf
resolves as a 1/1. Shock marks two damage, goes to the graveyard, and the Elf
dies at the following state-based check. Newly entered creatures cannot pay
tap costs until their controller's next turn. Haste and control changes need
further terms.

The monitor stops after that exchange, or after the opening is missed. It
does not manufacture a game outcome or continue passing over unsupported
cards. This is a prescribed execution probe, not a test of strategic strength.
Choosing to spend Shock here is part of the probe, not a claim of best play.

Output goes to `.pi/real-standard/`: the journal, exact model requests and
replies, a result file, and a response clone with Shock still on the stack.
Each model request checkpoints accepted progress. These are private operator
artifacts, not spectator exports. The result checks replay and reports whether
the requested exchange actually happened; zero engine gaps alone is insufficient.

To retry a recorded position, add `--resume <journal> --version <decision>`.
The monitor forks that prefix and carries its accepted preparation and costs.
Use `--live` again to continue with Pi models. The original journal stays intact.

## What this opening added

Prepared procedures now carry spell timing, a destination and one announced
creature or player target. Printed type, cost and power/toughness come from
the pinned card file, not from the claim.
Literal damage uses that target. Menus expose source, target, payment and
remaining instructions; replay uses the accepted terms without interpreting
the card again. No card compiler or separate casting engine was added.

These terms cover the Elf/Shock exchange. They do not implement all targets
allowed by Shock, which can also hit planeswalkers and battles. The current
creature check uses printed toughness; modifiers, indestructible and
damage replacement effects are not implemented. Giving Mossborn Hydra its
printed 0/0 without its entry counter would be incorrect play.

Tests exercise unpaid and stale announcements, target departure before
resolution, cancellation of the whole targeted effect, summoning sickness,
damage before the state check, conservation of all 120 cards, and a clone
that keeps the paid cost and pending response.

## Live observations

The October 4, 2026 Pi run used `gpt-6.1-sol:low` for preparation and
`typesafe/jev-latest` for decisions. Three initial attempts missed the line.
The first exposed an invented land-option prefix and an adoption review with
no recipe attached. The next two exposed ordinary land plays bypassing draft
progress, including a play made before adoption.

Strategy now receives printed creature stats and explicit selector and review
instructions. Adoption menus show the recipe's guidance and step labels;
ordinary plays say that they do not adopt or advance a draft. The alternatives
remain selectable. Executable recipes stay out of the classifier packet.

Continuing a prefix with both live-authored plans then completed the exchange.
The final verification used 31 additional classifier calls, no fresh strategy
calls, 7.1 seconds and $0.0045 at recorded catalog prices. These figures cover
the continuation, not preparation or the failed attempts. Its full ledger has
28 forced, 2 delegated, 4 chosen and 4 declared decisions, with no fallbacks or
engine gaps. Both cards reached the graveyard; all 120 registered main-deck
cards remained accounted for. Replay matched objects, receipts, ledger,
equipment, resolution and cursor.

The broader replay check initially found a monitor boundary mismatch: live
observation stopped immediately after the Elf died, while replay had already
granted the next priority. The monitor now reaches that same next-decision
boundary without answering it. No physical action was missing or repeated.

The failures and successful continuations remain separate local journals and
call traces. This is evidence that the prescribed exchange executes, and also
evidence that navigating preparation needs further evaluation.

## The next interactions

Use these same lists and preserve the position when an instruction needs
machinery. The next useful branches are Sazh's Chocobo followed by a land;
Shock answered by Snakeskin Veil with green mana available; and Hired Claw
attacking into a creature. They require counters and landfall, a temporary
target restriction, then combat and an attack trigger. Each branch needs its
own response opportunities, state checks and replay, not just a final board.

The inventory below covers the unique main-deck and sideboard cards. Names
identify examples to exercise; they are not per-card switches in core.

| Cards | Machinery still needed beyond the opening |
|---|---|
| Forest, Mountain, Llanowar Elves, Shock | Reviewed opening terms exist. Ordinary action discovery and wider damage targets remain. |
| Sazh's Chocobo, Mossborn Hydra | Landfall triggers, counters, entry replacement, counter doubling, trample. |
| Fabled Passage, Escape Tunnel, Elven Passage, Promising Vein | Sacrifice and life costs, library search and shuffle, tapped entry, conditions and reveal choices; Escape Tunnel also grants an evasion effect. |
| Ba Sing Se | Conditional tapped entry, earthbend, land animation, counters, haste and a return effect. |
| Earthbender Ascension | Entry and landfall triggers, search, earthbend, quest counters and a conditional follow-up trigger. |
| Glimpse the Core | Modes, search, tapped entry and graveyard land targets. |
| Icetill Explorer | Extra land plays, permission to play lands from the graveyard, landfall mill. |
| Mightform Harmonizer | Landfall target, power doubling until end of turn, warp and its delayed exile/play permission. |
| Sapling Nursery | Affinity for Forests, landfall tokens, exile cost and temporary indestructible. |
| Keen-Eyed Curator, Soul-Guide Lantern, Ghost Vacuum | Graveyard targeting, exile, linked card identities and card-type counts; Vacuum also returns creatures with changed characteristics. |
| Surrak, Elusive Hunter, Hexing Squelcher | Uncounterability, ward, trample and becoming-target triggers, including a spell on the stack. |
| Meltstrider's Resolve | Aura targets and attachment, entry trigger, fight, toughness modification and blocking restriction. |
| Snakeskin Veil, Warg Tactics, Origin of Metalbending | Own-creature targets, counters, temporary hexproof/indestructible/trample, modes and restricted destruction targets. |
| Torpor Orb | Suppression of creature-entry triggers. |
| Hired Claw | Lizard attack trigger, opponent damage, counters, life-loss condition and once-per-turn activation. |
| Emberheart Challenger | Haste, prowess, once-per-turn targeting trigger and exile/play permission. |
| Kellan, Planar Trailblazer | Persistent type and ability changes, combat-damage trigger, exile/play permission, double strike. |
| Lightning Strike, Burst Lightning, Abrade, Witchstalker Frenzy | Wider damage targets, kicker, modes, destruction and costs reduced by attackers this turn. |
| Nova Hellkite, Smaug the Magnificent | Flying, haste, entry/attack/upkeep triggers, warp, Treasure tokens and damage calculated on resolution. |
| Rockface Village, Soulstone Sanctuary | Restricted mana, conditional haste and power modification, land animation with vigilance and every creature type. |
| Zhao, the Moon Slayer | Menace, tapped-entry replacement for nonbasics, activation counter and a continuous type/ability change. |
| Fiery Annihilation | Creature damage, attached Equipment selection, exile and a dies-to-exile replacement. |
| Magebane Lizard, Sunspine Lynx | Spell-history and entry triggers, calculated player damage, life-gain and damage-prevention restrictions. |

Full games still require the shared combat, trigger, replacement and continuous
effect machinery, plus unsupported costs, choices and judge remedies. Completion
means these lists reach outcomes from ordinary setup without missing-machinery
gaps and preserve their interactions through replay and cloning.
