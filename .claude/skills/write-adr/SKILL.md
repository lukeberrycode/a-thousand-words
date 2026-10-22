---
name: write-adr
description: Writes an architecture decision record in docs/adr/ and adds it to the index. Use whenever a choice of library, service, data shape or approach is made, changed or reversed, including during feature work.
argument-hint: "[the decision, in a few words]"
allowed-tools: Bash(ls docs/adr)
---

Record this decision as an ADR: $ARGUMENTS

If no decision was given, use the one just made in this conversation. If it isn't clear what was decided, or why, ask before writing.

## The existing ADRs

```!
ls docs/adr
```

## Steps

1. **Number.** The next number after the highest above, four digits (`0016`). The file name is the number plus a short kebab-case summary: `docs/adr/0016-short-summary.md`.
2. **Check for overlap.** Read the index (`docs/adr/README.md`) and any ADR on the same subject. If the new decision replaces an old one, the old one is superseded: change its status line to `Superseded by [ADR 0016](0016-....md)`, and its row in the index to `Superseded by 0016`. Never delete an ADR. If it only refines an old one, say so in *Context*.
3. **Write it** in this shape, matching the others (read the latest one for tone):

   ```markdown
   # 16. <The decision, as a sentence>

   Date: <today, YYYY-MM-DD> · Status: Accepted

   ## Context

   What made a decision necessary: the problem, the constraints, and the options considered.

   ## Decision

   What was chosen, and why it beat the other options. Name versions where they matter.

   ## Consequences

   What follows, good and bad: what becomes easier, what it costs, what's left to do, and any risks.
   ```

   Status is `Proposed` if the owner hasn't agreed to it yet.
4. **Index.** Add a row to the table in `docs/adr/README.md`: `| [0016](0016-short-summary.md) | <decision> | Accepted |`.
5. **Links.** If the decision changes how the parts fit together, update `docs/architecture.md`. If it creates or retires a risk, update `docs/discovery/risks.md`. Point to the ADR from any code or doc that would otherwise leave a reader asking "why?".

Write in British English, in plain, short sentences. Keep it to one screen if you can: the reasoning, not a tutorial.
