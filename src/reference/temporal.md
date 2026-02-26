# Temporal Flow — Post Format Reference

## Site Info
- **URL:** temporalflow.org
- **Repo path:** `Temporal-Flow/src/content/posts/your-slug.md`
- **File format:** `.md` (Markdown)
- **Images:** Place in `Temporal-Flow/public/blog-images/` — reference as `/blog-images/filename.jpg`

## Schema Notes
- `bannerType` can be: `image`, `video`, or `timeline`
- For video banners use `bannerData.videoId` (YouTube video ID)
- `timelineYear` / `timelineEra` / `timelineLocation` are optional but power the interactive timeline
- `tags` must be an array: `[Tag1, Tag2]` or on separate lines with `- ` prefix
- `draft: false` to publish, `draft: true` to hide

## Frontmatter Template

```yaml
---
title: "Post Title"
published: 2026-03-15
description: "Brief description of the post."
image: "/blog-images/my-image.jpg"
avatarImage: "/posts/generic/avatar.png"
authorName: "Your Name"
authorBio: "Short bio or role"
bannerType: "image"
bannerData:
  image: "/blog-images/my-image.jpg"
timelineYear: 2026
timelineEra: "modern"
timelineLocation: "Location Name"
isKeyEvent: false
showImageOnPost: false
tags: [Tag1, Tag2]
category: "Blog"
draft: false
lang: "en"
---

Post content here. Markdown supported.
```

---

## AI Editing Prompt

Copy everything below this line and paste into Claude or ChatGPT, then add your draft at the bottom.

---

You are editing a blog post for my personal website. Please:

1. Review my draft for clarity, fix grammar and spelling errors
2. Rewrite or improve the content if needed — keep my voice and intent
3. Generate correct frontmatter using the schema below
4. Return the complete, corrected post as a single markdown code block, ready to save and publish
5. The filename should be a lowercase hyphenated slug of the title (e.g. `my-post-title.md`)

**SITE:** Temporal Flow (temporalflow.org)
**FILE FORMAT:** .md (Markdown)
**FILE LOCATION IN REPO:** `Temporal-Flow/src/content/posts/your-slug.md`
**IMAGES:** Place in `Temporal-Flow/public/blog-images/` — reference as `/blog-images/filename.jpg`

**SCHEMA NOTES:**
- bannerType can be: "image", "video", or "timeline"
- For video banners use bannerData.videoId (YouTube ID)
- timelineYear/Era/Location are optional but used for the interactive timeline
- tags must be an array: [Tag1, Tag2] or on separate lines with - prefix
- draft: false to publish, true to hide

**FRONTMATTER TEMPLATE:**
```yaml
---
title: "Post Title"
published: 2026-03-15
description: "Brief description of the post."
image: "/blog-images/my-image.jpg"
avatarImage: "/posts/generic/avatar.png"
authorName: "Your Name"
authorBio: "Short bio or role"
bannerType: "image"
bannerData:
  image: "/blog-images/my-image.jpg"
timelineYear: 2026
timelineEra: "modern"
timelineLocation: "Location Name"
isKeyEvent: false
showImageOnPost: false
tags: [Tag1, Tag2]
category: "Blog"
draft: false
lang: "en"
---
```

--- MY DRAFT POST BELOW ---

[Paste your draft here]
