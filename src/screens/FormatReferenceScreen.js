import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Clipboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const SITES = [
  { id: 'temporal', label: 'Temporal Flow', color: '#4a90d9', file: '.md' },
  { id: 'dndiy', label: 'DNDIY', color: '#9b59b6', file: '.md' },
  { id: 'travel', label: 'Trail Log', color: '#2d6a4f', file: '.md' },
  { id: 'megameal', label: 'MEGAMEAL', color: '#c0392b', file: '.md or .mdx' },
]

// ─── FRONTMATTER TEMPLATES ────────────────────────────────────────────────────

const TEMPLATES = {
  temporal: `---
title: "Post Title"
published: 2026-03-15
description: "Brief description of the post."
image: "/posts/my-post/cover.jpg"
avatarImage: "/posts/generic/avatar.png"
authorName: "Your Name"
authorBio: "Short bio or role"
bannerType: "image"
bannerData:
  image: "/posts/my-post/cover.jpg"
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

Post content here. Markdown supported.`,

  dndiy: `---
title: "Post Title"
published: 2026-03-15
description: "Brief description of the post."
image: "/posts/my-post/cover.jpg"
avatarImage: "/posts/generic/avatar.png"
authorName: "Your Name"
authorBio: "Short bio or character description"
bannerType: "image"
bannerData:
  image: "/posts/my-post/cover.jpg"
timelineYear: 2026
timelineEra: "modern"
timelineLocation: "Location in the MEGA MEAL universe"
isKeyEvent: false
showImageOnPost: false
tags: [Tag1, Tag2]
category: "Blog"
draft: false
lang: "en"
---

Post content here. Markdown supported.`,

  travel: `---
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
## Notes`,

  megameal: `---
title: "Post Title"
published: 2026-03-15
description: "Brief description of the post."
image: "/posts/my-post/cover.jpg"
avatarImage: "/posts/generic/avatar.png"
authorName: "Character Name"
authorBio: "Character description or role"
authorLink: "/about/character-slug/"
oneColumn: false
bannerType: "image"
bannerData:
  imageUrl: "/posts/my-post/cover.jpg"
timelineYear: 33900
timelineEra: "golden-age"
timelineLocation: "Location in the MEGA MEAL universe"
isKeyEvent: false
showImageOnPost: false
tags: [Tag1, Tag2]
category: "MEGA MEAL"
draft: false
lang: ""
mascotContext: "Brief plain-English summary of this post for the AI mascot chatbot."
---

Post content here. MDX supported — you can use JSX components.`,
}

// ─── AI EDITING PROMPTS ───────────────────────────────────────────────────────

const SITE_NOTES = {
  temporal: `SITE: Temporal Flow (temporalflow.org)
SCHEMA SOURCE: Local config.ts (Astro content collection)
FILE FORMAT: .md (Markdown)
FILE LOCATION IN REPO: Temporal-Flow/src/content/posts/your-slug.md
IMAGES: Place in Temporal-Flow/public/blog-images/ — reference as /blog-images/filename.jpg

NOTES:
- bannerType can be: "image", "video", or "timeline"
- For video banners use bannerData.videoId (YouTube ID)
- timelineYear/Era/Location are optional but used for the interactive timeline
- tags must be an array: [Tag1, Tag2] or on separate lines with - prefix
- draft: false to publish, true to hide`,

  dndiy: `SITE: DNDIY (dndiy.org)
SCHEMA SOURCE: Local config.ts (Astro content collection)
FILE FORMAT: .md (Markdown)
FILE LOCATION IN REPO: DNDIY.github.io/src/content/posts/your-slug.md
IMAGES: Place in DNDIY.github.io/public/blog-images/ — reference as /blog-images/filename.jpg

NOTES:
- Same schema as Temporal Flow
- bannerType can be: "image", "video", or "timeline"
- For video banners use bannerData.videoId (YouTube ID)
- timelineYear/Era/Location optional but used for the interactive timeline
- tags must be an array: [Tag1, Tag2] or on separate lines with - prefix
- draft: false to publish, true to hide`,

  travel: `SITE: Trail Log (travel.dndiy.org)
SCHEMA SOURCE: Shared blog-core package
FILE FORMAT: .md (Markdown)
FILE LOCATION IN REPO: apps/travel/src/content/posts/your-slug.md
IMAGES: Place in apps/travel/public/blog-images/ — reference as /blog-images/filename.jpg

NOTES:
- Keep it minimal — title, published, description, tags, category is all you need
- tags should be on separate lines with - prefix (YAML list style)
- category is typically "Trail Notes"
- No timeline or banner fields needed for trail posts
- draft: false to publish (or omit — defaults to false)`,

  megameal: `SITE: MEGAMEAL (megameal.org)
SCHEMA SOURCE: Shared blog-core package
FILE FORMAT: .md or .mdx (MDX allows JSX components inside markdown)
FILE LOCATION IN REPO: MEGAMEAL/src/content/posts/your-slug.md (or .mdx)
IMAGES: Place in MEGAMEAL/public/blog-images/ — reference as /blog-images/filename.jpg

NOTES:
- bannerType can be: "image", "video", "timeline", or "assistant"
- For video banners use bannerData.videoId (YouTube ID)
- For image banners use bannerData.imageUrl (NOT image — different from other sites)
- oneColumn: true for wide full-width layout
- authorLink should be /about/slug/ if the author has a profile page
- mascotContext: plain English summary for the AI chatbot — no markdown, just a sentence or two
- timelineEra valid values include: "awakening-era", "golden-age", "conflict-epoch", "singularity-wars"
- tags must be an array: [Tag1, Tag2]
- draft: false to publish, true to hide
- MDX: if using .mdx you can embed Svelte/JSX components`,
}

function buildAiPrompt(siteId) {
  const template = TEMPLATES[siteId]
  const notes = SITE_NOTES[siteId]
  return `You are editing a blog post for my personal website. Please:

1. Review my draft for clarity, fix grammar/spelling errors
2. Rewrite or improve the content if needed — keep my voice and intent
3. Generate correct frontmatter using the schema below
4. Return the complete, corrected post as a single markdown code block, ready to save and publish
5. The filename should be a lowercase hyphenated slug of the title (e.g. my-post-title.md)

${notes}

FRONTMATTER TEMPLATE:
${template}

--- MY DRAFT POST BELOW ---
[Paste your draft here]`
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

function CopyBlock({ label, content, mono = true }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    Clipboard.setString(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <View style={styles.block}>
      <View style={styles.blockHeader}>
        <Text style={styles.blockLabel}>{label}</Text>
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={16}
            color={copied ? '#2d6a4f' : '#666'}
          />
          <Text style={[styles.copyBtnText, copied && { color: '#2d6a4f' }]}>
            {copied ? 'Copied!' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={mono ? styles.codeText : styles.promptText}>{content}</Text>
      </ScrollView>
    </View>
  )
}

export default function FormatReferenceScreen({ navigation }) {
  const [activeSite, setActiveSite] = useState('travel')
  const site = SITES.find(s => s.id === activeSite)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Format Reference</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Site selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {SITES.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[
              styles.tab,
              activeSite === s.id && { backgroundColor: s.color, borderColor: s.color },
            ]}
            onPress={() => setActiveSite(s.id)}
          >
            <Text style={[styles.tabText, activeSite === s.id && { color: '#fff' }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.infoRow}>
          <View style={[styles.badge, { backgroundColor: site.color }]}>
            <Text style={styles.badgeText}>{site.label}</Text>
          </View>
          <Text style={styles.fileNote}>File format: {site.file}</Text>
        </View>

        {/* Site notes */}
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>{SITE_NOTES[activeSite]}</Text>
        </View>

        {/* Frontmatter template */}
        <CopyBlock
          label="Frontmatter Template"
          content={TEMPLATES[activeSite]}
          mono
        />

        {/* AI editing prompt */}
        <CopyBlock
          label="AI Editing Prompt — paste into Claude / ChatGPT"
          content={buildAiPrompt(activeSite)}
          mono={false}
        />

        <Text style={styles.tip}>
          Tip: Copy the AI prompt, open your AI app, paste it, then paste your draft at the bottom where it says [Paste your draft here]. The AI will return a correctly formatted, publish-ready post.
        </Text>

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  header: {
    backgroundColor: '#1a3a2a',
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8eee8' },
  tabBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  tabText: { fontSize: 13, fontWeight: '500', color: '#555' },
  content: { padding: 16, paddingBottom: 40 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  fileNote: { fontSize: 13, color: '#666' },
  notesBox: {
    backgroundColor: '#1a3a2a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  notesText: { color: '#aed8c0', fontSize: 12, lineHeight: 18, fontFamily: 'monospace' },
  block: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e0e8e0',
    overflow: 'hidden',
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e8eee8',
    backgroundColor: '#f8faf8',
  },
  blockLabel: { fontSize: 12, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 0.4 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyBtnText: { fontSize: 13, color: '#666', fontWeight: '600' },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#1a2e1a',
    lineHeight: 18,
    padding: 14,
  },
  promptText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 20,
    padding: 14,
  },
  tip: {
    fontSize: 13,
    color: '#888',
    lineHeight: 19,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },
})
