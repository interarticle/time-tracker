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

/** A priority tag looks like #p0, #p1, … — the number is the priority (0 = highest). */
const PRIORITY_RE = /^p(\d+)$/i

export function isPriorityTag(tag: string): boolean {
  return PRIORITY_RE.test(tag)
}

/**
 * Extract the priority from a name's #p<number> tag. Lower numbers are higher
 * priority. Returns null when no priority tag is present. If several are given,
 * the highest priority (lowest number) wins.
 */
export function parsePriority(name: string): number | null {
  let best: number | null = null
  for (const tag of parseTags(name).tags) {
    const m = tag.match(PRIORITY_RE)
    if (m) {
      const n = Number(m[1])
      if (best === null || n < best) best = n
    }
  }
  return best
}
