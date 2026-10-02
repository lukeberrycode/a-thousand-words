# Product background

Who A Thousand Words is for, what already exists, and where the name comes from. The scope and milestones are in the [one-pager](one-pager.md), and technical decisions are in the [ADRs](adr/README.md).


## Audience and use cases

The first audience is curious browsers who want to understand an image, plus enthusiasts who enjoy explaining one.

| Image type | Example annotation |
| --- | --- |
| Artwork | "This skull is anamorphic; view it from the lower right" |
| Memes | "This template comes from a 2016 stock photo shoot" |
| Historical photos | "Second from left is the mission's flight engineer" |
| Infographics and charts | "This axis doesn't start at zero, which exaggerates the change" |
| UI and design teardowns | "This button uses a dark pattern to hide the cancel option" |

For the demo, seed content from one category so the site feels coherent on first visit. [ADR 0006](adr/0006-open-annotation-and-public-domain-seed.md) chose public-domain artwork.


## Prior art and differentiation

Region annotation on images exists, but no product pairs it with Genius's public, community-curated model.

| Product | What it does | Gap |
| --- | --- | --- |
| Flickr Notes | Boxes with comments on photos | Owner-centric, no curation or reputation |
| Wikimedia Commons ImageAnnotator | Wiki-style region notes | Buried in a wiki gadget, not a destination |
| ThingLink | Interactive hotspots | Single author, aimed at education and marketing |
| IIIF / Mirador / Annotorious | Scholarly annotation standard and tools | Built for institutions, not the public |
| Genius | Community annotation of lyrics and text | Text only |

The gap A Thousand Words fills: a public page per image, annotations anyone can add, and (post-MVP) voting and reputation to surface the best explanations.

These comparisons are from memory, not fresh research, so treat them as approximate.


## Name

**A Thousand Words** (repo: `a-thousand-words`) comes from "a picture is worth a thousand words": every image deserves its explanation.
