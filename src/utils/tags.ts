/**
 * Extract #hashtags from a task name.
 * Tags are identified by # followed by word characters (letters, digits, underscore, hyphen).
 * Returns the display name (tags stripped) and the list of tags (without the # prefix).
 */

const TAG_RE = /#([\w-]+)/g

export interface ParsedName {
  /** Name with tags removed and trimmed */
  displayName: string
  /** Tags without # prefix, e.g. ['timeboxed', 'focus'] */
  tags: string[]
}

export function parseTags(name: string): ParsedName {
  const tags: string[] = []
  const displayName = name.replace(TAG_RE, (_match, tag: string) => {
    tags.push(tag)
    return ''
  }).replace(/\s{2,}/g, ' ').trim()
  return { displayName, tags }
}

export function hasTag(name: string, tag: string): boolean {
  TAG_RE.lastIndex = 0
  let m
  while ((m = TAG_RE.exec(name)) !== null) {
    if (m[1]!.toLowerCase() === tag.toLowerCase()) return true
  }
  return false
}
