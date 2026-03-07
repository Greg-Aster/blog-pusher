import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Markdown from '@ronradtke/react-native-markdown-display'
import { createPostDraft, serializeDraft } from '../utils/frontmatter'
import { saveDraft, addToQueue, updateQueueItem } from '../utils/storage'

const SITES = [
  { id: 'temporal', label: 'Temporal Flow', color: '#4a90d9' },
  { id: 'dndiy', label: 'DNDIY', color: '#9b59b6' },
  { id: 'travel', label: 'Trail Log', color: '#2d6a4f' },
  { id: 'megameal', label: 'MEGAMEAL', color: '#c0392b' },
]

const TABS = [
  { id: 'meta', label: 'Metadata', icon: 'list-outline' },
  { id: 'edit', label: 'Edit', icon: 'create-outline' },
  { id: 'preview', label: 'Preview', icon: 'eye-outline' },
  { id: 'diff', label: 'Diff', icon: 'git-compare-outline' },
]

// Markdown toolbar actions that wrap selection or insert at cursor
const MD_ACTIONS = [
  { label: 'H1', insert: '# ', wrap: false },
  { label: 'H2', insert: '## ', wrap: false },
  { label: 'H3', insert: '### ', wrap: false },
  { label: 'B', insert: '**', wrap: true, style: { fontWeight: '700' } },
  { label: 'I', insert: '_', wrap: true, style: { fontStyle: 'italic' } },
  { label: '~~', insert: '~~', wrap: true },
  { label: 'UL', insert: '- ', wrap: false },
  { label: 'OL', insert: '1. ', wrap: false },
  { label: '[ ]', insert: '- [ ] ', wrap: false },
  { label: '>', insert: '> ', wrap: false },
  { label: '```', insert: '```\n', wrap: true, suffix: '\n```' },
  { label: '`', insert: '`', wrap: true },
  { label: 'Link', insert: '[', wrap: true, suffix: '](url)' },
  { label: 'Img', insert: '![alt](', wrap: false, suffix: ')' },
  { label: '---', insert: '\n---\n', wrap: false },
]

export default function PostEditorScreen({ navigation, route }) {
  const params = route.params || {}
  const isFromQueue = !!params.queueItem

  // Build initial draft from params
  const [draft, setDraft] = useState(() => {
    if (params.draft) return params.draft
    if (params.queueItem) {
      return createPostDraft({
        raw: params.queueItem.content || '',
        filename: params.queueItem.filename,
        siteId: params.queueItem.siteId,
        images: params.queueItem.images,
      })
    }
    if (params.raw !== undefined) {
      return createPostDraft({
        raw: params.raw,
        filename: params.filename,
        siteId: params.siteId,
        images: params.images,
      })
    }
    return createPostDraft({ raw: '', filename: 'new-post.md', siteId: 'temporal' })
  })

  const [activeTab, setActiveTab] = useState('meta')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef(null)
  const bodyRef = useRef(null)
  const bodySelection = useRef({ start: 0, end: 0 })

  // Autosave 1.5s after last edit
  const scheduleSave = useCallback((updated) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await saveDraft(updated)
      setSaving(false)
    }, 1500)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  function updateDraft(changes) {
    setDraft(prev => {
      const updated = { ...prev, ...changes, dirty: true, updatedAt: new Date().toISOString() }
      scheduleSave(updated)
      return updated
    })
  }

  function updateField(field, value) {
    updateDraft({ [field]: value })
  }

  // ---- Toolbar action ----
  function handleToolbarAction(action) {
    const { start, end } = bodySelection.current
    const text = draft.body || ''
    const selected = text.slice(start, end)

    let newText, newCursorPos
    if (action.wrap && selected) {
      const suffix = action.suffix || action.insert
      const wrapped = `${action.insert}${selected}${suffix}`
      newText = text.slice(0, start) + wrapped + text.slice(end)
      newCursorPos = start + wrapped.length
    } else {
      const toInsert = action.insert + (action.suffix || '')
      newText = text.slice(0, start) + toInsert + text.slice(end)
      newCursorPos = start + action.insert.length
    }

    updateField('body', newText)
    // Try to set cursor position after React renders
    setTimeout(() => {
      bodyRef.current?.setNativeProps?.({
        selection: { start: newCursorPos, end: newCursorPos },
      })
    }, 50)
  }

  // ---- Save to queue ----
  async function handleSaveToQueue() {
    const content = serializeDraft(draft)
    if (isFromQueue) {
      await updateQueueItem(params.queueItem.id, {
        content,
        filename: draft.filename,
        siteId: draft.repoSiteId,
        images: draft.attachedImages,
      })
      Alert.alert('Updated', 'Queue item updated with your edits.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } else {
      await addToQueue({
        id: draft.id,
        filename: draft.filename,
        content,
        siteId: draft.repoSiteId,
        images: draft.attachedImages,
        addedAt: new Date().toISOString(),
      })
      Alert.alert('Queued', `"${draft.filename}" added to push queue.`, [
        { text: 'OK', onPress: () => navigation.navigate('Home') },
      ])
    }
  }

  // ---- Render tabs ----
  const activeSite = SITES.find(s => s.id === draft.repoSiteId)
  const serialized = serializeDraft(draft)

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {draft.filename || 'New Post'}
        </Text>
        <Text style={styles.saveStatus}>
          {saving ? 'Saving...' : draft.dirty ? 'Edited' : ''}
        </Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.id ? '#2d6a4f' : '#999'}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'meta' && (
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.tabContentInner}
          keyboardShouldPersistTaps="handled"
        >
          <MetadataForm draft={draft} updateField={updateField} />
        </ScrollView>
      )}

      {activeTab === 'edit' && (
        <View style={styles.tabContent}>
          {/* Toolbar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.toolbar}
            contentContainerStyle={styles.toolbarInner}
          >
            {MD_ACTIONS.map(action => (
              <TouchableOpacity
                key={action.label}
                style={styles.toolbarBtn}
                onPress={() => handleToolbarAction(action)}
              >
                <Text style={[styles.toolbarBtnText, action.style]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput
            ref={bodyRef}
            style={styles.bodyInput}
            value={draft.body || ''}
            onChangeText={v => updateField('body', v)}
            onSelectionChange={e => {
              bodySelection.current = e.nativeEvent.selection
            }}
            placeholder="Write your post in Markdown..."
            placeholderTextColor="#aaa"
            multiline
            textAlignVertical="top"
            autoCapitalize="sentences"
            autoCorrect
          />
        </View>
      )}

      {activeTab === 'preview' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.previewContainer}>
          <MarkdownPreview text={serialized} />
        </ScrollView>
      )}

      {activeTab === 'diff' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.previewContainer}>
          <DiffView original={draft.rawOriginal || ''} current={serialized} />
        </ScrollView>
      )}

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.queueBtn, { backgroundColor: activeSite?.color || '#2d6a4f' }]}
          onPress={handleSaveToQueue}
          activeOpacity={0.8}
        >
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={styles.queueBtnText}>
            {isFromQueue ? 'Update in Queue' : 'Add to Queue'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

// ---------------------------------------------------------------------------
// Metadata Form
// ---------------------------------------------------------------------------
function MetadataForm({ draft, updateField }) {
  return (
    <>
      {/* Site selector */}
      <Text style={styles.label}>Target Site</Text>
      <View style={styles.siteRow}>
        {SITES.map(site => (
          <TouchableOpacity
            key={site.id}
            style={[
              styles.siteChip,
              draft.repoSiteId === site.id && { backgroundColor: site.color, borderColor: site.color },
            ]}
            onPress={() => updateField('repoSiteId', site.id)}
          >
            <Text style={[styles.siteChipText, draft.repoSiteId === site.id && { color: '#fff' }]}>
              {site.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filename */}
      <Text style={styles.label}>Filename</Text>
      <TextInput
        style={styles.input}
        value={draft.filename || ''}
        onChangeText={v => updateField('filename', v)}
        placeholder="my-post.md"
        placeholderTextColor="#aaa"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Title */}
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.titleInput}
        value={draft.title || ''}
        onChangeText={v => updateField('title', v)}
        placeholder="Post title"
        placeholderTextColor="#aaa"
        autoCapitalize="words"
      />

      {/* Description */}
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={draft.description || ''}
        onChangeText={v => updateField('description', v)}
        placeholder="Short summary (optional)"
        placeholderTextColor="#aaa"
        multiline
      />

      {/* Published date */}
      <Text style={styles.label}>Published Date</Text>
      <TextInput
        style={styles.input}
        value={draft.published || ''}
        onChangeText={v => updateField('published', v)}
        placeholder="2026-03-07T12:00:00Z"
        placeholderTextColor="#aaa"
        autoCapitalize="none"
      />

      {/* Tags */}
      <Text style={styles.label}>Tags</Text>
      <TextInput
        style={styles.input}
        value={Array.isArray(draft.tags) ? draft.tags.join(', ') : draft.tags || ''}
        onChangeText={v =>
          updateField('tags', v.split(',').map(t => t.trim()).filter(Boolean))
        }
        placeholder="Hiking, Nature, Trail (comma separated)"
        placeholderTextColor="#aaa"
        autoCapitalize="words"
      />

      {/* Category */}
      <Text style={styles.label}>Category</Text>
      <TextInput
        style={styles.input}
        value={draft.category || ''}
        onChangeText={v => updateField('category', v)}
        placeholder="Blog"
        placeholderTextColor="#aaa"
        autoCapitalize="words"
      />

      {/* Hero Image */}
      <Text style={styles.label}>Hero Image Path</Text>
      <TextInput
        style={styles.input}
        value={draft.heroImage || ''}
        onChangeText={v => updateField('heroImage', v)}
        placeholder="/blog-images/hero.jpg"
        placeholderTextColor="#aaa"
        autoCapitalize="none"
      />

      {/* Draft toggle */}
      <TouchableOpacity
        style={styles.draftToggle}
        onPress={() => updateField('draft', !draft.draft)}
      >
        <Ionicons
          name={draft.draft ? 'checkbox-outline' : 'square-outline'}
          size={22}
          color={draft.draft ? '#e67e22' : '#aaa'}
        />
        <Text style={[styles.draftToggleText, draft.draft && { color: '#e67e22' }]}>
          Mark as draft (unpublished)
        </Text>
      </TouchableOpacity>

      {/* Unknown frontmatter keys notice */}
      {Object.keys(draft.rawFrontmatter || {}).length > 0 && (
        <View style={styles.rawNotice}>
          <Ionicons name="information-circle-outline" size={16} color="#888" />
          <Text style={styles.rawNoticeText}>
            {Object.keys(draft.rawFrontmatter).length} frontmatter key(s) preserved from original file
          </Text>
        </View>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Markdown Preview using @ronradtke/react-native-markdown-display
// ---------------------------------------------------------------------------
const markdownStyles = {
  body: { color: '#1a2e1a', fontSize: 15, lineHeight: 22 },
  heading1: { fontSize: 26, fontWeight: '700', color: '#1a2e1a', marginTop: 12, marginBottom: 4 },
  heading2: { fontSize: 22, fontWeight: '700', color: '#1a2e1a', marginTop: 12, marginBottom: 4 },
  heading3: { fontSize: 19, fontWeight: '700', color: '#1a2e1a', marginTop: 12, marginBottom: 4 },
  heading4: { fontSize: 17, fontWeight: '700', color: '#1a2e1a', marginTop: 10, marginBottom: 4 },
  heading5: { fontSize: 15, fontWeight: '700', color: '#1a2e1a', marginTop: 8, marginBottom: 4 },
  heading6: { fontSize: 14, fontWeight: '700', color: '#1a2e1a', marginTop: 8, marginBottom: 4 },
  hr: { backgroundColor: '#ddd', height: 1, marginVertical: 12 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#2d6a4f',
    paddingLeft: 12,
    marginVertical: 4,
    backgroundColor: 'transparent',
  },
  code_inline: {
    backgroundColor: '#e8ece8',
    color: '#2d6a4f',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
  },
  code_block: {
    backgroundColor: '#1a2e1a',
    color: '#aed8c0',
    borderRadius: 8,
    padding: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  fence: {
    backgroundColor: '#1a2e1a',
    color: '#aed8c0',
    borderRadius: 8,
    padding: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  link: { color: '#2d6a4f', textDecorationLine: 'underline' },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  s: { textDecorationLine: 'line-through' },
  list_item: { marginVertical: 2 },
  bullet_list_icon: { color: '#2d6a4f' },
  ordered_list_icon: { color: '#2d6a4f' },
  image: { borderRadius: 8 },
}

function MarkdownPreview({ text }) {
  if (!text) {
    return <Text style={styles.previewEmpty}>Nothing to preview yet.</Text>
  }

  // Strip frontmatter from preview — only show the body content
  const bodyOnly = text.replace(/^---[\t ]*\r?\n[\s\S]*?\r?\n---[\t ]*(?:\r?\n|$)/, '')

  return (
    <Markdown style={markdownStyles}>
      {bodyOnly || 'Nothing to preview yet.'}
    </Markdown>
  )
}

// ---------------------------------------------------------------------------
// Simple Diff View
// ---------------------------------------------------------------------------
function DiffView({ original, current }) {
  if (!original && !current) {
    return <Text style={styles.previewEmpty}>No content to compare.</Text>
  }
  if (!original) {
    return (
      <View>
        <Text style={styles.diffLabel}>New file (no original to compare)</Text>
        <View style={styles.diffBox}>
          <Text style={styles.diffText}>{current}</Text>
        </View>
      </View>
    )
  }

  const origLines = original.split('\n')
  const currLines = current.split('\n')
  const maxLen = Math.max(origLines.length, currLines.length)

  const changes = { added: 0, removed: 0, unchanged: 0 }
  const diffLines = []

  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i]
    const c = currLines[i]
    if (o === undefined) {
      diffLines.push({ type: 'added', text: c })
      changes.added++
    } else if (c === undefined) {
      diffLines.push({ type: 'removed', text: o })
      changes.removed++
    } else if (o !== c) {
      diffLines.push({ type: 'removed', text: o })
      diffLines.push({ type: 'added', text: c })
      changes.removed++
      changes.added++
    } else {
      diffLines.push({ type: 'same', text: o })
      changes.unchanged++
    }
  }

  return (
    <View>
      <View style={styles.diffSummary}>
        <Text style={styles.diffSummaryText}>
          +{changes.added} added, -{changes.removed} removed, {changes.unchanged} unchanged
        </Text>
      </View>
      <View style={styles.diffBox}>
        {diffLines.map((line, i) => (
          <Text
            key={i}
            style={[
              styles.diffLine,
              line.type === 'added' && styles.diffAdded,
              line.type === 'removed' && styles.diffRemoved,
            ]}
          >
            {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
            {line.text}
          </Text>
        ))}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
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
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600', flex: 1, marginHorizontal: 12 },
  saveStatus: { color: '#aed8c0', fontSize: 12, width: 55, textAlign: 'right' },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#2d6a4f' },
  tabText: { fontSize: 12, color: '#999', fontWeight: '500' },
  tabTextActive: { color: '#2d6a4f', fontWeight: '700' },

  // Tab content
  tabContent: { flex: 1 },
  tabContentInner: { padding: 16, paddingBottom: 20 },

  // Form
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  siteRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  siteChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  siteChipText: { fontSize: 13, fontWeight: '500', color: '#555' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a2e1a',
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  titleInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#1a2e1a',
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  draftToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  draftToggleText: { fontSize: 14, color: '#555' },
  rawNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    padding: 10,
    backgroundColor: '#f8f9f8',
    borderRadius: 8,
  },
  rawNoticeText: { fontSize: 12, color: '#888', flex: 1 },

  // Toolbar
  toolbar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e0',
    maxHeight: 44,
  },
  toolbarInner: { paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  toolbarBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  toolbarBtnText: {
    fontSize: 14,
    color: '#2d6a4f',
    fontWeight: '600',
    fontFamily: 'monospace',
  },

  // Body editor
  bodyInput: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    fontSize: 15,
    color: '#1a2e1a',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlignVertical: 'top',
  },

  // Preview
  previewContainer: { padding: 16, paddingBottom: 40 },
  previewEmpty: { fontSize: 15, color: '#aaa', textAlign: 'center', marginTop: 40 },

  // Diff
  diffLabel: { fontSize: 14, color: '#555', fontWeight: '600', marginBottom: 8 },
  diffSummary: {
    backgroundColor: '#1a2e1a',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  diffSummaryText: { color: '#aed8c0', fontSize: 13, fontFamily: 'monospace' },
  diffBox: {
    backgroundColor: '#1a2e1a',
    borderRadius: 8,
    padding: 12,
  },
  diffText: { color: '#aed8c0', fontSize: 13, fontFamily: 'monospace', lineHeight: 20 },
  diffLine: { color: '#aed8c0', fontSize: 13, fontFamily: 'monospace', lineHeight: 20 },
  diffAdded: { color: '#7ddf90', backgroundColor: 'rgba(125,223,144,0.1)' },
  diffRemoved: { color: '#ff8080', backgroundColor: 'rgba(255,128,128,0.1)' },

  // Bottom bar
  bottomBar: {
    padding: 12,
    paddingBottom: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8eee8',
  },
  queueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
  },
  queueBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
