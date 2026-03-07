import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
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
import * as ImagePicker from 'expo-image-picker'
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

// Frontmatter templates per site
const SITE_TEMPLATES = {
  temporal: {
    title: '',
    description: '',
    published: '',
    tags: [],
    category: 'Blog',
    heroImage: '',
    draft: true,
  },
  dndiy: {
    title: '',
    description: '',
    published: '',
    tags: [],
    category: 'Campaign',
    heroImage: '',
    draft: true,
  },
  travel: {
    title: '',
    description: '',
    published: '',
    tags: [],
    category: 'Trail',
    heroImage: '',
    draft: true,
  },
  megameal: {
    title: '',
    description: '',
    published: '',
    tags: [],
    category: 'Recipe',
    heroImage: '',
    draft: true,
  },
}

// ---------------------------------------------------------------------------
// Slug helper: title → filename
// ---------------------------------------------------------------------------
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function generateFilename(title, published) {
  const slug = slugify(title) || 'untitled'
  if (published) {
    const dateStr = published.slice(0, 10) // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return `${dateStr}-${slug}.md`
    }
  }
  return `${slug}.md`
}

// ---------------------------------------------------------------------------
// Auto-indent and list continuation helpers
// ---------------------------------------------------------------------------
function getLineAt(text, pos) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1
  return text.slice(lineStart, pos)
}

function handleNewline(text, cursorPos) {
  const currentLine = getLineAt(text, cursorPos)

  // Unordered list continuation: "- ", "* ", "- [ ] ", "- [x] "
  const ulMatch = currentLine.match(/^(\s*)([-*])\s(\[[ x]\]\s)?/)
  if (ulMatch) {
    const lineContent = currentLine.replace(/^(\s*)([-*])\s(\[[ x]\]\s)?/, '').trim()
    // If the line is empty (just the prefix), remove the prefix instead of continuing
    if (!lineContent) {
      const lineStart = text.lastIndexOf('\n', cursorPos - 1) + 1
      return {
        text: text.slice(0, lineStart) + text.slice(cursorPos),
        cursor: lineStart,
      }
    }
    const prefix = ulMatch[3] ? `${ulMatch[1]}${ulMatch[2]} [ ] ` : `${ulMatch[1]}${ulMatch[2]} `
    const newText = text.slice(0, cursorPos) + '\n' + prefix + text.slice(cursorPos)
    return { text: newText, cursor: cursorPos + 1 + prefix.length }
  }

  // Ordered list continuation: "1. ", "2. ", etc.
  const olMatch = currentLine.match(/^(\s*)(\d+)\.\s/)
  if (olMatch) {
    const lineContent = currentLine.replace(/^(\s*)\d+\.\s/, '').trim()
    if (!lineContent) {
      const lineStart = text.lastIndexOf('\n', cursorPos - 1) + 1
      return {
        text: text.slice(0, lineStart) + text.slice(cursorPos),
        cursor: lineStart,
      }
    }
    const nextNum = parseInt(olMatch[2], 10) + 1
    const prefix = `${olMatch[1]}${nextNum}. `
    const newText = text.slice(0, cursorPos) + '\n' + prefix + text.slice(cursorPos)
    return { text: newText, cursor: cursorPos + 1 + prefix.length }
  }

  // Blockquote continuation
  const bqMatch = currentLine.match(/^(\s*>+\s?)/)
  if (bqMatch) {
    const lineContent = currentLine.slice(bqMatch[0].length).trim()
    if (!lineContent) {
      const lineStart = text.lastIndexOf('\n', cursorPos - 1) + 1
      return {
        text: text.slice(0, lineStart) + text.slice(cursorPos),
        cursor: lineStart,
      }
    }
    const prefix = bqMatch[1]
    const newText = text.slice(0, cursorPos) + '\n' + prefix + text.slice(cursorPos)
    return { text: newText, cursor: cursorPos + 1 + prefix.length }
  }

  // Indentation preservation
  const indentMatch = currentLine.match(/^(\s+)/)
  if (indentMatch) {
    const indent = indentMatch[1]
    const newText = text.slice(0, cursorPos) + '\n' + indent + text.slice(cursorPos)
    return { text: newText, cursor: cursorPos + 1 + indent.length }
  }

  return null // No special handling, let default newline happen
}

// Auto-close pairs
const CLOSE_PAIRS = {
  '(': ')',
  '[': ']',
  '{': '}',
  '`': '`',
  '"': '"',
  "'": "'",
}

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
        destination: params.queueItem.destination,
        remoteFile: params.queueItem.remotePath ? {
          provider: params.queueItem.remoteProvider || params.queueItem.destination,
          path: params.queueItem.remotePath,
          sha: params.queueItem.sourceSha,
          lastCommitId: params.queueItem.sourceLastCommitId,
          branch: params.queueItem.remoteBranch,
        } : null,
      })
    }
    if (params.raw !== undefined) {
      return createPostDraft({
        raw: params.raw,
        filename: params.filename,
        siteId: params.siteId,
        images: params.images,
        destination: params.destination,
        remoteFile: params.remoteFile,
      })
    }
    return createPostDraft({ raw: '', filename: 'new-post.md', siteId: 'temporal' })
  })

  const [activeTab, setActiveTab] = useState('meta')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef(null)
  const bodyRef = useRef(null)
  const bodySelection = useRef({ start: 0, end: 0 })

  // Track if user has made any edits (for unsaved-changes guard)
  const hasUnsavedChanges = useRef(false)

  // Autosave 1.5s after last edit
  const scheduleSave = useCallback((updated) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await saveDraft(updated)
      hasUnsavedChanges.current = false
      setDraft(prev => prev.dirty ? { ...prev, dirty: false } : prev)
      setSaving(false)
    }, 1500)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Unsaved-changes guard on back navigation
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!hasUnsavedChanges.current) return
      e.preventDefault()
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved edits. Discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      )
    })
    return unsubscribe
  }, [navigation])

  function updateDraft(changes) {
    setDraft(prev => {
      const updated = { ...prev, ...changes, dirty: true, updatedAt: new Date().toISOString() }
      hasUnsavedChanges.current = true
      scheduleSave(updated)
      return updated
    })
  }

  function updateField(field, value) {
    updateDraft({ [field]: value })
  }

  // ---- Slug auto-generation ----
  function handleTitleChange(title) {
    const changes = { title }
    // Auto-generate filename from title if filename is default or was previously auto-generated
    const currentFilename = draft.filename || ''
    const isDefault = currentFilename === 'new-post.md' || currentFilename === 'untitled.md'
    const wasAutoGenerated = currentFilename === generateFilename(draft.title, draft.published)
    if (isDefault || wasAutoGenerated) {
      changes.filename = generateFilename(title, draft.published)
    }
    updateDraft(changes)
  }

  // ---- Apply site template ----
  function handleSiteChange(siteId) {
    const changes = { repoSiteId: siteId }
    // If this is a new post with no title yet, apply the site template category
    if (!draft.title && !draft.body) {
      const template = SITE_TEMPLATES[siteId]
      if (template) {
        changes.category = template.category
        changes.draft = template.draft
      }
    }
    updateDraft(changes)
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

  // ---- Smart text handling ----
  function handleBodyChange(newText) {
    const oldText = draft.body || ''

    // Detect if user just typed a newline
    if (newText.length === oldText.length + 1) {
      const pos = bodySelection.current.start + 1
      if (newText[pos - 1] === '\n') {
        const result = handleNewline(oldText, bodySelection.current.start)
        if (result) {
          updateField('body', result.text)
          setTimeout(() => {
            bodyRef.current?.setNativeProps?.({
              selection: { start: result.cursor, end: result.cursor },
            })
          }, 50)
          return
        }
      }
    }

    // Detect if user just typed a character that should auto-close
    if (newText.length === oldText.length + 1) {
      const insertedPos = bodySelection.current.start
      const char = newText[insertedPos]
      if (CLOSE_PAIRS[char]) {
        const closer = CLOSE_PAIRS[char]
        // Don't auto-close backtick if we're already inside backticks
        if (char === '`' && insertedPos > 0 && newText[insertedPos - 1] === '`') {
          updateField('body', newText)
          return
        }
        const withClose = newText.slice(0, insertedPos + 1) + closer + newText.slice(insertedPos + 1)
        updateField('body', withClose)
        const cursorPos = insertedPos + 1
        setTimeout(() => {
          bodyRef.current?.setNativeProps?.({
            selection: { start: cursorPos, end: cursorPos },
          })
        }, 50)
        return
      }
    }

    updateField('body', newText)
  }

  // ---- Image picker ----
  async function handlePickImage() {
    Alert.alert('Insert Image', 'Choose image source', [
      {
        text: 'Photo Library',
        onPress: () => pickImage(ImagePicker.launchImageLibraryAsync),
      },
      {
        text: 'Camera',
        onPress: () => pickImage(ImagePicker.launchCameraAsync),
      },
      {
        text: 'URL',
        onPress: () => insertImageUrl(),
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function pickImage(launcher) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera roll access is needed to insert images.')
      return
    }

    const result = await launcher({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    })

    if (result.canceled || !result.assets?.length) return

    const asset = result.assets[0]
    const uri = asset.uri
    const filename = asset.fileName || uri.split('/').pop() || 'image.jpg'

    // Add to attached images list for upload later
    const images = [...(draft.attachedImages || []), { uri, filename }]
    const imgPath = `/blog-images/${filename}`

    // Insert markdown at cursor
    const { start } = bodySelection.current
    const text = draft.body || ''
    const imgMd = `![${filename}](${imgPath})`
    const newText = text.slice(0, start) + imgMd + text.slice(start)

    updateDraft({ body: newText, attachedImages: images })
  }

  function insertImageUrl() {
    if (Alert.prompt) {
      Alert.prompt(
        'Image URL',
        'Enter image path or URL:',
        (path) => {
          if (!path) return
          const { start } = bodySelection.current
          const text = draft.body || ''
          const imgMd = `![](${path})`
          const newText = text.slice(0, start) + imgMd + text.slice(start)
          updateField('body', newText)
        },
        'plain-text',
        '',
        'url'
      )
    } else {
      // Android fallback — insert template
      const { start } = bodySelection.current
      const text = draft.body || ''
      const imgMd = '![alt](https://)'
      const newText = text.slice(0, start) + imgMd + text.slice(start)
      updateField('body', newText)
      const cursorPos = start + imgMd.length - 1
      setTimeout(() => {
        bodyRef.current?.setNativeProps?.({
          selection: { start: cursorPos, end: cursorPos },
        })
      }, 50)
    }
  }

  // ---- Save to queue ----
  async function handleSaveToQueue() {
    const content = serializeDraft(draft)
    hasUnsavedChanges.current = false
    if (isFromQueue) {
      await updateQueueItem(params.queueItem.id, {
        content,
        filename: draft.filename,
        siteId: draft.repoSiteId,
        images: draft.attachedImages,
        destination: draft.remoteProvider || params.queueItem.destination || null,
        remoteProvider: draft.remoteProvider || null,
        remotePath: draft.remotePath || null,
        sourceSha: draft.sourceSha || null,
        sourceLastCommitId: draft.sourceLastCommitId || null,
        remoteBranch: draft.remoteBranch || null,
      })
      setDraft(prev => prev.dirty ? { ...prev, dirty: false } : prev)
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
        destination: draft.remoteProvider || null,
        remoteProvider: draft.remoteProvider || null,
        remotePath: draft.remotePath || null,
        sourceSha: draft.sourceSha || null,
        sourceLastCommitId: draft.sourceLastCommitId || null,
        remoteBranch: draft.remoteBranch || null,
        addedAt: new Date().toISOString(),
      })
      setDraft(prev => prev.dirty ? { ...prev, dirty: false } : prev)
      Alert.alert('Queued', `"${draft.filename}" added to push queue.`, [
        { text: 'OK', onPress: () => navigation.navigate('Home') },
      ])
    }
  }

  // ---- Word/char count ----
  const bodyStats = useMemo(() => {
    const text = draft.body || ''
    const chars = text.length
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    const lines = text.split('\n').length
    return { chars, words, lines }
  }, [draft.body])

  // ---- Render tabs ----
  const activeSite = SITES.find(s => s.id === draft.repoSiteId)
  // Only serialize for diff/queue — preview uses draft.body directly
  const serialized = useMemo(() => serializeDraft(draft), [draft])

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
          <MetadataForm
            draft={draft}
            updateField={updateField}
            onTitleChange={handleTitleChange}
            onSiteChange={handleSiteChange}
          />
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
            <View style={styles.toolbarDivider} />
            <TouchableOpacity
              style={styles.toolbarBtn}
              onPress={handlePickImage}
            >
              <Ionicons name="image-outline" size={18} color="#2d6a4f" />
            </TouchableOpacity>
          </ScrollView>
          <TextInput
            ref={bodyRef}
            style={styles.bodyInput}
            value={draft.body || ''}
            onChangeText={handleBodyChange}
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
          {/* Word count bar */}
          <View style={styles.statsBar}>
            <Text style={styles.statsText}>
              {bodyStats.words} words  {bodyStats.chars} chars  {bodyStats.lines} lines
            </Text>
          </View>
        </View>
      )}

      {activeTab === 'preview' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.previewContainer}>
          <MarkdownPreview body={draft.body} title={draft.title} />
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
function MetadataForm({ draft, updateField, onTitleChange, onSiteChange }) {
  return (
    <>
      {draft.remotePath ? (
        <View style={styles.remoteNotice}>
          <Ionicons name="git-branch-outline" size={16} color="#2d6a4f" />
          <View style={styles.remoteNoticeTextWrap}>
            <Text style={styles.remoteNoticeTitle}>
              Linked to {draft.remoteProvider === 'github' ? 'GitHub' : 'GitLab'}
            </Text>
            <Text style={styles.remoteNoticePath}>{draft.remotePath}</Text>
          </View>
        </View>
      ) : null}

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
            onPress={() => onSiteChange(site.id)}
          >
            <Text style={[styles.siteChipText, draft.repoSiteId === site.id && { color: '#fff' }]}>
              {site.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filename with slug helper */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>Filename</Text>
        {draft.title ? (
          <TouchableOpacity
            onPress={() => updateField('filename', generateFilename(draft.title, draft.published))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.slugBtn}>Generate from title</Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
        onChangeText={onTitleChange}
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
      <View style={styles.labelRow}>
        <Text style={styles.label}>Published Date</Text>
        <TouchableOpacity
          onPress={() => updateField('published', new Date().toISOString())}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.slugBtn}>Now</Text>
        </TouchableOpacity>
      </View>
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

function MarkdownPreview({ body, title }) {
  if (!body && !title) {
    return <Text style={styles.previewEmpty}>Nothing to preview yet.</Text>
  }

  // Render body directly from draft state — no serialize+strip needed
  const content = title ? `# ${title}\n\n${body || ''}` : (body || '')

  return (
    <Markdown style={markdownStyles}>
      {content || 'Nothing to preview yet.'}
    </Markdown>
  )
}

// ---------------------------------------------------------------------------
// Diff View
// ---------------------------------------------------------------------------
/**
 * LCS-based diff: computes the longest common subsequence of lines,
 * then emits added/removed/same entries based on the backtrack.
 */
function computeLcsDiff(origLines, currLines) {
  const m = origLines.length
  const n = currLines.length

  // For very large files, fall back to a simpler approach
  if (m * n > 500000) {
    return computeSimpleDiff(origLines, currLines)
  }

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === currLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to produce diff
  const result = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === currLines[j - 1]) {
      result.push({ type: 'same', text: origLines[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', text: currLines[j - 1] })
      j--
    } else {
      result.push({ type: 'removed', text: origLines[i - 1] })
      i--
    }
  }

  return result.reverse()
}

function computeSimpleDiff(origLines, currLines) {
  const result = []
  const maxLen = Math.max(origLines.length, currLines.length)
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i]
    const c = currLines[i]
    if (o === undefined) {
      result.push({ type: 'added', text: c })
    } else if (c === undefined) {
      result.push({ type: 'removed', text: o })
    } else if (o !== c) {
      result.push({ type: 'removed', text: o })
      result.push({ type: 'added', text: c })
    } else {
      result.push({ type: 'same', text: o })
    }
  }
  return result
}

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
  const diffLines = computeLcsDiff(origLines, currLines)

  const changes = diffLines.reduce((acc, l) => {
    acc[l.type === 'same' ? 'unchanged' : l.type]++
    return acc
  }, { added: 0, removed: 0, unchanged: 0 })

  // Collapse long runs of unchanged lines with context
  const CONTEXT = 3
  const collapsed = []
  let skipping = false
  let skipCount = 0

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i]
    // Check if this unchanged line is near a change
    const nearChange = diffLines.slice(Math.max(0, i - CONTEXT), i).some(l => l.type !== 'same') ||
      diffLines.slice(i + 1, i + 1 + CONTEXT).some(l => l.type !== 'same')

    if (line.type === 'same' && !nearChange && diffLines.length > 20) {
      if (!skipping) {
        skipping = true
        skipCount = 0
      }
      skipCount++
    } else {
      if (skipping) {
        collapsed.push({ type: 'skip', count: skipCount })
        skipping = false
        skipCount = 0
      }
      collapsed.push(line)
    }
  }
  if (skipping) {
    collapsed.push({ type: 'skip', count: skipCount })
  }

  return (
    <View>
      <View style={styles.diffSummary}>
        <Text style={styles.diffSummaryText}>
          +{changes.added} added, -{changes.removed} removed, {changes.unchanged} unchanged
        </Text>
      </View>
      <View style={styles.diffBox}>
        {collapsed.map((line, i) => {
          if (line.type === 'skip') {
            return (
              <Text key={i} style={styles.diffSkip}>
                {'  '}... {line.count} unchanged lines ...
              </Text>
            )
          }
          return (
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
          )
        })}
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slugBtn: {
    fontSize: 12,
    color: '#2d6a4f',
    fontWeight: '600',
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
  remoteNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#eef6f1',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d4e5db',
    marginBottom: 8,
  },
  remoteNoticeTextWrap: { flex: 1 },
  remoteNoticeTitle: { color: '#24523d', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  remoteNoticePath: { color: '#567465', fontSize: 12, lineHeight: 17 },
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
  toolbarDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#e0e8e0',
    marginHorizontal: 4,
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

  // Stats bar (word count)
  statsBar: {
    backgroundColor: '#f8f9f8',
    borderTopWidth: 1,
    borderTopColor: '#e0e8e0',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  statsText: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
    textAlign: 'right',
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
  diffSkip: { color: '#667', fontSize: 12, fontFamily: 'monospace', lineHeight: 20, fontStyle: 'italic', paddingVertical: 2 },

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
