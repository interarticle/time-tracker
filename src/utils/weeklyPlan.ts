/**
 * Weekly-plan markdown parsing.
 *
 * The plan is free-form markdown, but H1 headings carry structure: each `# …`
 * starts a *project* section that runs until the next H1 (or the end of the
 * document). The heading text is the project name; any #hashtags inside it are
 * extracted, and the **first** hashtag is the identifying tag used to match
 * tasks in the tracker.
 *
 * Anything before the first H1 is a preamble and is rendered as-is.
 */
import { marked } from 'marked'
import { parseTags } from './tags'

export interface PlanSection {
  /** Identifying tag (first hashtag in the heading), lowercased. Null if untagged. */
  tag: string | null
  /** All hashtags found in the heading, in order, as written. */
  tags: string[]
  /** Heading text with hashtags stripped. */
  title: string
  /** Rendered HTML of the section body (everything below the heading). */
  contentHtml: string
}

export interface ParsedPlan {
  /** Rendered HTML of anything preceding the first H1. */
  preambleHtml: string
  sections: PlanSection[]
}

function render(markdown: string): string {
  if (markdown.trim() === '') return ''
  return marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string
}

export function parseWeeklyPlan(markdown: string): ParsedPlan {
  const source = markdown ?? ''
  if (source.trim() === '') return { preambleHtml: '', sections: [] }

  const tokens = marked.lexer(source)
  const preamble: string[] = []
  const sections: PlanSection[] = []

  let current: { title: string; tags: string[]; body: string[] } | null = null
  const flush = () => {
    if (!current) return
    sections.push({
      tag: current.tags[0]?.toLowerCase() ?? null,
      tags: current.tags,
      title: current.title,
      contentHtml: render(current.body.join('')),
    })
    current = null
  }

  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 1) {
      flush()
      const { displayName, tags } = parseTags(token.text ?? '')
      current = { title: displayName, tags, body: [] }
    } else if (current) {
      current.body.push(token.raw)
    } else {
      preamble.push(token.raw)
    }
  }
  flush()

  return { preambleHtml: render(preamble.join('')), sections }
}
