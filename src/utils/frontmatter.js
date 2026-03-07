/**
 * Frontmatter parser and serializer.
 *
 * Handles YAML frontmatter delimited by --- fences at the top of Markdown
 * files.  Designed to preserve unknown keys and avoid reordering.
 */

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Parse a raw Markdown string into { frontmatter, body, raw }.
 *
 * frontmatter is a plain object of key → value.
 * body is the Markdown below the second --- fence.
 * raw is the original string, kept for diffing.
 */
export function parseMarkdown(raw) {
  if (typeof raw !== 'string') raw = ''
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {
    return { frontmatter: {}, body: raw.trim(), raw }
  }

  const yamlBlock = match[1]
  const body = raw.slice(match[0].length).trim()
  const frontmatter = parseSimpleYaml(yamlBlock)
  return { frontmatter, body, raw }
}

/**
 * Serialize frontmatter + body back into a complete Markdown string.
 *
 * keyOrder is an optional array of keys that should appear first, in order.
 * Any keys in frontmatter not listed in keyOrder are appended afterwards,
 * preserving insertion order.
 */
export function serializeMarkdown(frontmatter, body, keyOrder) {
  const yaml = serializeSimpleYaml(frontmatter, keyOrder)
  const trimmedBody = (body || '').trim()
  if (!yaml) return trimmedBody
  return `---\n${yaml}\n---\n\n${trimmedBody}\n`
}

/**
 * Build a PostDraft from raw Markdown + metadata.
 */
export function createPostDraft({ raw, filename, siteId, images }) {
  const { frontmatter, body } = parseMarkdown(raw)
  return {
    id: Date.now().toString(),
    repoSiteId: siteId || 'temporal',
    filename: filename || 'untitled.md',
    title: frontmatter.title || '',
    description: frontmatter.description || '',
    published: frontmatter.published || frontmatter.pubDatetime || frontmatter.date || '',
    updated: frontmatter.updated || frontmatter.modDatetime || '',
    tags: normalizeTags(frontmatter.tags),
    category: frontmatter.category || '',
    heroImage: frontmatter.heroImage || frontmatter.ogImage || '',
    draft: frontmatter.draft === true || frontmatter.draft === 'true',
    body,
    rawFrontmatter: { ...frontmatter },
    attachedImages: Array.isArray(images) ? images : [],
    sourceSha: null,
    dirty: false,
    rawOriginal: raw,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Serialize a PostDraft back into a full Markdown string.
 * Merges structured fields back into rawFrontmatter so unknown keys survive.
 */
export function serializeDraft(draft) {
  const fm = { ...draft.rawFrontmatter }

  // Overwrite the structured fields
  if (draft.title) fm.title = draft.title
  else delete fm.title

  if (draft.description) fm.description = draft.description
  else delete fm.description

  if (draft.published) {
    // Write back to whichever key was originally used
    if (fm.pubDatetime !== undefined) fm.pubDatetime = draft.published
    else if (fm.date !== undefined) fm.date = draft.published
    else fm.published = draft.published
  }

  if (draft.updated) {
    if (fm.modDatetime !== undefined) fm.modDatetime = draft.updated
    else fm.updated = draft.updated
  }

  if (draft.tags && draft.tags.length > 0) fm.tags = draft.tags
  else delete fm.tags

  if (draft.category) fm.category = draft.category
  else delete fm.category

  if (draft.heroImage) fm.heroImage = draft.heroImage
  else delete fm.heroImage

  if (draft.draft === true) fm.draft = true
  else delete fm.draft

  const keyOrder = [
    'title', 'description', 'published', 'pubDatetime', 'date',
    'updated', 'modDatetime', 'tags', 'category', 'heroImage',
    'ogImage', 'draft',
  ]

  return serializeMarkdown(fm, draft.body, keyOrder)
}

// ---------------------------------------------------------------------------
// Simple YAML helpers (no external dependency)
// ---------------------------------------------------------------------------

/**
 * Parse a simple YAML block into a plain object.
 * Supports: string values, booleans, numbers, and inline/block arrays.
 * Does NOT support nested objects — they are stored as raw strings.
 */
function parseSimpleYaml(yaml) {
  const result = {}
  if (!yaml) return result

  const lines = yaml.split(/\r?\n/)
  let currentKey = null
  let currentArray = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Block array continuation: "  - value"
    if (currentKey && currentArray !== null && /^\s+-\s+/.test(line)) {
      const val = line.replace(/^\s+-\s+/, '').trim()
      currentArray.push(unquote(val))
      result[currentKey] = currentArray
      continue
    }

    // If we were collecting a block array, finalize it
    if (currentArray !== null) {
      currentArray = null
      currentKey = null
    }

    // Key: value line
    const kvMatch = line.match(/^([A-Za-z_][\w.-]*)\s*:\s*(.*)$/)
    if (!kvMatch) continue

    const key = kvMatch[1]
    let value = kvMatch[2].trim()

    // Inline array: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1)
      result[key] = inner
        ? inner.split(',').map(s => unquote(s.trim()))
        : []
      currentKey = null
      currentArray = null
      continue
    }

    // Empty value followed by block array
    if (value === '') {
      // Peek at next line for block array
      if (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        currentKey = key
        currentArray = []
        continue
      }
      result[key] = ''
      continue
    }

    result[key] = coerceValue(unquote(value))
    currentKey = null
    currentArray = null
  }

  return result
}

function serializeSimpleYaml(obj, keyOrder) {
  if (!obj || typeof obj !== 'object') return ''

  const lines = []
  const written = new Set()

  function writePair(key) {
    if (written.has(key)) return
    if (!(key in obj)) return
    written.add(key)
    const val = obj[key]
    if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${key}: []`)
      } else {
        lines.push(`${key}:`)
        for (const item of val) {
          lines.push(`  - ${yamlQuote(String(item))}`)
        }
      }
    } else if (val === true) {
      lines.push(`${key}: true`)
    } else if (val === false) {
      lines.push(`${key}: false`)
    } else if (val === null || val === undefined) {
      // skip
    } else {
      lines.push(`${key}: ${yamlQuote(String(val))}`)
    }
  }

  if (Array.isArray(keyOrder)) {
    for (const key of keyOrder) writePair(key)
  }
  for (const key of Object.keys(obj)) writePair(key)

  return lines.join('\n')
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function coerceValue(s) {
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null' || s === '~') return null
  // Don't coerce date-like strings to numbers
  if (/^\d{4}-\d{2}/.test(s)) return s
  if (/^-?\d+(\.\d+)?$/.test(s) && s.length < 16) return Number(s)
  return s
}

function yamlQuote(s) {
  // Quote strings that could be misinterpreted
  if (s === '' || s === 'true' || s === 'false' || s === 'null' ||
      /^[\d.-]/.test(s) || /[:#{}[\],&*?|>!%@`]/.test(s) ||
      s.includes("'") || s.includes('"')) {
    // Use double quotes, escape internal double quotes
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return s
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean)
  if (typeof tags === 'string' && tags.trim()) {
    return tags.split(',').map(t => t.trim()).filter(Boolean)
  }
  return []
}
