# 11. Boxes hold several annotations; refuse boxes that would hide each other

Date: 2026-10-04 · Status: Accepted

## Context

Each annotation used to carry its own box. Two problems followed:

- **Boxes could hide each other.** Where boxes overlap, Annotorious gives a click to the **smallest** box under the pointer: its hit-testing (`getAt` in `@annotorious/annotorious` 3.9.3) collects every box under the pointer and sorts them by area. Checked in the app on The School of Athens: a click where Raphael's small box overlaps the larger Ptolemy box opens Raphael, and a click on the rest of the Ptolemy box opens Ptolemy. So a box is only reachable on the part no smaller box covers. Drawing a box the same size as an existing one, or very slightly smaller, makes the existing one practically unreachable, by accident or on purpose.
- **There was no way to say more about a detail someone had already boxed,** other than drawing another box over it, which causes the first problem.

## Decision

- **Boxes become their own table.** A `Region` (the box, with the user who drew it) holds one or more `Annotation` rows, by any users, shown together, oldest first. Each user has at most one annotation per box (a unique index on `regionId, authorId`), and edits it rather than adding another. The migration gives each existing annotation its own region, with the same id.
- **Moving a box:** only the user who drew it, and only while it holds no one else's annotations. Otherwise Edit changes only the text.
- **Deleting:** deleting a box's last annotation deletes the box.
- **Overlap rule** (`src/lib/overlap.ts`): a box's **clickable share** is the part of its area not covered by any smaller (or equal) box. A new or moved box is refused if, with it in place, any box would keep less than **25%** clickable. That blocks identical and near-identical boxes, and a box almost filled by a slightly smaller one, while allowing normal nesting, such as a face inside a figure. Only a box whose share the new box actually reduces counts, so boxes that were already crowded don't block every box near them. None of the 12 seed paintings breaks the rule.
- **Where it's checked:** in the browser while the box is drawn or adjusted, and again by `createAnnotation` and `updateAnnotation` on the server.
- **When a box is refused,** the editor offers **Add to that annotation** (discards the new box, opens the existing one with the add form) or **Adjust my box**.

## Consequences

- Several people can explain the same detail without fighting over it, and every box stays clickable.
- Two people saving overlapping boxes at the same moment could both pass the server check. That's unlikely, and the result is the same as before this rule.
- Replies (comments under an annotation) remain on the post-MVP list. This design leaves room for them: they'd hang off `Annotation`.
- The migration drops the box columns from `Annotation`, which the previous version of the code reads. So it can't be applied safely before the new code is live, nor the code before it: the deploy needs a short window (see the PR that introduced it).
