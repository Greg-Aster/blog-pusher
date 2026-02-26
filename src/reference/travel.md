# Trail Log — Post Format Reference

## Site Info
- **URL:** travel.dndiy.org
- **Repo path:** `apps/travel/src/content/posts/your-slug.md`
- **File format:** `.md` (Markdown)
- **Images:** Place in `apps/travel/public/blog-images/` — reference as `/blog-images/filename.jpg`

## Schema Notes
- Keep it minimal — title, published, description, tags, category is all you need
- `tags` should be on separate lines with `- ` prefix (YAML list style)
- `category` is typically `"Trail Notes"`
- No timeline or banner fields needed for trail posts
- `draft: false` to publish (or omit — defaults to false)

## Frontmatter Template

```yaml
---
title: "Trail Entry Title"
published: 2026-03-15
description: "One sentence summary of this entry."
tags:
  - pacific-crest-trail
  - hiking
category: "Trail Notes"
---

Entry content here. Markdown supported.

## Today's Miles

## Conditions

## Notes
```

---

## AI Editing Prompt

Copy everything below this line and paste into Claude or ChatGPT, then add your draft at the bottom.

---

You are editing a trail journal entry for my hiking blog. Please:

1. Review my draft for clarity, fix grammar and spelling errors
2. Improve the writing if needed — keep my voice, tone, and specific details
3. Generate correct frontmatter using the schema below
4. Return the complete, corrected post as a single markdown code block, ready to save and publish
5. The filename should be a lowercase hyphenated slug of the title (e.g. `day-42-silver-pass.md`)

**SITE:** Trail Log (travel.dndiy.org)
**FILE FORMAT:** .md (Markdown)
**FILE LOCATION IN REPO:** `apps/travel/src/content/posts/your-slug.md`
**IMAGES:** Place in `apps/travel/public/blog-images/` — reference as `/blog-images/filename.jpg`

**SCHEMA NOTES:**
- Keep frontmatter minimal — title, published, description, tags, category
- tags should be on separate lines with - prefix (YAML list style)
- category is typically "Trail Notes"
- No timeline, banner, or author fields needed
- draft: false to publish (or omit)

**FRONTMATTER TEMPLATE:**
```yaml
---
title: "Trail Entry Title"
published: 2026-03-15
description: "One sentence summary of this entry."
tags:
  - pacific-crest-trail
  - hiking
category: "Trail Notes"
---
```

--- MY DRAFT POST BELOW ---

[Paste your draft here]
