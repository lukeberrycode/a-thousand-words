# 22. Annotations can't contain links

Date: 2026-10-22 · Status: Accepted

## Context

Any signed-in user can write an annotation, and every visitor can read it (ADR 0006). ADR 0008 let annotations hold Markdown links. It blocked unsafe protocols such as `javascript:`, and marked links `nofollow ugc` and opened them in a new tab.

That stops scripts running on our page. It doesn't stop a link to a harmful page. A threat actor can add a link to a phishing site or a malware download, and give it text that looks trustworthy: "Higher-resolution scan" or "Source: National Gallery". The link sits next to the artwork, on our site, so readers have reason to trust it. Link text can also hide where a link goes.

Options considered:

- **Keep links, add checks.** An allow-list of domains, or a safe-browsing lookup. Both need upkeep, and a page on an allowed domain can still change after it's checked.
- **Keep links, add friction.** Show the full URL, or warn before leaving the site. Readers learn to click through warnings.
- **No links.** Annotations describe the image. Linking out isn't needed for that.

## Decision

- **Annotations don't render links.** The renderer (`src/app/images/[id]/markdown.tsx`) disallows the `a` element and keeps its text. `[text](url)` shows as `text`, and the URL isn't shown.
- **No autolinking.** `<https://…>` autolinks render as text too. Bare URLs stay plain text: `remark-gfm`, which would link them, stays out.
- **Stored text is unchanged.** As ADR 0008 says, existing annotations render under the new rules, so old links become plain text without a migration.
- **The save action doesn't reject link syntax.** The renderer is the one place that decides what reaches the page, so it's the one place to enforce this.

This amends ADR 0008. Its other rules stay: no raw HTML, no images, the length limit.

## Consequences

- Readers can't be sent off the site from an annotation, so phishing and malware links through annotations are gone.
- Authors can't cite sources with a link. They can still name a source in text.
- A URL typed as text can still be copied and pasted by hand. That takes a deliberate step, and the text shows exactly where it goes.
- To do: change the renderer and its comment, update the unsafe-Markdown system test in `docs/system-tests.md` and `e2e/annotations.spec.ts` (every link renders as text).
