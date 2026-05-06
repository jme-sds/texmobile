import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import type { ErrorSuggestion } from './types'

export interface SuggestionRange {
  suggestionId: string
  from: number
  to: number
  type: 'deletion' | 'addition-widget'
  replacementText?: string
}

interface SuggestionDecorState {
  ranges: Map<string, SuggestionRange[]>
  decorations: DecorationSet
}

export const setSuggestionsEffect = StateEffect.define<SuggestionRange[]>()
export const removeSuggestionEffect = StateEffect.define<string>()
export const clearAllSuggestionsEffect = StateEffect.define<null>()

class AdditionWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly suggestionId: string,
  ) { super() }

  eq(other: AdditionWidget) {
    return other.text === this.text && other.suggestionId === this.suggestionId
  }

  toDOM() {
    const span = document.createElement('span')
    span.textContent = this.text
    span.className = 'cm-suggestion-addition'
    return span
  }

  ignoreEvent() { return true }
}

function buildDecorations(ranges: Map<string, SuggestionRange[]>): DecorationSet {
  const all: SuggestionRange[] = []
  for (const rs of ranges.values()) {
    for (const r of rs) all.push(r)
  }
  all.sort((a, b) => a.from - b.from || a.to - b.to)

  const builder = new RangeSetBuilder<Decoration>()
  for (const r of all) {
    if (r.type === 'deletion') {
      builder.add(r.from, r.to, Decoration.mark({
        class: 'cm-suggestion-deletion',
        attributes: { 'data-suggestion-id': r.suggestionId },
      }))
    } else {
      builder.add(r.from, r.from, Decoration.widget({
        widget: new AdditionWidget(r.replacementText ?? '', r.suggestionId),
        side: 1,
      }))
    }
  }
  return builder.finish()
}

export const suggestionField = StateField.define<SuggestionDecorState>({
  create() {
    return { ranges: new Map(), decorations: Decoration.none }
  },

  update(state, tr) {
    let { ranges, decorations } = state
    decorations = decorations.map(tr.changes)

    for (const effect of tr.effects) {
      if (effect.is(clearAllSuggestionsEffect)) {
        return { ranges: new Map(), decorations: Decoration.none }
      }

      if (effect.is(setSuggestionsEffect)) {
        ranges = new Map()
        for (const r of effect.value) {
          const existing = ranges.get(r.suggestionId) ?? []
          existing.push(r)
          ranges.set(r.suggestionId, existing)
        }
        decorations = buildDecorations(ranges)
      }

      if (effect.is(removeSuggestionEffect)) {
        ranges = new Map(ranges)
        ranges.delete(effect.value)
        decorations = buildDecorations(ranges)
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

export function applySuggestionDecorations(
  view: EditorView,
  suggestions: ErrorSuggestion[],
): void {
  const doc = view.state.doc.toString()
  const allRanges: SuggestionRange[] = []

  for (const s of suggestions) {
    const match = findInDoc(doc, s.original)
    if (!match) continue

    allRanges.push({
      suggestionId: s.id,
      from: match.from,
      to: match.to,
      type: 'deletion',
    })

    allRanges.push({
      suggestionId: s.id,
      from: match.to,
      to: match.to,
      type: 'addition-widget',
      replacementText: s.replacement,
    })
  }

  view.dispatch({ effects: setSuggestionsEffect.of(allRanges) })
}

export function approveSuggestion(
  view: EditorView,
  suggestion: ErrorSuggestion,
): void {
  const stored = view.state.field(suggestionField).ranges.get(suggestion.id)
  const delRange = stored?.find(r => r.type === 'deletion')
  if (!delRange) return

  view.dispatch({
    changes: { from: delRange.from, to: delRange.to, insert: suggestion.replacement },
    effects: removeSuggestionEffect.of(suggestion.id),
  })
}

export function rejectSuggestion(view: EditorView, id: string): void {
  view.dispatch({ effects: removeSuggestionEffect.of(id) })
}
