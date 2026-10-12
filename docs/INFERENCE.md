# Haiku through the Claude CLI

Use `--claude` to select Haiku 5.5 medium for strategy and judge in one run:

```sh
npm run matchup -- --claude --resume <saved-journal> --turns 40
npm run sim -- --claude --alpha --random 10 --jobs 2
```

The matchup runner copies a saved journal before continuing it. It carries the
briefs and accepted meanings and records new calls under
`claude-cli/claude-haiku-5-5:medium`. The original journal stays available.
`--strategy` and `--judge` override their respective `--claude` choices.
Pregame remains Sol and the pilot remains Jev. Summary stays off in these tools.

In Pi, reload the extension and select the route explicitly:

```text
/magic models strategy claude-cli/claude-haiku-5-5:medium
/magic models judge claude-cli/claude-haiku-5-5:medium
```

The assessment and guide tools also recognize this provider through their
existing `--model` option. Registering the provider does not change the saved
roster or replace a failed provider automatically. An installed executable
makes the option discoverable; login, model access and quota are checked when
the CLI answers. Run `claude auth status` to inspect the CLI's login.

The provider invokes `claude -p` with a pinned model, explicit effort, JSON
output, no session persistence, no built-in or MCP tools, and safe mode. Each
request uses a private temporary directory and deletes its prompt afterward.
The CLI receives only the transcript supplied by the decision context engine.
It proposes tool calls in JSON; the existing reasoner answers lookups and checks
submissions. The CLI cannot inspect the repository or execute game operations.
An unexpected model, invalid output or subprocess failure becomes a reported
failure. Cancellation terminates the process group. Output limits are requested
through `CLAUDE_CODE_MAX_OUTPUT_TOKENS`; a requested ceiling is not proof that
the route enforced it. See the [official CLI reference](https://code.claude.com/docs/en/cli-reference).

The CLI owns authentication and its account's limits. The tested installation
was Claude Code 2.1.296 signed in through Claude Max. Its reported dollar amounts
are list-price estimates, not measured subscription cash spend. Per-call usage
records carry `costBasis: "list-estimate"`; aggregate reports expose
`estimatedCost` and `estimatedCostCalls` and label those amounts in the bill.

On October 12, a real lookup/submission round trip and a saved-game strategy
call succeeded through this route. The next Jev call returned OpenRouter
HTTP 402. Switching Haiku therefore removes one funding dependency; Jev still
needs its selected provider funded. A separate Jace interpretation probe refused
its multiplayer wording and remains a card-preparation issue. Neither probe
counts as a completed alpha game.
