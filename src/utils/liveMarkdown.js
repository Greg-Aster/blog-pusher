import { Platform } from 'react-native'

const MONO_FONT = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
})

const MAX_PARSABLE_LENGTH = 12000

function addRange(ranges, type, start, length, extra) {
  'worklet'
  if (length <= 0 || start < 0) return
  ranges.push(extra ? { type, start, length, ...extra } : { type, start, length })
}

function overlaps(segments, start, end) {
  'worklet'
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (start < segment.end && end > segment.start) {
      return true
    }
  }
  return false
}

function addSegment(segments, start, end) {
  'worklet'
  if (end <= start) return
  segments.push({ start, end })
}

function parseFencedCodeBlocks(text, ranges, protectedSegments) {
  'worklet'

  let searchFrom = 0
  while (searchFrom < text.length) {
    const start = text.indexOf('```', searchFrom)
    if (start === -1) break

    const closingFence = text.indexOf('```', start + 3)
    const end = closingFence === -1 ? text.length : closingFence + 3
    const openingLineBreak = text.indexOf('\n', start)
    const contentStart = openingLineBreak === -1 || openingLineBreak >= end ? Math.min(start + 3, end) : openingLineBreak + 1
    const closingStart = closingFence === -1 ? end : closingFence

    addRange(ranges, 'codeblock', start, end - start)
    addRange(ranges, 'syntax', start, contentStart - start)
    addRange(ranges, 'pre', contentStart, closingStart - contentStart)
    if (closingFence !== -1) {
      addRange(ranges, 'syntax', closingStart, 3)
    }
    addSegment(protectedSegments, start, end)
    searchFrom = end
  }
}

function parseLineStyles(text, ranges, protectedSegments) {
  'worklet'

  let offset = 0
  while (offset <= text.length) {
    let lineEnd = text.indexOf('\n', offset)
    if (lineEnd === -1) lineEnd = text.length

    if (!overlaps(protectedSegments, offset, lineEnd)) {
      const line = text.slice(offset, lineEnd)

      const blockquoteMatch = line.match(/^(>\s*)+/)
      if (blockquoteMatch) {
        const marker = blockquoteMatch[0]
        const depth = (marker.match(/>/g) || []).length || 1
        addRange(ranges, 'syntax', offset, marker.length)
        addRange(ranges, 'blockquote', offset, line.length, { depth })
      }

      const headingMatch = line.match(/^(#{1,6})(\s+)(.+)$/)
      if (headingMatch) {
        const markerLength = headingMatch[1].length + headingMatch[2].length
        addRange(ranges, 'syntax', offset, markerLength)
        addRange(ranges, 'h1', offset + markerLength, line.length - markerLength, {
          depth: headingMatch[1].length,
        })
      }
    }

    if (lineEnd === text.length) break
    offset = lineEnd + 1
  }
}

function parsePattern(text, regexp, callback, protectedSegments) {
  'worklet'

  regexp.lastIndex = 0
  let match = regexp.exec(text)
  while (match) {
    const start = match.index
    const end = start + match[0].length
    if (!overlaps(protectedSegments, start, end)) {
      callback(match, start, end)
    }
    if (match[0].length === 0) {
      regexp.lastIndex += 1
    }
    match = regexp.exec(text)
  }
}

export function parseLiveMarkdown(input) {
  'worklet'

  const text = String(input || '')
  if (!text || text.length > MAX_PARSABLE_LENGTH) {
    return []
  }

  const ranges = []
  const protectedSegments = []

  parseFencedCodeBlocks(text, ranges, protectedSegments)
  parseLineStyles(text, ranges, protectedSegments)

  parsePattern(text, /`([^`\n]+)`/g, (match, start, end) => {
    addRange(ranges, 'syntax', start, 1)
    addRange(ranges, 'code', start + 1, match[1].length)
    addRange(ranges, 'syntax', end - 1, 1)
    addSegment(protectedSegments, start, end)
  }, protectedSegments)

  parsePattern(text, /!\[([^\]]*)\]\(([^)\n]+)\)/g, (match, start, end) => {
    const alt = match[1] || ''
    const url = match[2] || ''
    const urlStart = start + alt.length + 4
    addRange(ranges, 'syntax', start, 2)
    addRange(ranges, 'syntax', start + alt.length + 2, 2)
    addRange(ranges, 'link', urlStart, url.length)
    addRange(ranges, 'syntax', end - 1, 1)
    addSegment(protectedSegments, start, end)
  }, protectedSegments)

  parsePattern(text, /(^|[^!])\[([^\]]+)\]\(([^)\n]+)\)/gm, (match, start, end) => {
    const prefixLength = match[1].length
    const label = match[2] || ''
    const url = match[3] || ''
    const tokenStart = start + prefixLength
    const urlStart = tokenStart + label.length + 3
    addRange(ranges, 'syntax', tokenStart, 1)
    addRange(ranges, 'syntax', tokenStart + label.length + 1, 2)
    addRange(ranges, 'link', urlStart, url.length)
    addRange(ranges, 'syntax', end - 1, 1)
    addSegment(protectedSegments, tokenStart, end)
  }, protectedSegments)

  parsePattern(text, /\*\*([^\n*][\s\S]*?[^\n*])\*\*/g, (match, start, end) => {
    addRange(ranges, 'syntax', start, 2)
    addRange(ranges, 'bold', start + 2, match[1].length)
    addRange(ranges, 'syntax', end - 2, 2)
    addSegment(protectedSegments, start, end)
  }, protectedSegments)

  parsePattern(text, /~~([^\n~][\s\S]*?[^\n~])~~/g, (match, start, end) => {
    addRange(ranges, 'syntax', start, 2)
    addRange(ranges, 'strikethrough', start + 2, match[1].length)
    addRange(ranges, 'syntax', end - 2, 2)
    addSegment(protectedSegments, start, end)
  }, protectedSegments)

  parsePattern(text, /(^|[^_])_([^_\n][^_\n]*?[^_\n]?)_(?!_)/gm, (match, start) => {
    const prefixLength = match[1].length
    const italicStart = start + prefixLength
    const italicLength = match[2].length
    const italicEnd = italicStart + italicLength + 2
    if (overlaps(protectedSegments, italicStart, italicEnd)) return
    addRange(ranges, 'syntax', italicStart, 1)
    addRange(ranges, 'italic', italicStart + 1, italicLength)
    addRange(ranges, 'syntax', italicStart + 1 + italicLength, 1)
  }, protectedSegments)

  ranges.sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start
    return left.length - right.length
  })

  return ranges
}

export function getLiveMarkdownStyle(colors, accentColor) {
  const siteAccent = accentColor || colors.accent
  return {
    syntax: {
      color: colors.textSoft,
    },
    link: {
      color: siteAccent || colors.link,
    },
    h1: {
      fontSize: 24,
    },
    blockquote: {
      borderColor: siteAccent || colors.borderStrong,
      borderWidth: 4,
      marginLeft: 8,
      paddingLeft: 10,
    },
    code: {
      fontFamily: MONO_FONT,
      fontSize: 15,
      color: colors.codeText,
      backgroundColor: colors.codeBg,
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderRadius: 6,
      padding: 1,
    },
    pre: {
      fontFamily: MONO_FONT,
      fontSize: 15,
      color: colors.codeText,
      backgroundColor: colors.codeBg,
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderRadius: 8,
      padding: 4,
    },
    inlineImage: {
      minWidth: 64,
      minHeight: 64,
      maxWidth: 220,
      maxHeight: 220,
      marginTop: 8,
      marginBottom: 4,
      borderRadius: 8,
    },
    loadingIndicator: {
      primaryColor: siteAccent || colors.link,
      secondaryColor: colors.surfaceAlt,
      width: 18,
      height: 18,
      borderWidth: 2,
    },
  }
}
