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
  Image,
  AppState,
} from 'react-native'
import { MarkdownTextInput } from '@expensify/react-native-live-markdown'
import { Ionicons } from '@expo/vector-icons'
import Markdown from '@ronradtke/react-native-markdown-display'
import * as ImagePicker from 'expo-image-picker'
import { createPostDraft, serializeDraft } from '../utils/frontmatter'
import { saveDraft, addToQueue, updateQueueItem, loadSettings } from '../utils/storage'
import { listRepoPosts } from '../utils/gitlab'
import { parseLiveMarkdown, getLiveMarkdownStyle } from '../utils/liveMarkdown'
import { useAppTheme } from '../utils/theme'
import { SITE_THEMES } from '../utils/siteThemes'

const SITES = SITE_THEMES

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

const EDITOR_PANELS = [
  { id: 'live', label: 'Live', icon: 'sparkles-outline' },
  { id: 'commands', label: 'Insert', icon: 'flash-outline' },
  { id: 'images', label: 'Photos', icon: 'images-outline' },
  { id: 'outline', label: 'Outline', icon: 'list-outline' },
  { id: 'links', label: 'Links', icon: 'link-outline' },
  { id: 'history', label: 'History', icon: 'time-outline' },
]

const INSERT_COMMANDS = [
  { id: 'heading1', label: 'Heading 1', icon: 'text-outline', keywords: 'h1 title heading', description: 'Insert a top-level heading' },
  { id: 'heading2', label: 'Heading 2', icon: 'text-outline', keywords: 'h2 section heading', description: 'Insert a section heading' },
  { id: 'heading3', label: 'Heading 3', icon: 'text-outline', keywords: 'h3 subsection heading', description: 'Insert a smaller heading' },
  { id: 'calloutNote', label: 'Note Callout', icon: 'chatbox-ellipses-outline', keywords: 'callout note aside', description: 'Insert a note-style callout block' },
  { id: 'calloutWarn', label: 'Warning Callout', icon: 'warning-outline', keywords: 'callout warning alert', description: 'Insert a warning callout block' },
  { id: 'codeFence', label: 'Code Block', icon: 'code-slash-outline', keywords: 'code fence snippet', description: 'Insert a fenced code block' },
  { id: 'table', label: 'Table', icon: 'grid-outline', keywords: 'table columns rows', description: 'Insert a starter Markdown table' },
  { id: 'divider', label: 'Divider', icon: 'remove-outline', keywords: 'divider rule hr', description: 'Insert a horizontal rule' },
  { id: 'checklist', label: 'Checklist', icon: 'checkbox-outline', keywords: 'task checklist todo', description: 'Insert a task list block' },
  { id: 'imageEmbed', label: 'Image Embed', icon: 'image-outline', keywords: 'image photo embed', description: 'Pick a photo and insert Markdown' },
  { id: 'imageBlock', label: 'Image Block', icon: 'images-outline', keywords: 'image caption hero photo', description: 'Insert a structured image block' },
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

function formatDateOnly(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10)
}

function splitFilename(name = '') {
  const cleaned = String(name || '').trim()
  const match = cleaned.match(/^(.*?)(\.[^.]+)?$/)
  return {
    stem: match?.[1] || 'image',
    extension: (match?.[2] || '.jpg').toLowerCase(),
  }
}

function sanitizeImageFilename(name = '') {
  const { stem, extension } = splitFilename(name)
  const safeStem = slugify(stem) || 'image'
  const safeExt = /^\.[a-z0-9]+$/i.test(extension) ? extension : '.jpg'
  return `${safeStem}${safeExt}`
}

function formatImageAlt(filename = '') {
  const { stem } = splitFilename(filename)
  const alt = String(stem || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return alt || 'Image'
}

function ensureUniqueImageFilename(filename, images = []) {
  const lower = filename.toLowerCase()
  const taken = new Set(images.map(image => String(image.filename || '').toLowerCase()))
  if (!taken.has(lower)) return filename

  const { stem, extension } = splitFilename(filename)
  let index = 2
  while (taken.has(`${stem}-${index}${extension}`.toLowerCase())) {
    index += 1
  }
  return `${stem}-${index}${extension}`
}

function normalizeAttachedImages(images = []) {
  const normalized = []
  for (const [index, image] of images.entries()) {
    const sourceName = image?.filename || image?.publicPath?.split('/').pop() || `image-${index + 1}.jpg`
    const filename = ensureUniqueImageFilename(sanitizeImageFilename(sourceName), normalized)
    normalized.push({
      id: image?.id || `${filename}-${index}`,
      uri: image?.uri || '',
      filename,
      alt: image?.alt !== undefined ? String(image.alt) : formatImageAlt(filename),
      caption: image?.caption !== undefined ? String(image.caption) : '',
      publicPath: image?.publicPath || `/blog-images/${filename}`,
    })
  }
  return normalized
}

function buildImageMarkdown(image, options = {}) {
  const alt = String(image?.alt || '').trim() || formatImageAlt(image?.filename)
  const imageLine = `![${alt}](${image?.publicPath || `/blog-images/${image?.filename}`})`
  const caption = String(options.caption ?? image?.caption ?? '').trim()
  if (options.structured && caption) {
    return `${imageLine}\n*${caption}*`
  }
  return imageLine
}

function getLineBounds(text, pos) {
  const start = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1
  let end = text.indexOf('\n', pos)
  if (end === -1) end = text.length
  return { start, end }
}

function replaceRange(text, start, end, replacement) {
  return text.slice(0, start) + replacement + text.slice(end)
}

function getSlashTrigger(text, pos) {
  const { start } = getLineBounds(text, pos)
  const lineBeforeCursor = text.slice(start, pos)
  const match = lineBeforeCursor.match(/^(\s*)\/([\w-]*)$/)
  if (!match) return null
  return {
    start,
    end: pos,
    query: match[2].toLowerCase(),
    indent: match[1] || '',
  }
}

function humanizeSlug(slug = '') {
  return String(slug || '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getPostSlugFromPath(path = '') {
  const name = String(path || '').split('/').pop() || ''
  return name.replace(/\.(md|mdx|txt)$/i, '')
}

function getPostUrlFromPath(path = '') {
  const slug = getPostSlugFromPath(path)
  return slug ? `/posts/${slug}/` : '/posts/'
}

function extractHeadingOutline(body = '') {
  const lines = String(body || '').split('\n')
  const outline = []
  let offset = 0
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (match) {
      outline.push({
        id: `${offset}:${match[2]}`,
        depth: match[1].length,
        text: match[2],
        start: offset,
      })
    }
    offset += line.length + 1
  }
  return outline
}

function getFocusedMarkdownBlock(body = '', cursor = 0) {
  const text = String(body || '')
  if (!text.trim()) return ''

  const lines = text.split('\n')
  let lineIndex = 0
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const nextOffset = offset + lines[i].length + 1
    if (cursor <= nextOffset) {
      lineIndex = i
      break
    }
    offset = nextOffset
  }

  let start = lineIndex
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1
  let end = lineIndex
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end += 1

  return lines.slice(start, end + 1).join('\n').trim()
}

function chooseLinkProvider(settings, draft) {
  if (draft?.remoteProvider) return draft.remoteProvider
  const github = settings?.providers?.github || {}
  if (github.token && github.owner && github.repo) return 'github'
  return 'gitlab'
}

function buildHistorySnapshot(draft) {
  return {
    id: `${Date.now()}`,
    savedAt: new Date().toISOString(),
    title: draft.title || draft.filename || 'Untitled draft',
    filename: draft.filename,
    content: serializeDraft({ ...draft, dirty: false }),
    attachedImages: normalizeAttachedImages(draft.attachedImages || []),
  }
}

function mergeHistorySnapshot(draft) {
  const snapshot = buildHistorySnapshot(draft)
  const history = Array.isArray(draft.history) ? draft.history : []
  if (history[0]?.content === snapshot.content) {
    return {
      ...draft,
      history,
      lastSavedAt: history[0]?.savedAt || snapshot.savedAt,
    }
  }
  return {
    ...draft,
    history: [snapshot, ...history].slice(0, 12),
    lastSavedAt: snapshot.savedAt,
  }
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
  const theme = useAppTheme()
  const colors = theme.colors
  const styles = useMemo(() => createStyles(colors), [colors])
  const markdownStyles = useMemo(() => getMarkdownStyles(colors), [colors])

  // Build initial draft from params
  const [draft, setDraft] = useState(() => {
    let initialDraft
    if (params.draft) {
      initialDraft = params.draft
    } else if (params.queueItem) {
      initialDraft = createPostDraft({
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
    } else if (params.raw !== undefined) {
      initialDraft = createPostDraft({
        raw: params.raw,
        filename: params.filename,
        siteId: params.siteId,
        images: params.images,
        destination: params.destination,
        remoteFile: params.remoteFile,
      })
    } else {
      initialDraft = createPostDraft({ raw: '', filename: 'new-post.md', siteId: 'temporal' })
    }
    return {
      ...initialDraft,
      attachedImages: normalizeAttachedImages(initialDraft.attachedImages),
      history: Array.isArray(initialDraft.history) ? initialDraft.history : [],
    }
  })

  const [activeTab, setActiveTab] = useState('meta')
  const [editorPanel, setEditorPanel] = useState(null)
  const [editorSelection, setEditorSelection] = useState({ start: 0, end: 0 })
  const [repoLinks, setRepoLinks] = useState([])
  const [linkQuery, setLinkQuery] = useState('')
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef(null)
  const bodyRef = useRef(null)
  const bodySelection = useRef({ start: 0, end: 0 })
  const latestDraft = useRef(draft)

  // Track if user has made any edits (for unsaved-changes guard)
  const hasUnsavedChanges = useRef(false)

  useEffect(() => {
    latestDraft.current = draft
  }, [draft])

  const prepareDraftForPersistence = useCallback((sourceDraft) => {
    return mergeHistorySnapshot({ ...sourceDraft, dirty: false })
  }, [])

  // Autosave 1.5s after last edit
  const scheduleSave = useCallback((updated) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      const persisted = prepareDraftForPersistence(updated)
      await saveDraft(persisted)
      hasUnsavedChanges.current = false
      setDraft(prev => (
        prev.updatedAt === updated.updatedAt
          ? persisted
          : prev
      ))
      setSaving(false)
    }, 1500)
  }, [prepareDraftForPersistence])

  const flushPendingDraftSave = useCallback((resetUi = false) => {
    if (!hasUnsavedChanges.current) return
    const pending = latestDraft.current
    if (!pending) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    hasUnsavedChanges.current = false
    const persisted = prepareDraftForPersistence(pending)
    if (resetUi) {
      setDraft(prev => (prev.updatedAt === pending.updatedAt ? persisted : prev))
    }
    saveDraft(persisted).catch(() => {})
  }, [prepareDraftForPersistence])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        flushPendingDraftSave(true)
      }
    })

    return () => {
      subscription.remove()
      flushPendingDraftSave(false)
    }
  }, [flushPendingDraftSave])

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
            onPress: () => {
              hasUnsavedChanges.current = false
              navigation.dispatch(e.data.action)
            },
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

  function moveCursor(position) {
    bodySelection.current = { start: position, end: position }
    setEditorSelection({ start: position, end: position })
    setTimeout(() => {
      bodyRef.current?.setNativeProps?.({
        selection: { start: position, end: position },
      })
    }, 50)
  }

  function focusCursor(position) {
    bodyRef.current?.focus?.()
    moveCursor(position)
  }

  function insertBodySnippet(snippet, cursorOffset = snippet.length) {
    const { start, end } = bodySelection.current
    const text = draft.body || ''
    const nextBody = text.slice(0, start) + snippet + text.slice(end)
    updateField('body', nextBody)
    moveCursor(start + cursorOffset)
  }

  function updateAttachedImage(id, changes) {
    const nextImages = normalizeAttachedImages(
      (draft.attachedImages || []).map(image => (
        image.id === id ? { ...image, ...changes } : image
      ))
    )
    updateDraft({ attachedImages: nextImages })
  }

  function moveAttachedImage(id, direction) {
    const images = [...(draft.attachedImages || [])]
    const index = images.findIndex(image => image.id === id)
    if (index === -1) return
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= images.length) return
    const [moved] = images.splice(index, 1)
    images.splice(nextIndex, 0, moved)
    updateDraft({ attachedImages: images })
  }

  function removeAttachedImage(id) {
    const removed = (draft.attachedImages || []).find(image => image.id === id)
    const nextImages = (draft.attachedImages || []).filter(image => image.id !== id)
    const changes = { attachedImages: nextImages }
    if (removed?.publicPath && draft.heroImage === removed.publicPath) {
      changes.heroImage = ''
    }
    updateDraft(changes)
  }

  function insertAttachedImage(image, options = {}) {
    const text = draft.body || ''
    const { start, end } = bodySelection.current
    const markdown = buildImageMarkdown(image, {
      structured: options.structured,
      caption: options.caption,
    })
    const prefix = start > 0 && text[start - 1] !== '\n' ? '\n\n' : ''
    const suffix = text[end] && text[end] !== '\n' ? '\n\n' : '\n'
    const snippet = `${prefix}${markdown}${suffix}`
    insertBodySnippet(snippet)
  }

  function insertInternalLink(post) {
    const { start, end } = bodySelection.current
    const text = draft.body || ''
    const selected = text.slice(start, end)
    const slug = getPostSlugFromPath(post.path)
    const label = selected || humanizeSlug(slug) || post.name
    const snippet = `[${label}](${getPostUrlFromPath(post.path)})`
    insertBodySnippet(snippet, snippet.length)
    setEditorPanel('live')
  }

  function restoreHistorySnapshot(snapshot) {
    if (!snapshot?.content) return
    const restoredDraft = createPostDraft({
      raw: snapshot.content,
      filename: snapshot.filename || draft.filename,
      siteId: draft.repoSiteId,
      images: snapshot.attachedImages || draft.attachedImages,
      destination: draft.remoteProvider,
      remoteFile: draft.remotePath ? {
        provider: draft.remoteProvider,
        path: draft.remotePath,
        sha: draft.sourceSha,
        lastCommitId: draft.sourceLastCommitId,
        branch: draft.remoteBranch,
      } : null,
    })

    updateDraft({
      ...restoredDraft,
      id: draft.id,
      rawOriginal: draft.rawOriginal,
      history: draft.history || [],
      attachedImages: normalizeAttachedImages(snapshot.attachedImages || restoredDraft.attachedImages),
    })
    setEditorPanel('live')
    moveCursor(0)
  }

  // ---- Slug auto-generation ----
  function handleTitleChange(title) {
    const changes = { title }
    if (draft.remotePath) {
      updateDraft(changes)
      return
    }
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
    moveCursor(newCursorPos)
  }

  function handleInsertCommand(command) {
    const slashTrigger = getSlashTrigger(draft.body || '', bodySelection.current.start)
    const insertAtLine = (snippet, cursorOffset = snippet.length) => {
      if (!slashTrigger) {
        insertBodySnippet(snippet, cursorOffset)
        return
      }
      const text = draft.body || ''
      const nextBody = replaceRange(text, slashTrigger.start, slashTrigger.end, `${slashTrigger.indent}${snippet}`)
      updateField('body', nextBody)
      moveCursor(slashTrigger.start + slashTrigger.indent.length + cursorOffset)
    }

    switch (command.id) {
      case 'heading1':
        insertAtLine('# ', 2)
        break
      case 'heading2':
        insertAtLine('## ', 3)
        break
      case 'heading3':
        insertAtLine('### ', 4)
        break
      case 'calloutNote':
        insertAtLine('> [!NOTE]\n> ', 12)
        break
      case 'calloutWarn':
        insertAtLine('> [!WARNING]\n> ', 15)
        break
      case 'codeFence':
        insertAtLine('```md\n\n```', 6)
        break
      case 'table':
        insertAtLine('| Column | Value |\n| --- | --- |\n|  |  |', 35)
        break
      case 'divider':
        insertAtLine('---', 3)
        break
      case 'checklist':
        insertAtLine('- [ ] ', 6)
        break
      case 'imageEmbed':
        handlePickImage('plain')
        break
      case 'imageBlock':
        handlePickImage('structured')
        break
      default:
        break
    }
    setEditorPanel('live')
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
          moveCursor(result.cursor)
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
        moveCursor(cursorPos)
        return
      }
    }

    updateField('body', newText)
  }

  useEffect(() => {
    if (editorPanel !== 'links') return

    let cancelled = false
    async function loadRepoLinks() {
      setLoadingLinks(true)
      setLinkError('')
      const settings = await loadSettings()
      const siteConfig = settings?.sites?.find(site => site.id === draft.repoSiteId)
      if (!siteConfig?.path) {
        if (!cancelled) {
          setRepoLinks([])
          setLinkError('This site has no configured content path in Settings.')
          setLoadingLinks(false)
        }
        return
      }

      const provider = chooseLinkProvider(settings, draft)
      const result = await listRepoPosts(settings, siteConfig.path, provider)
      if (cancelled) return

      if (result.ok) {
        setRepoLinks((result.posts || []).filter(post => post.path !== draft.remotePath))
      } else {
        setRepoLinks([])
        setLinkError(result.error || 'Could not load repo posts for links.')
      }
      setLoadingLinks(false)
    }

    loadRepoLinks()
    return () => {
      cancelled = true
    }
  }, [editorPanel, draft.remotePath, draft.repoSiteId, draft.remoteProvider])

  // ---- Image picker ----
  async function handlePickImage(insertMode = 'plain') {
    Alert.alert('Insert Image', 'Choose image source', [
      {
        text: 'Photo Library',
        onPress: () => pickImage(ImagePicker.launchImageLibraryAsync, insertMode),
      },
      {
        text: 'Camera',
        onPress: () => pickImage(ImagePicker.launchCameraAsync, insertMode),
      },
      {
        text: 'URL',
        onPress: () => insertImageUrl(),
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function pickImage(launcher, insertMode = 'plain') {
    const permission = launcher === ImagePicker.launchCameraAsync
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    const { status } = permission
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        launcher === ImagePicker.launchCameraAsync
          ? 'Camera access is needed to take a photo.'
          : 'Photo library access is needed to insert images.'
      )
      return
    }

    const result = await launcher({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
      allowsMultipleSelection: launcher === ImagePicker.launchImageLibraryAsync,
    })

    if (result.canceled || !result.assets?.length) return

    const existingImages = normalizeAttachedImages(draft.attachedImages || [])
    const nextImages = [...existingImages]
    const addedImages = result.assets.map((asset, index) => {
      const sourceName = asset.fileName || asset.uri?.split('/').pop() || `image-${Date.now()}-${index + 1}.jpg`
      const filename = ensureUniqueImageFilename(sanitizeImageFilename(sourceName), nextImages)
      const image = {
        id: `${filename}-${Date.now()}-${index}`,
        uri: asset.uri,
        filename,
        alt: formatImageAlt(filename),
        publicPath: `/blog-images/${filename}`,
      }
      nextImages.push(image)
      return image
    })

    const snippet = addedImages
      .map(image => buildImageMarkdown(image, { structured: insertMode === 'structured' }))
      .join('\n\n')

    const heroImage = draft.heroImage || addedImages[0]?.publicPath || ''
    const text = draft.body || ''
    const { start, end } = bodySelection.current
    const prefix = start > 0 && text[start - 1] !== '\n' ? '\n\n' : ''
    const suffix = text[end] && text[end] !== '\n' ? '\n\n' : '\n'
    const nextBody = text.slice(0, start) + prefix + snippet + suffix + text.slice(end)

    updateDraft({
      body: nextBody,
      attachedImages: nextImages,
      heroImage,
    })
    moveCursor(start + prefix.length + snippet.length + suffix.length)
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
      moveCursor(cursorPos)
    }
  }

  // ---- Save to queue ----
  async function handleSaveToQueue() {
    const queuedDraft = prepareDraftForPersistence(draft)
    const content = serializeDraft(queuedDraft)
    hasUnsavedChanges.current = false
    setDraft(queuedDraft)
    if (isFromQueue) {
      await updateQueueItem(params.queueItem.id, {
        content,
        filename: queuedDraft.filename,
        siteId: queuedDraft.repoSiteId,
        images: queuedDraft.attachedImages,
        destination: queuedDraft.remoteProvider || params.queueItem.destination || null,
        remoteProvider: queuedDraft.remoteProvider || null,
        remotePath: queuedDraft.remotePath || null,
        sourceSha: queuedDraft.sourceSha || null,
        sourceLastCommitId: queuedDraft.sourceLastCommitId || null,
        remoteBranch: queuedDraft.remoteBranch || null,
      })
      saveDraft(queuedDraft).catch(() => {})
      Alert.alert('Updated', 'Queue item updated with your edits.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } else {
      await addToQueue({
        id: queuedDraft.id,
        filename: queuedDraft.filename,
        content,
        siteId: queuedDraft.repoSiteId,
        images: queuedDraft.attachedImages,
        destination: queuedDraft.remoteProvider || null,
        remoteProvider: queuedDraft.remoteProvider || null,
        remotePath: queuedDraft.remotePath || null,
        sourceSha: queuedDraft.sourceSha || null,
        sourceLastCommitId: queuedDraft.sourceLastCommitId || null,
        remoteBranch: queuedDraft.remoteBranch || null,
        addedAt: new Date().toISOString(),
      })
      saveDraft(queuedDraft).catch(() => {})
      Alert.alert('Queued', `"${queuedDraft.filename}" added to push queue.`, [
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

  const slashTrigger = useMemo(
    () => getSlashTrigger(draft.body || '', editorSelection.start),
    [draft.body, editorSelection.start]
  )

  const filteredInsertCommands = useMemo(() => {
    const needle = (slashTrigger?.query || '').trim()
    if (!needle) return INSERT_COMMANDS
    return INSERT_COMMANDS.filter(command => (
      command.label.toLowerCase().includes(needle) ||
      command.keywords.includes(needle)
    ))
  }, [slashTrigger])

  const outline = useMemo(() => extractHeadingOutline(draft.body), [draft.body])
  const livePreviewBody = useMemo(
    () => getFocusedMarkdownBlock(draft.body, editorSelection.start),
    [draft.body, editorSelection.start]
  )

  const filteredRepoLinks = useMemo(() => {
    const needle = linkQuery.trim().toLowerCase()
    if (!needle) return repoLinks
    return repoLinks.filter(post => {
      const name = String(post.name || '').toLowerCase()
      const path = String(post.path || '').toLowerCase()
      const label = humanizeSlug(getPostSlugFromPath(post.path)).toLowerCase()
      return name.includes(needle) || path.includes(needle) || label.includes(needle)
    })
  }, [repoLinks, linkQuery])

  // ---- Render tabs ----
  const activeSite = SITES.find(s => s.id === draft.repoSiteId)
  const liveMarkdownStyle = useMemo(
    () => getLiveMarkdownStyle(colors, activeSite?.color),
    [colors, activeSite?.color]
  )
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
          <Ionicons name="arrow-back" size={24} color={colors.headerText} />
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
              color={activeTab === tab.id ? colors.accent : colors.textSoft}
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
            colors={colors}
            styles={styles}
          />
        </ScrollView>
      )}

      {activeTab === 'edit' && (
        <View style={styles.tabContent}>
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
              onPress={() => handlePickImage('plain')}
            >
              <Ionicons name="image-outline" size={18} color={colors.accent} />
            </TouchableOpacity>
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.panelBar}
            contentContainerStyle={styles.panelBarInner}
          >
            {EDITOR_PANELS.map(panel => {
              const active = (slashTrigger && panel.id === 'commands') || (!slashTrigger && editorPanel === panel.id)
              return (
                <TouchableOpacity
                  key={panel.id}
                  style={[styles.panelChip, active && styles.panelChipActive]}
                  onPress={() => setEditorPanel(panel.id)}
                >
                  <Ionicons
                    name={panel.icon}
                    size={15}
                    color={active ? colors.headerText : colors.textMuted}
                  />
                  <Text style={[styles.panelChipText, active && styles.panelChipTextActive]}>
                    {panel.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <View style={styles.editorSurface}>
            <MarkdownTextInput
              ref={bodyRef}
              style={styles.bodyInput}
              value={draft.body || ''}
              onChangeText={handleBodyChange}
              parser={parseLiveMarkdown}
              markdownStyle={liveMarkdownStyle}
              onSelectionChange={e => {
                bodySelection.current = e.nativeEvent.selection
                setEditorSelection(e.nativeEvent.selection)
              }}
              placeholder="Write your post in Markdown..."
              placeholderTextColor={colors.placeholder}
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
              autoCorrect={false}
              keyboardAppearance={theme.dark ? 'dark' : 'light'}
              selectionColor={activeSite?.color || colors.accent}
              scrollEnabled
            />
            <View style={styles.statsBar}>
              <Text style={styles.statsText}>
                {bodyStats.words} words  {bodyStats.chars} chars  {bodyStats.lines} lines
              </Text>
            </View>
          </View>

          {(slashTrigger || editorPanel) ? (
            <ScrollView
              style={styles.editorAssistantArea}
              contentContainerStyle={styles.editorAssistantContent}
              keyboardShouldPersistTaps="handled"
            >
              {(slashTrigger || editorPanel === 'commands') ? (
                <InsertCommandPanel
                  commands={filteredInsertCommands}
                  slashTrigger={slashTrigger}
                  onInsert={handleInsertCommand}
                  colors={colors}
                  styles={styles}
                />
              ) : null}

              {editorPanel === 'live' ? (
                <LivePreviewPanel
                  title={draft.title}
                  body={livePreviewBody}
                  markdownStyles={markdownStyles}
                  colors={colors}
                  styles={styles}
                />
              ) : null}

              {editorPanel === 'images' ? (
                <ImageManager
                  images={draft.attachedImages || []}
                  heroImage={draft.heroImage}
                  onAddImage={() => handlePickImage('plain')}
                  onInsertImage={insertAttachedImage}
                  onInsertStructuredImage={image => insertAttachedImage(image, { structured: true })}
                  onSetHeroImage={image => updateField('heroImage', image.publicPath)}
                  onUpdateImage={updateAttachedImage}
                  onMoveImage={moveAttachedImage}
                  onRemoveImage={removeAttachedImage}
                  colors={colors}
                  styles={styles}
                />
              ) : null}

              {editorPanel === 'outline' ? (
                <OutlinePanel
                  headings={outline}
                  onSelect={focusCursor}
                  colors={colors}
                  styles={styles}
                />
              ) : null}

              {editorPanel === 'links' ? (
                <InternalLinkPanel
                  posts={filteredRepoLinks}
                  loading={loadingLinks}
                  error={linkError}
                  query={linkQuery}
                  onQueryChange={setLinkQuery}
                  onInsert={insertInternalLink}
                  styles={styles}
                  colors={colors}
                />
              ) : null}

              {editorPanel === 'history' ? (
                <DraftHistoryPanel
                  history={draft.history || []}
                  onRestore={restoreHistorySnapshot}
                  styles={styles}
                  colors={colors}
                />
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      )}

      {activeTab === 'preview' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.previewContainer}>
          <MarkdownPreview
            body={draft.body}
            title={draft.title}
            markdownStyles={markdownStyles}
            styles={styles}
            site={activeSite}
            colors={colors}
          />
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
          <Ionicons name="cloud-upload-outline" size={18} color={colors.headerText} />
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
function MetadataForm({ draft, updateField, onTitleChange, onSiteChange, colors, styles }) {
  const siteLocked = !!draft.remotePath

  return (
    <>
      {draft.remotePath ? (
        <View style={styles.remoteNotice}>
          <Ionicons name="git-branch-outline" size={16} color={colors.accent} />
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
      {siteLocked ? (
        <Text style={styles.helpText}>
          Target site is locked because this draft is linked to an existing remote file.
        </Text>
      ) : null}
      <View style={styles.siteRow}>
        {SITES.map(site => (
          <TouchableOpacity
            key={site.id}
            style={[
              styles.siteChip,
              siteLocked && styles.siteChipDisabled,
              draft.repoSiteId === site.id && { backgroundColor: site.color, borderColor: site.color },
            ]}
            onPress={() => {
              if (!siteLocked) onSiteChange(site.id)
            }}
            disabled={siteLocked}
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
        placeholderTextColor={colors.placeholder}
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
        placeholderTextColor={colors.placeholder}
        autoCapitalize="words"
      />

      {/* Description */}
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={draft.description || ''}
        onChangeText={v => updateField('description', v)}
        placeholder="Short summary (optional)"
        placeholderTextColor={colors.placeholder}
        multiline
      />

      {/* Published date */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>Published Date</Text>
        <TouchableOpacity
          onPress={() => updateField('published', formatDateOnly())}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.slugBtn}>Now</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        value={draft.published || ''}
        onChangeText={v => updateField('published', v)}
        placeholder="2026-03-07"
        placeholderTextColor={colors.placeholder}
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
        placeholderTextColor={colors.placeholder}
        autoCapitalize="words"
      />

      {/* Category */}
      <Text style={styles.label}>Category</Text>
      <TextInput
        style={styles.input}
        value={draft.category || ''}
        onChangeText={v => updateField('category', v)}
        placeholder="Blog"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="words"
      />

      {/* Hero Image */}
      <Text style={styles.label}>Hero Image Path</Text>
      <TextInput
        style={styles.input}
        value={draft.heroImage || ''}
        onChangeText={v => updateField('heroImage', v)}
        placeholder="/blog-images/hero.jpg"
        placeholderTextColor={colors.placeholder}
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
          color={draft.draft ? colors.warning : colors.textSoft}
        />
        <Text style={[styles.draftToggleText, draft.draft && { color: colors.warning }]}>
          Mark as draft (unpublished)
        </Text>
      </TouchableOpacity>

      {/* Unknown frontmatter keys notice */}
      {Object.keys(draft.rawFrontmatter || {}).length > 0 && (
        <View style={styles.rawNotice}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSoft} />
          <Text style={styles.rawNoticeText}>
            {Object.keys(draft.rawFrontmatter).length} frontmatter key(s) preserved from original file
          </Text>
        </View>
      )}
    </>
  )
}

function ImageManager({
  images,
  heroImage,
  onAddImage,
  onInsertImage,
  onInsertStructuredImage,
  onSetHeroImage,
  onUpdateImage,
  onMoveImage,
  onRemoveImage,
  colors,
  styles,
}) {
  return (
    <View style={styles.imageManager}>
      <View style={styles.imageManagerHeader}>
        <View>
          <Text style={styles.imageManagerTitle}>Photos</Text>
          <Text style={styles.imageManagerHint}>
            Insert now, then upload with the post to this site&apos;s `public/blog-images` folder.
          </Text>
        </View>
        <TouchableOpacity style={styles.imageAddBtn} onPress={onAddImage}>
          <Ionicons name="add-circle-outline" size={18} color={colors.headerText} />
          <Text style={styles.imageAddBtnText}>Add Photo</Text>
        </TouchableOpacity>
      </View>

      {images.length === 0 ? (
        <View style={styles.imageEmptyState}>
          <Ionicons name="images-outline" size={18} color={colors.textMuted} />
          <Text style={styles.imageEmptyText}>
            No photos attached yet. Added photos will insert as `/blog-images/...` and upload with the queue item.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.imageCardRow}
        >
          {images.map(image => {
            const isHero = heroImage === image.publicPath
            return (
              <View key={image.id} style={styles.imageCard}>
                {image.uri ? (
                  <Image source={{ uri: image.uri }} style={styles.imageThumb} />
                ) : (
                  <View style={[styles.imageThumb, styles.imageThumbFallback]}>
                    <Ionicons name="image-outline" size={24} color={colors.textMuted} />
                  </View>
                )}

                <View style={styles.imageMetaRow}>
                  <Text style={styles.imageFilename} numberOfLines={1}>
                    {image.filename}
                  </Text>
                  {isHero ? (
                    <View style={styles.heroBadge}>
                      <Text style={styles.heroBadgeText}>Hero</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.imagePublicPath} numberOfLines={1}>
                  {image.publicPath}
                </Text>

                <TextInput
                  style={styles.imageAltInput}
                  value={image.alt}
                  onChangeText={value => onUpdateImage(image.id, { alt: value })}
                  placeholder="Alt text"
                  placeholderTextColor={colors.placeholder}
                />
                <TextInput
                  style={styles.imageAltInput}
                  value={image.caption || ''}
                  onChangeText={value => onUpdateImage(image.id, { caption: value })}
                  placeholder="Caption"
                  placeholderTextColor={colors.placeholder}
                />

                <View style={styles.imageActionRow}>
                  <TouchableOpacity
                    style={styles.imageActionBtn}
                    onPress={() => onInsertImage(image)}
                  >
                    <Ionicons name="enter-outline" size={15} color={colors.accent} />
                    <Text style={styles.imageActionText}>Insert</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.imageActionBtn}
                    onPress={() => onInsertStructuredImage(image)}
                  >
                    <Ionicons name="albums-outline" size={15} color={colors.link} />
                    <Text style={styles.imageActionText}>Block</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.imageActionBtn}
                    onPress={() => onSetHeroImage(image)}
                  >
                    <Ionicons name="image-outline" size={15} color={colors.warning} />
                    <Text style={styles.imageActionText}>Set Hero</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.imageActionRow}>
                  <TouchableOpacity
                    style={styles.imageActionBtn}
                    onPress={() => onMoveImage(image.id, -1)}
                  >
                    <Ionicons name="arrow-back-outline" size={15} color={colors.textMuted} />
                    <Text style={styles.imageActionText}>Earlier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.imageActionBtn}
                    onPress={() => onMoveImage(image.id, 1)}
                  >
                    <Ionicons name="arrow-forward-outline" size={15} color={colors.textMuted} />
                    <Text style={styles.imageActionText}>Later</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.imageActionBtn}
                    onPress={() => onRemoveImage(image.id)}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                    <Text style={styles.imageActionText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

function InsertCommandPanel({ commands, slashTrigger, onInsert, colors, styles }) {
  return (
    <View style={styles.helperPanel}>
      <View style={styles.helperPanelHeader}>
        <Text style={styles.helperPanelTitle}>
          {slashTrigger ? `Insert “/${slashTrigger.query}”` : 'Insert Blocks'}
        </Text>
        <Text style={styles.helperPanelHint}>
          Headings, callouts, code, tables, and image embeds.
        </Text>
      </View>
      <View style={styles.commandList}>
        {commands.map(command => (
          <TouchableOpacity
            key={command.id}
            style={styles.commandCard}
            onPress={() => onInsert(command)}
          >
            <Ionicons name={command.icon} size={18} color={colors.accent} />
            <View style={styles.commandTextWrap}>
              <Text style={styles.commandTitle}>{command.label}</Text>
              <Text style={styles.commandHint}>{command.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

function LivePreviewPanel({ title, body, markdownStyles, colors, styles }) {
  const preview = body || title
  return (
    <View style={styles.helperPanel}>
      <View style={styles.helperPanelHeader}>
        <Text style={styles.helperPanelTitle}>Live Formatting</Text>
        <Text style={styles.helperPanelHint}>
          Preview of the block around your cursor.
        </Text>
      </View>
      {preview ? (
        <View style={styles.livePreviewBox}>
          <Markdown style={markdownStyles}>
            {title && !body ? `# ${title}` : preview}
          </Markdown>
        </View>
      ) : (
        <Text style={styles.helperEmptyText}>Move the cursor into a paragraph or heading to preview it here.</Text>
      )}
    </View>
  )
}

function OutlinePanel({ headings, onSelect, styles }) {
  return (
    <View style={styles.helperPanel}>
      <View style={styles.helperPanelHeader}>
        <Text style={styles.helperPanelTitle}>Document Outline</Text>
        <Text style={styles.helperPanelHint}>
          Jump through the post by heading.
        </Text>
      </View>
      {headings.length > 0 ? (
        <View style={styles.outlineList}>
          {headings.map(heading => (
            <TouchableOpacity
              key={heading.id}
              style={[styles.outlineItem, { paddingLeft: 12 + ((heading.depth - 1) * 12) }]}
              onPress={() => onSelect(heading.start)}
            >
              <Text style={styles.outlineText} numberOfLines={1}>
                {heading.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.helperEmptyText}>Add `#`, `##`, or `###` headings to build an outline.</Text>
      )}
    </View>
  )
}

function InternalLinkPanel({
  posts,
  loading,
  error,
  query,
  onQueryChange,
  onInsert,
  styles,
  colors,
}) {
  return (
    <View style={styles.helperPanel}>
      <View style={styles.helperPanelHeader}>
        <Text style={styles.helperPanelTitle}>Internal Links</Text>
        <Text style={styles.helperPanelHint}>
          Insert a site post link as `/posts/slug/`.
        </Text>
      </View>
      <TextInput
        style={styles.helperSearchInput}
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search repo posts"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <Text style={styles.helperEmptyText}>Loading repo posts…</Text>
      ) : error ? (
        <Text style={styles.helperErrorText}>{error}</Text>
      ) : posts.length > 0 ? (
        <ScrollView style={styles.helperList} nestedScrollEnabled>
          {posts.map(post => (
            <TouchableOpacity
              key={post.id}
              style={styles.linkCard}
              onPress={() => onInsert(post)}
            >
              <Text style={styles.linkCardTitle}>{humanizeSlug(getPostSlugFromPath(post.path)) || post.name}</Text>
              <Text style={styles.linkCardPath} numberOfLines={1}>{getPostUrlFromPath(post.path)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.helperEmptyText}>No repo posts matched that search.</Text>
      )}
    </View>
  )
}

function DraftHistoryPanel({ history, onRestore, styles }) {
  return (
    <View style={styles.helperPanel}>
      <View style={styles.helperPanelHeader}>
        <Text style={styles.helperPanelTitle}>Draft History</Text>
        <Text style={styles.helperPanelHint}>
          Restore an earlier autosaved version before you push.
        </Text>
      </View>
      {history.length > 0 ? (
        <View style={styles.historyList}>
          {history.map((snapshot, index) => (
            <TouchableOpacity
              key={snapshot.id}
              style={styles.historyCard}
              onPress={() => onRestore(snapshot)}
            >
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle} numberOfLines={1}>
                  {index === 0 ? 'Latest autosave' : snapshot.title}
                </Text>
                <Text style={styles.historyDate}>
                  {new Date(snapshot.savedAt).toLocaleString()}
                </Text>
              </View>
              <Text style={styles.historyFilename} numberOfLines={1}>
                {snapshot.filename}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.helperEmptyText}>Autosave snapshots will appear here after you make a few edits.</Text>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Markdown Preview using @ronradtke/react-native-markdown-display
// ---------------------------------------------------------------------------
const getMarkdownStyles = (colors) => ({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  heading1: { fontSize: 26, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 4 },
  heading2: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 4 },
  heading3: { fontSize: 19, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 4 },
  heading4: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 10, marginBottom: 4 },
  heading5: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 4 },
  heading6: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 4 },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: 12 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 12,
    marginVertical: 4,
    backgroundColor: 'transparent',
  },
  code_inline: {
    backgroundColor: colors.overlay,
    color: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
  },
  code_block: {
    backgroundColor: colors.codeBg,
    color: colors.codeText,
    borderRadius: 8,
    padding: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  fence: {
    backgroundColor: colors.codeBg,
    color: colors.codeText,
    borderRadius: 8,
    padding: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  link: { color: colors.link, textDecorationLine: 'underline' },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  s: { textDecorationLine: 'line-through' },
  list_item: { marginVertical: 2 },
  bullet_list_icon: { color: colors.accent },
  ordered_list_icon: { color: colors.accent },
  image: { borderRadius: 8 },
})

function MarkdownPreview({ body, title, markdownStyles, styles, site, colors }) {
  if (!body && !title) {
    return <Text style={styles.previewEmpty}>Nothing to preview yet.</Text>
  }

  // Render body directly from draft state — no serialize+strip needed
  const content = title ? `# ${title}\n\n${body || ''}` : (body || '')

  return (
    <View style={styles.sitePreviewShell}>
      {site ? (
        <View style={[styles.sitePreviewHeader, { borderColor: site.color }]}>
          <Text style={[styles.sitePreviewEyebrow, { color: site.color }]}>
            {site.label}
          </Text>
          <Text style={styles.sitePreviewTitle}>{site.title}</Text>
          <Text style={styles.sitePreviewSubtitle}>{site.subtitle}</Text>
        </View>
      ) : null}
      <View style={styles.sitePreviewBody}>
        <Markdown style={markdownStyles}>
          {content || 'Nothing to preview yet.'}
        </Markdown>
      </View>
    </View>
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
const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: {
    backgroundColor: colors.header,
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: colors.headerText, fontSize: 18, fontWeight: '600', flex: 1, marginHorizontal: 12 },
  saveStatus: { color: colors.accentSoft, fontSize: 12, width: 55, textAlign: 'right' },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.accent },
  tabText: { fontSize: 12, color: colors.textSoft, fontWeight: '500' },
  tabTextActive: { color: colors.accent, fontWeight: '700' },

  // Tab content
  tabContent: { flex: 1 },
  tabContentInner: { padding: 16, paddingBottom: 20 },

  // Form
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
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
    color: colors.accent,
    fontWeight: '600',
    marginTop: 14,
  },
  siteRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  siteChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  siteChipDisabled: {
    opacity: 0.65,
  },
  siteChipText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.inputText,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titleInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    fontWeight: '600',
    color: colors.inputText,
    borderWidth: 1,
    borderColor: colors.border,
  },
  draftToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  draftToggleText: { fontSize: 14, color: colors.textMuted },
  remoteNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: 8,
  },
  remoteNoticeTextWrap: { flex: 1 },
  remoteNoticeTitle: { color: colors.accent, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  remoteNoticePath: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  rawNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    padding: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
  },
  rawNoticeText: { fontSize: 12, color: colors.textSoft, flex: 1 },

  // Toolbar
  toolbar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.accent,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  toolbarDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  panelBar: {
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxHeight: 44,
  },
  panelBarInner: {
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
  },
  panelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  panelChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  panelChipTextActive: {
    color: colors.headerText,
  },
  helperPanel: {
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  helperPanelHeader: {
    gap: 2,
  },
  helperPanelTitle: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '700',
  },
  helperPanelHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  helperEmptyText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  helperErrorText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  helperSearchInput: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.inputText,
    fontSize: 14,
  },
  helperList: {
    maxHeight: 220,
  },
  commandList: {
    gap: 8,
  },
  commandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  commandTextWrap: {
    flex: 1,
  },
  commandTitle: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  commandHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  livePreviewBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  outlineList: {
    gap: 6,
  },
  outlineItem: {
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingRight: 12,
  },
  outlineText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  linkCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  linkCardTitle: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  linkCardPath: {
    color: colors.link,
    fontSize: 12,
  },
  historyList: {
    gap: 8,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  historyTitle: {
    flex: 1,
    color: colors.textStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  historyDate: {
    color: colors.textMuted,
    fontSize: 11,
  },
  historyFilename: {
    color: colors.textMuted,
    fontSize: 12,
  },
  imageManager: {
    backgroundColor: colors.imagePanel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  imageManagerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  imageManagerTitle: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  imageManagerHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 220,
  },
  imageAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  imageAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  imageEmptyState: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  imageEmptyText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  imageCardRow: { gap: 10, paddingRight: 12 },
  imageCard: {
    width: 248,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  imageThumb: {
    width: '100%',
    height: 132,
    borderRadius: 10,
    backgroundColor: colors.overlay,
    marginBottom: 10,
  },
  imageThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  imageFilename: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  heroBadge: {
    backgroundColor: colors.hero,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heroBadgeText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '700',
  },
  imagePublicPath: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 8,
  },
  imageAltInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.inputText,
    marginBottom: 10,
  },
  imageActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  imageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  imageActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },

  editorSurface: {
    flex: 1,
    minHeight: 220,
  },
  editorAssistantArea: {
    maxHeight: 260,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundAlt,
  },
  editorAssistantContent: {
    paddingBottom: 8,
  },

  // Body editor
  bodyInput: {
    flex: 1,
    backgroundColor: colors.inputBg,
    padding: 16,
    fontSize: 15,
    color: colors.inputText,
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlignVertical: 'top',
  },

  // Stats bar (word count)
  statsBar: {
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  statsText: {
    fontSize: 11,
    color: colors.textSoft,
    fontFamily: 'monospace',
    textAlign: 'right',
  },

  // Preview
  previewContainer: { padding: 16, paddingBottom: 40 },
  previewEmpty: { fontSize: 15, color: colors.textSoft, textAlign: 'center', marginTop: 40 },
  sitePreviewShell: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sitePreviewHeader: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: colors.hero,
    borderBottomWidth: 3,
  },
  sitePreviewEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  sitePreviewTitle: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  sitePreviewSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  sitePreviewBody: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    backgroundColor: colors.surface,
  },

  // Diff
  diffLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '600', marginBottom: 8 },
  diffSummary: {
    backgroundColor: colors.codeBg,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  diffSummaryText: { color: colors.codeText, fontSize: 13, fontFamily: 'monospace' },
  diffBox: {
    backgroundColor: colors.codeBg,
    borderRadius: 8,
    padding: 12,
  },
  diffText: { color: colors.codeText, fontSize: 13, fontFamily: 'monospace', lineHeight: 20 },
  diffLine: { color: colors.codeText, fontSize: 13, fontFamily: 'monospace', lineHeight: 20 },
  diffAdded: { color: '#7ddf90', backgroundColor: 'rgba(125,223,144,0.1)' },
  diffRemoved: { color: colors.dangerSoft, backgroundColor: 'rgba(255,128,128,0.1)' },
  diffSkip: { color: colors.textSoft, fontSize: 12, fontFamily: 'monospace', lineHeight: 20, fontStyle: 'italic', paddingVertical: 2 },

  // Bottom bar
  bottomBar: {
    padding: 12,
    paddingBottom: 24,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
