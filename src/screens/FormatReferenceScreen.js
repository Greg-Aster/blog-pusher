import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Clipboard,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadSettings } from '../utils/storage'

// ─── SITE CONFIG ──────────────────────────────────────────────────────────────

const SITES = [
  { id: 'temporal', label: 'Temporal Flow', color: '#4a90d9' },
  { id: 'dndiy', label: 'DNDIY', color: '#9b59b6' },
  { id: 'travel', label: 'Trail Log', color: '#2d6a4f' },
  { id: 'megameal', label: 'MEGAMEAL', color: '#c0392b' },
]

// Reference files live in the blog-pusher repo
const REFERENCE_PROJECT = 'Greg.Aster/blog-pusher'
const CACHE_PREFIX = 'ref_cache_'
const CACHE_TS_PREFIX = 'ref_cache_ts_'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// ─── FALLBACK CONTENT ─────────────────────────────────────────────────────────
// Used when offline and no cache exists yet

const FALLBACK = {
  temporal: `# Temporal Flow — Post Format Reference

## Frontmatter Template

\`\`\`yaml
---
title: "Post Title"
published: 2026-03-15
description: "Brief description of the post."
image: "/blog-images/my-image.jpg"
tags: [Tag1, Tag2]
category: "Blog"
draft: false
---
\`\`\`

(Connect to internet to load full reference from GitLab)`,

  dndiy: `# DNDIY — Post Format Reference

## Frontmatter Template

\`\`\`yaml
---
title: "Post Title"
published: 2026-03-15
description: "Brief description of the post."
image: "/blog-images/my-image.jpg"
tags: [Tag1, Tag2]
category: "Blog"
draft: false
---
\`\`\`

(Connect to internet to load full reference from GitLab)`,

  travel: `# Trail Log — Post Format Reference

## Frontmatter Template

\`\`\`yaml
---
title: "Trail Entry Title"
published: 2026-03-15
description: "One sentence summary."
tags:
  - pacific-crest-trail
  - hiking
category: "Trail Notes"
---
\`\`\`

(Connect to internet to load full reference from GitLab)`,

  megameal: `# MEGAMEAL — Post Format Reference

## Frontmatter Template

\`\`\`yaml
---
title: "Post Title"
published: 2026-03-15
description: "Brief description."
bannerData:
  imageUrl: "/blog-images/my-image.jpg"
tags: [Tag1, Tag2]
category: "MEGA MEAL"
draft: false
---
\`\`\`

(Connect to internet to load full reference from GitLab)`,
}

// ─── GITLAB FETCH ─────────────────────────────────────────────────────────────

async function fetchReferenceFile(siteId, token) {
  const filePath = `src/reference/${siteId}.md`
  const encodedProject = encodeURIComponent(REFERENCE_PROJECT)
  const encodedFile = encodeURIComponent(filePath)
  const url = `https://gitlab.com/api/v4/projects/${encodedProject}/repository/files/${encodedFile}/raw?ref=main`

  try {
    const res = await fetch(url, {
      headers: token ? { 'PRIVATE-TOKEN': token } : {},
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

// ─── EXTRACT AI PROMPT ────────────────────────────────────────────────────────
// Returns the AI editing prompt portion of the reference file

function extractAiPrompt(content) {
  // Look for "You are editing" which starts the prompt
  const idx = content.indexOf('You are editing')
  if (idx === -1) return content
  // Strip the trailing "--- MY DRAFT POST BELOW ---" placeholder
  const prompt = content.slice(idx)
  return prompt
}

// ─── COPY BUTTON ──────────────────────────────────────────────────────────────

function CopyButton({ text, label, icon = 'copy-outline', color = '#666' }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    Clipboard.setString(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
      <Ionicons
        name={copied ? 'checkmark' : icon}
        size={15}
        color={copied ? '#2d6a4f' : color}
      />
      <Text style={[styles.copyBtnText, copied && { color: '#2d6a4f' }]}>
        {copied ? 'Copied!' : label}
      </Text>
    </TouchableOpacity>
  )
}

// ─── SCREEN ───────────────────────────────────────────────────────────────────

export default function FormatReferenceScreen({ navigation }) {
  const [activeSite, setActiveSite] = useState('travel')
  const [contents, setContents] = useState({})   // siteId -> markdown text
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('idle')   // 'idle' | 'fetching' | 'cached' | 'live' | 'offline'

  // Load cached content on mount, then try to refresh
  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const settings = await loadSettings()
    const token = settings.providers?.gitlab?.token || settings.token || ''

    // First: load from cache to show something immediately
    const cached = {}
    for (const site of SITES) {
      try {
        const raw = await AsyncStorage.getItem(CACHE_PREFIX + site.id)
        if (raw) cached[site.id] = raw
      } catch {}
    }
    if (Object.keys(cached).length > 0) {
      setContents(cached)
      setStatus('cached')
    }

    // Then: fetch fresh from GitLab
    await refreshFromGitLab(token, cached)
    setLoading(false)
  }

  async function refreshFromGitLab(token, existing = {}) {
    setStatus('fetching')
    const fresh = { ...existing }
    let anySuccess = false

    for (const site of SITES) {
      const text = await fetchReferenceFile(site.id, token)
      if (text) {
        fresh[site.id] = text
        anySuccess = true
        try {
          await AsyncStorage.setItem(CACHE_PREFIX + site.id, text)
          await AsyncStorage.setItem(CACHE_TS_PREFIX + site.id, Date.now().toString())
        } catch {}
      }
    }

    setContents(fresh)
    setStatus(anySuccess ? 'live' : Object.keys(existing).length > 0 ? 'cached' : 'offline')
  }

  async function handleRefresh() {
    setLoading(true)
    const settings = await loadSettings()
    await refreshFromGitLab(settings.providers?.gitlab?.token || settings.token || '', contents)
    setLoading(false)
  }

  const site = SITES.find(s => s.id === activeSite)
  const content = contents[activeSite] || FALLBACK[activeSite] || ''
  const aiPrompt = extractAiPrompt(content)

  const statusInfo = {
    live:     { icon: 'cloud-done-outline',    color: '#2d6a4f', text: 'Live from GitLab' },
    cached:   { icon: 'save-outline',          color: '#e67e22', text: 'Cached (offline ok)' },
    fetching: { icon: 'cloud-upload-outline',  color: '#4a90d9', text: 'Refreshing…' },
    offline:  { icon: 'cloud-offline-outline', color: '#aaa',    text: 'Offline — fallback' },
    idle:     { icon: 'ellipse-outline',        color: '#aaa',    text: '' },
  }[status] || { icon: 'ellipse-outline', color: '#aaa', text: '' }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Format Reference</Text>
        <TouchableOpacity
          onPress={handleRefresh}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="refresh-outline" size={22} color="#fff" />
          }
        </TouchableOpacity>
      </View>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <Ionicons name={statusInfo.icon} size={13} color={statusInfo.color} />
        <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
      </View>

      {/* Site tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {SITES.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.tab, activeSite === s.id && { backgroundColor: s.color, borderColor: s.color }]}
            onPress={() => setActiveSite(s.id)}
          >
            <Text style={[styles.tabText, activeSite === s.id && { color: '#fff' }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.content}>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <View style={[styles.siteBadge, { backgroundColor: site.color }]}>
            <Text style={styles.siteBadgeText}>{site.label}</Text>
          </View>
          <View style={styles.actions}>
            <CopyButton text={aiPrompt} label="Copy AI Prompt" icon="sparkles-outline" color={site.color} />
            <CopyButton text={content} label="Copy All" icon="copy-outline" />
          </View>
        </View>

        <Text style={styles.hint}>
          Tip: "Copy AI Prompt" → paste into Claude or ChatGPT → add your draft at the bottom.
        </Text>

        {/* Full markdown content */}
        <View style={styles.mdBox}>
          <Text style={styles.mdText}>{content}</Text>
        </View>

        <Text style={styles.editNote}>
          Edit these files at gitlab.com/Greg.Aster/blog-pusher in src/reference/ — tap refresh to sync.
        </Text>

      </ScrollView>
    </View>
  )
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

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
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e8eee8',
  },
  statusText: { fontSize: 11, fontWeight: '500' },
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  siteBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  siteBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  copyBtnText: { fontSize: 12, color: '#666', fontWeight: '600' },
  hint: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 12,
    lineHeight: 17,
  },
  mdBox: {
    backgroundColor: '#1a3a2a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  mdText: {
    color: '#c8e6c9',
    fontSize: 12,
    lineHeight: 19,
    fontFamily: 'monospace',
  },
  editNote: {
    fontSize: 11,
    color: '#aaa',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 16,
  },
})
