import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView } from '@codemirror/view'
import type { DocumentComment } from './types'

interface CommentRange {
  commentId: string
  from: number
  to: number
}

interface CommentDecorState {
  ranges: Map<string, CommentRange>
  decorations: DecorationSet
}

export const setCommentsEffect = StateEffect.define<CommentRange[]>()
export const removeCommentEffect = StateEffect.define<string>()
export const clearAllCommentsEffect = StateEffect.define<null>()

function buildCommentDecorations(ranges: Map<string, CommentRange>): DecorationSet {
  const all = Array.from(ranges.values()).sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const r of all) {
    builder.add(r.from, r.to, Decoration.mark({
      class: 'cm-comment-anchor',
      attributes: { 'data-comment-id': r.commentId },
    }))
  }
  return builder.finish()
}

export const commentField = StateField.define<CommentDecorState>({
  create: () => ({ ranges: new Map(), decorations: Decoration.none }),

  update(state, tr) {
    let { ranges, decorations } = state
    decorations = decorations.map(tr.changes)

    for (const effect of tr.effects) {
      if (effect.is(clearAllCommentsEffect)) {
        return { ranges: new Map(), decorations: Decoration.none }
      }
      if (effect.is(setCommentsEffect)) {
        ranges = new Map()
        for (const r of effect.value) ranges.set(r.commentId, r)
        decorations = buildCommentDecorations(ranges)
      }
      if (effect.is(removeCommentEffect)) {
        ranges = new Map(ranges)
        ranges.delete(effect.value)
        decorations = buildCommentDecorations(ranges)
      }
    }

    return { ranges, decorations }
  },

  provide: f => EditorView.decorations.from(f, s => s.decorations),
})

function findInDoc(doc: string, anchor: string): { from: number; to: number } | null {
  const exact = doc.indexOf(anchor)
  if (exact !== -1) return { from: exact, to: exact + anchor.length }

  const mapping: number[] = []
  let normalized = ''
  let i = 0
  while (i < doc.length) {
    if (/\s/.test(doc[i])) {
      normalized += ' '
      mapping.push(i)
      while (i < doc.length && /\s/.test(doc[i])) i++
    } else {
      normalized += doc[i]
      mapping.push(i)
      i++
    }
  }
  const normAnchor = anchor.replace(/\s+/g, ' ').trim()
  const idx = normalized.indexOf(normAnchor)
  if (idx === -1) return null
  return { from: mapping[idx], to: mapping[idx + normAnchor.length - 1] + 1 }
}

export function applyCommentDecorations(view: EditorView, comments: DocumentComment[]): void {
  const doc = view.state.doc.toString()
  const allRanges: CommentRange[] = []

  for (const c of comments) {
    if (c.status !== 'active') continue
    const match = findInDoc(doc, c.anchored_text)
    if (!match) continue
    allRanges.push({ commentId: c.id, from: match.from, to: match.to })
  }

  view.dispatch({ effects: setCommentsEffect.of(allRanges) })
}

export function removeCommentDecoration(view: EditorView, id: string): void {
  view.dispatch({ effects: removeCommentEffect.of(id) })
}
