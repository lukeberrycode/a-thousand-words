# 8. Render annotation Markdown with react-markdown, without HTML or images

Date: 2026-10-02 · Status: Accepted

## Context

Annotations are written in Markdown by any signed-in user and shown to every visitor, so their text is untrusted. Rendering it must not let an author run scripts, add unsafe links, or load third-party content into the page.

## Decision

Render annotation bodies with **`react-markdown`** (`src/app/images/[id]/markdown.tsx`):

- **No raw HTML.** It's react-markdown's default: HTML in an annotation is shown as text, never parsed. No `rehype-raw` plugin.
- **Safe link protocols only.** react-markdown's default URL transform empties `javascript:`, `data:` and other unsafe links.
- **No images.** `img` is disallowed, so annotations can't load tracking pixels or off-topic pictures.
- **Links** get `rel="nofollow ugc noopener noreferrer"` and open in a new tab.
- **Length:** at most 5,000 characters, checked in the browser and in the server action.

## Consequences

- It renders to React elements, so there's no `dangerouslySetInnerHTML` and no separate sanitiser to keep up to date.
- Authors get common formatting (emphasis, links, lists, quotes, code) but not tables or footnotes, which would need the `remark-gfm` plugin. That can be added later without changing stored data.
- Stored text stays as written. If the rules change, existing annotations render under the new rules.
