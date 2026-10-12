# Direct Jev and CLI Haiku

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

## Jev directly through Typesafe

Pi already includes Typesafe's native classifier provider. Authenticate with
`/login typesafe` in Pi, then select it in the package:

```text
/magic models decide typesafe/jev-latest
```

Pi stores the credential outside the repository. The `TYPESAFE_API_KEY`
environment variable is also supported. With that provider authenticated,
the existing `typesafe/jev-latest` default resolves directly, including in
`tools/matchup.ts --claude` and `tools/sim.ts --claude`. The API and request
shape are documented in the [official quick start](https://docs.typesafe.ai/introduction/quickstart).

On October 12, a fresh Pi runtime loaded the saved credential and answered a
classification successfully. A saved Landfall/Azorius continuation then made
live decisions through direct Jev and prepared strategy through CLI Haiku,
without an OpenRouter request. This clears the provider-credit blocker for
that route; it does not certify the remaining card interpretations. The
separate Jace interpretation refusal remains preparation work.

Pi's installed direct-Jev catalog has zero prices, so its zero-dollar entries
are unpriced usage, not evidence of free calls. Typesafe currently publishes
$0.042 per million input tokens and free output tokens in its
[model reference](https://docs.typesafe.ai/models). Token counts are retained;
use that rate when reviewing these runs until the catalog is corrected.
