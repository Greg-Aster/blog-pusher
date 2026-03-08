/**
 * Frontmatter parser and serializer.
 *
 * Handles YAML frontmatter delimited by --- fences at the top of Markdown
 * files. Designed to preserve unknown keys and avoid reordering.
 */

import { parse as parseYaml } from 'yaml'

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const YAML_DATE_KEYS = new Set(['published', 'updated', 'date', 'pubDatetime', 'modDatetime'])

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
export function createPostDraft({ raw, filename, siteId, images, remoteFile, destination }) {
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
    remoteProvider: remoteFile?.provider || destination || null,
    remotePath: remoteFile?.path || null,
    sourceSha: remoteFile?.sha || null,
    sourceLastCommitId: remoteFile?.lastCommitId || null,
    remoteBranch: remoteFile?.branch || null,
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

/**
 * Normalize quoted YAML date scalars in an existing Markdown file without
 * reparsing the whole document structure. This protects queued snapshots
 * created by older app versions.
 */
export function normalizeYamlDateScalars(raw) {
  if (typeof raw !== 'string' || !raw) return raw

  const match = raw.match(FRONTMATTER_RE)
  if (!match) return raw

  const yamlBlock = match[1]
  const normalizedYaml = yamlBlock.replace(
    /^(published|updated|date|pubDatetime|modDatetime):\s*"(\d{4}-\d{2}-\d{2}(?:[Tt ][\d:.+-]+(?:[Zz])?)?)"\s*$/gm,
    (_, key, value) => `${key}: ${value}`
  )

  if (normalizedYaml === yamlBlock) return raw
  return raw.replace(yamlBlock, normalizedYaml)
}

// ---------------------------------------------------------------------------
// Simple YAML helpers (no external dependency)
// ---------------------------------------------------------------------------

/**
 * Parse a YAML block into a plain object.
 * Supports nested objects, arrays, booleans, numbers, and strings.
 */
function parseSimpleYaml(yaml) {
  if (!yaml) return {}
  try {
    const parsed = parseYaml(yaml, { schema: 'core' })
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function serializeSimpleYaml(obj, keyOrder) {
  if (!obj || typeof obj !== 'object') return ''

  const lines = []
  const written = new Set()

  function writePair(key, value, indent = 0) {
    if (written.has(key)) return
    if (value === undefined) return
    written.add(key)
    const pad = ' '.repeat(indent)

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`)
      } else {
        lines.push(`${pad}${key}:`)
        for (const item of value) {
          writeArrayItem(item, indent + 2, key)
        }
      }
      return
    }

    if (isPlainObject(value)) {
      const entries = Object.entries(value)
      if (entries.length === 0) {
        lines.push(`${pad}${key}: {}`)
      } else {
        lines.push(`${pad}${key}:`)
        for (const [childKey, childValue] of entries) {
          writeNestedPair(childKey, childValue, indent + 2)
        }
      }
      return
    }

    if (value === null) {
      return
    }

    lines.push(`${pad}${key}: ${formatYamlScalar(value, key)}`)
  }

  function writeNestedPair(key, value, indent) {
    const pad = ' '.repeat(indent)

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`)
      } else {
        lines.push(`${pad}${key}:`)
        for (const item of value) {
          writeArrayItem(item, indent + 2, key)
        }
      }
      return
    }

    if (isPlainObject(value)) {
      const entries = Object.entries(value)
      if (entries.length === 0) {
        lines.push(`${pad}${key}: {}`)
      } else {
        lines.push(`${pad}${key}:`)
        for (const [childKey, childValue] of entries) {
          writeNestedPair(childKey, childValue, indent + 2)
        }
      }
      return
    }

    if (value === null || value === undefined) {
      return
    }

    lines.push(`${pad}${key}: ${formatYamlScalar(value, key)}`)
  }

  function writeArrayItem(item, indent, parentKey) {
    const pad = ' '.repeat(indent)

    if (Array.isArray(item)) {
      if (item.length === 0) {
        lines.push(`${pad}- []`)
      } else {
        lines.push(`${pad}-`)
        for (const nestedItem of item) {
          writeArrayItem(nestedItem, indent + 2, parentKey)
        }
      }
      return
    }

    if (isPlainObject(item)) {
      const entries = Object.entries(item)
      if (entries.length === 0) {
        lines.push(`${pad}- {}`)
      } else {
        lines.push(`${pad}-`)
        for (const [childKey, childValue] of entries) {
          writeNestedPair(childKey, childValue, indent + 2)
        }
      }
      return
    }

    if (item === null || item === undefined) {
      lines.push(`${pad}- null`)
      return
    }

    lines.push(`${pad}- ${formatYamlScalar(item, parentKey)}`)
  }

  if (Array.isArray(keyOrder)) {
    for (const key of keyOrder) {
      if (key in obj) writePair(key, obj[key], 0)
    }
  }
  for (const key of Object.keys(obj)) {
    if (written.has(key)) continue
    writePair(key, obj[key], 0)
  }

  return lines.join('\n')
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

function isYamlDateLiteral(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ||
    /^\d{4}-\d{2}-\d{2}[Tt ][\d:.+-]+(?:[Zz])?$/.test(s)
}

function formatYamlScalar(value, key) {
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (value instanceof Date) {
    const iso = value.toISOString()
    const dateOnly = iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
    return yamlQuote(dateOnly, key)
  }
  if (value === null) return 'null'
  return yamlQuote(String(value), key)
}

function yamlQuote(s, key) {
  if (YAML_DATE_KEYS.has(key) && isYamlDateLiteral(s)) {
    return s
  }
  // Quote strings that could be misinterpreted
  if (s === '' || s === 'true' || s === 'false' || s === 'null' ||
      /^[\d.-]/.test(s) || /[:#{}[\],&*?|>!%@`]/.test(s) ||
      s.includes("'") || s.includes('"') || s.includes('\n')) {
    // Use double quotes, escape internal double quotes
    return `"${s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')}"`
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
