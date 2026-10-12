# 16. Skills for repeated work, and subagents with narrow permissions

Date: 2026-10-12 · Status: Accepted

## Context

Two tasks recur and have an order that matters. Writing an ADR needs the next number, the house format, an index row and, sometimes, an old ADR marked superseded. Releasing needs a production migration **before** the merge (new code expects the new schema), then the deploy, then the PROD-01 to PROD-05 checks. Both lived in `CLAUDE.md` and memory, so the agent did them slightly differently each time.

Reviews and tests were done by the same agent that wrote the code, in the same context. It tends to test what it built rather than what was asked for, and to review its own reasoning rather than the code.

## Decision

- **Skills** in `.claude/skills/`:
  - `write-adr`: the steps and template for an ADR. Claude may load it on its own whenever a decision is made.
  - `release`: the release order. Only the owner can start it (`/release <PR>`, `disable-model-invocation`), because it ends in production. Claude checks each step and the owner runs `prod:migrate` and merges, as ADR 0014 requires.
- **Subagents** in `.claude/agents/`, each with a fresh context:
  - `code-reviewer`: reads the branch against `CLAUDE.md`, the ADRs and a security checklist for server actions, and reports findings by severity. It can't edit, and Bash runs only git commands that read.
  - `test-writer`: writes unit tests and system tests, and updates `docs/system-tests.md`. It can't edit application code, so a failing test stays failing until the main agent fixes the code.
- A tool list can only allow or remove a whole tool, so a `PreToolUse` hook in each agent's frontmatter (`.claude/hooks/agent-scope.mjs`) enforces the limits by path and command. It fails closed: input it can't read is blocked.
- `CLAUDE.md`'s definition of done names them, so a whole-milestone prompt uses them without being asked.

## Consequences

- Claude chooses skills and subagents from their descriptions, so automatic use is likely but not guaranteed. The definition of done makes it a rule; naming them in a prompt makes it certain.
- A review by the same model in a fresh context catches different problems, but it isn't independent. The human review before real users arrive (milestone 9) still stands.
- The test writer runs tests but can't touch the code, so a bug it finds comes back as a report, not a quiet fix.
- Agent hooks in `.claude/agents/` only run once the folder is trusted in Claude Code.
- More files to keep current: when the release process or ADR format changes, the skill changes with it.
