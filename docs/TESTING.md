# Test lanes

```sh
npm test                              # fast invariant tests
npm run check                         # TypeScript
npm run test:slow                      # whole-game invariants
npm run test:all                       # every test
npm test -- --concurrency 4            # explicit worker count
node tools/test.ts slow --list         # exact membership
node --test test/journal.test.ts       # an affected invariant
```

The fast lane and type check run before each commit. Run affected slow files
when changing their behavior. Run the full suite before pushing a completed
batch and before a release. All tests remain offline; `npm run smoke` and the
matchup tools make live calls only when explicitly run.

`tools/test.ts` holds nine slow files: abilities, answers, context, game,
journal, phases, plans, reason and rulings. They test complete games, replay,
clone/resume, adapter failures and planning. The runner discovers every test
file, so new files join the fast lane automatically. A missing named slow file
is an error. The lanes are disjoint and `all` includes both. Concurrency defaults
to the smaller of eight workers and the machine's available parallelism.

The first measured fast run passed 233 tests in 59.6 seconds, including the new
CLI transport invariant. The other 86 tests remain in the slow lane. The full run passed all 319 tests
in 132.5 seconds. This reduces
routine waiting; it does not claim that the slow invariants are unnecessary.
