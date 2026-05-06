'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView, keymap, lineNumbers,
  highlightActiveLine, highlightActiveLineGutter,
  drawSelection, highlightSpecialChars,
} from '@codemirror/view'
import {
  history, defaultKeymap, historyKeymap, indentWithTab, undo, redo,
} from '@codemirror/commands'
import { StreamLanguage, bracketMatching } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { oneDark } from '@codemirror/theme-one-dark'
import { highlightSelectionMatches, searchKeymap, openSearchPanel } from '@codemirror/search'
import {
  autocompletion, completionKeymap, acceptCompletion,
  closeBrackets, closeBracketsKeymap,
} from '@codemirror/autocomplete'
import { Copy, MoreHorizontal, Undo2, Redo2, Search, Bot, AlertCircle, Loader2, PenLine, BarChart2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useApp } from '@/lib/AppContext'
import type { ErrorSuggestion, CheckErrorsStatus, DocumentComment } from '@/lib/types'
import {
  suggestionField, applySuggestionDecorations, approveSuggestion,
  rejectSuggestion, clearAllSuggestionsEffect,
} from '@/lib/errorDecorations'
import {
  commentField, applyCommentDecorations, removeCommentDecoration, clearAllCommentsEffect,
} from '@/lib/commentDecorations'
import { checkErrors, writingAssist, commentAssist, getComments, updateComment, deleteComment, listFiles, readFile } from '@/lib/api'

const ChatWindow = dynamic(() => import('./ChatWindow'), { ssr: false })
const ErrorSuggestionPanel = dynamic(() => import('./ErrorSuggestionPanel'), { ssr: false })
const WritingAssistPanel = dynamic(() => import('./WritingAssistPanel'), { ssr: false })
const StatsModal = dynamic(() => import('./StatsModal'), { ssr: false })
import {
  latexCommandSource, environmentSource, packageSource,
  makeCitationSource, labelRefSource, parseBibKeys,
  completionScrollFixPlugin,
} from '@/lib/latexAutocomplete'

// Fine-tune the One Dark palette to match our surface tokens.
const latexTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#0d0f12' },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
    fontSize: '13px',
    lineHeight: '1.65',
  },
  '.cm-content': { padding: '8px 0', caretColor: '#818cf8' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#818cf8' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#2d3561',
  },
  '.cm-activeLine': { backgroundColor: '#161a20' },
  '.cm-activeLineGutter': { backgroundColor: '#161a20', color: '#6366f1' },
  '.cm-gutters': {
    backgroundColor: '#0d0f12',
    borderRight: '1px solid #1e242c',
    color: '#374151',
    minWidth: '3rem',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 6px' },
})

// Common LaTeX snippets shown in the scrollable snippet bar.
const SNIPPETS: { label: string; text: string }[] = [
  { label: '$…$',       text: '$  $'              },
  { label: '$$…$$',     text: '$$\n  \n$$'        },
  { label: '\\frac',    text: '\\frac{}{}'         },
  { label: '\\sqrt',    text: '\\sqrt{}'           },
  { label: '\\sum',     text: '\\sum_{i=1}^{n}'   },
  { label: '\\int',     text: '\\int_{a}^{b}'     },
  { label: '\\begin',   text: '\\begin{}\n\n\\end{}' },
  { label: '\\section', text: '\\section{}'        },
  { label: '\\bf',      text: '\\textbf{}'         },
  { label: '\\em',      text: '\\emph{}'           },
  { label: '\\item',    text: '\\item '            },
  { label: '\\label',   text: '\\label{}'          },
  { label: '\\ref',     text: '\\ref{}'            },
  { label: '\\cite',    text: '\\cite{}'           },
]

// Set to true to re-enable the writing assistant toolbar button and panel.
const WRITING_ASSISTANT_ENABLED = false

const CURSOR_POSITIONS_KEY = 'texmobile:cursorPositions'

function getCursorPositions(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CURSOR_POSITIONS_KEY) ?? '{}') } catch { return {} }
}
function saveCursorPosition(key: string, pos: number) {
  const positions = getCursorPositions()
  positions[key] = pos
  localStorage.setItem(CURSOR_POSITIONS_KEY, JSON.stringify(positions))
}

export default function EditorPane() {
  const { editorContent, setEditorContent, currentFile, currentProject, isChatOpen, setChatOpen } = useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Guards against the editor's own change event re-writing state it already produced.
  const suppressRef = useRef(false)
  const citationsRef = useRef<string[]>([])
  // Tracks the composite key of the currently loaded file so we can save/restore scroll.
  const currentFileKeyRef = useRef<string | null>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [showStats, setShowStats] = useState(false)

  const [checkStatus, setCheckStatus] = useState<CheckErrorsStatus>('idle')
  const [suggestions, setSuggestions] = useState<ErrorSuggestion[]>([])

  const [writeStatus, setWriteStatus] = useState<CheckErrorsStatus>('idle')
  const [writeSuggestions, setWriteSuggestions] = useState<ErrorSuggestion[]>([])
  const [writePrompt, setWritePrompt] = useState('')
  const [writeOpen, setWriteOpen] = useState(false)

  const [assistMode, setAssistMode] = useState<'edit' | 'comment'>('edit')
  const [commentStatus, setCommentStatus] = useState<CheckErrorsStatus>('idle')
  const [allComments, setAllComments] = useState<DocumentComment[]>([])
  const [commentPrompt, setCommentPrompt] = useState('')
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null)

  // Load .bib citation keys whenever the active project changes.
  useEffect(() => {
    if (!currentProject) { citationsRef.current = []; return }
    let cancelled = false
    ;(async () => {
      try {
        const files = await listFiles(currentProject)
        const bibFiles = files.filter(f => f.type === 'file' && f.name.endsWith('.bib'))
        const results = await Promise.all(
          bibFiles.map(f => readFile(currentProject, f.path))
        )
        if (!cancelled) {
          citationsRef.current = results.flatMap(r => parseBibKeys(r.content))
        }
      } catch { /* non-fatal: citations just won't appear */ }
    })()
    return () => { cancelled = true }
  }, [currentProject])

  // Create the editor once on mount.
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return

    const citationSource = makeCitationSource(citationsRef)

    const view = new EditorView({
      state: EditorState.create({
        doc: editorContent,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          autocompletion({
            override: [
              latexCommandSource,
              environmentSource,
              packageSource,
              citationSource,
              labelRefSource,
            ],
            activateOnTyping: true,
            aboveCursor: true,
          }),
          completionScrollFixPlugin,
          StreamLanguage.define(stex),
          oneDark,
          latexTheme,
          EditorView.lineWrapping,
          keymap.of([
            ...closeBracketsKeymap,
            ...completionKeymap,
            { key: 'Tab', run: acceptCompletion },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          suggestionField,
          commentField,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !suppressRef.current) {
              setEditorContent(update.state.doc.toString())
            }
          }),
        ],
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load comments whenever the active file changes.
  useEffect(() => {
    const view = viewRef.current
    if (!currentProject || !currentFile) {
      setAllComments([])
      if (view) view.dispatch({ effects: clearAllCommentsEffect.of(null) })
      return
    }
    let cancelled = false
    getComments(currentProject, currentFile)
      .then(comments => {
        if (cancelled) return
        setAllComments(comments)
        const v = viewRef.current
        if (v) applyCommentDecorations(v, comments)
      })
      .catch(() => {/* non-fatal */})
    return () => { cancelled = true }
  }, [currentProject, currentFile])

  // On file switch: save the cursor position for the file being left, then update the key ref.
  useEffect(() => {
    const prevKey = currentFileKeyRef.current
    const nextKey = currentProject && currentFile ? `${currentProject}::${currentFile}` : null
    if (prevKey && viewRef.current) {
      saveCursorPosition(prevKey, viewRef.current.state.selection.main.head)
    }
    currentFileKeyRef.current = nextKey
  }, [currentProject, currentFile])

  // Save cursor position when the app is closed or refreshed.
  useEffect(() => {
    const handleUnload = () => {
      const key = currentFileKeyRef.current
      if (key && viewRef.current) {
        saveCursorPosition(key, viewRef.current.state.selection.main.head)
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // Close the three-dot menu when clicking outside it.
  useEffect(() => {
    if (!menuOpen) return
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  // Sync externally driven content changes into the editor and restore the saved cursor
  // position. Including selection+scrollIntoView in the dispatch lets CodeMirror handle
  // the scroll itself, avoiding any race with its own pending-scroll mechanism.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === editorContent) return

    const key = currentFileKeyRef.current
    const savedPos = key ? (getCursorPositions()[key] ?? 0) : 0
    const anchor = Math.min(savedPos, editorContent.length)

    suppressRef.current = true
    view.dispatch({
      changes: { from: 0, to: current.length, insert: editorContent },
      selection: { anchor },
      scrollIntoView: true,
    })
    suppressRef.current = false
  }, [editorContent])

  const insertSnippet = useCallback((text: string) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch(view.state.replaceSelection(text))
    view.focus()
  }, [])

  const handleCopyAll = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    await navigator.clipboard.writeText(view.state.doc.toString())
  }, [])

  const handleUndo = useCallback(() => {
    const view = viewRef.current
    if (view) { undo(view); view.focus() }
  }, [])

  const handleRedo = useCallback(() => {
    const view = viewRef.current
    if (view) { redo(view); view.focus() }
  }, [])

  const handleSearch = useCallback(() => {
    const view = viewRef.current
    if (view) { openSearchPanel(view); view.focus() }
  }, [])

  const handleCheckErrors = useCallback(async () => {
    const view = viewRef.current
    if (!view || checkStatus === 'loading') return
    setCheckStatus('loading')
    setSuggestions([])
    // Clear writing assistant if active
    setWriteSuggestions([])
    setWriteStatus('idle')
    setWriteOpen(false)
    view.dispatch({ effects: clearAllSuggestionsEffect.of(null) })
    try {
      const result = await checkErrors(editorContent, currentFile ?? undefined)
      if (result.suggestions.length === 0) {
        setCheckStatus('no_errors')
        return
      }
      setSuggestions(result.suggestions)
      applySuggestionDecorations(view, result.suggestions)
      setCheckStatus('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setCheckStatus(msg.includes('llm_parse_failure') ? 'parse_error' : 'network_error')
    }
  }, [editorContent, currentFile, checkStatus])

  const handleApprove = useCallback((s: ErrorSuggestion) => {
    const view = viewRef.current
    if (!view) return
    approveSuggestion(view, s)
    setSuggestions(prev => {
      const next = prev.filter(x => x.id !== s.id)
      if (next.length === 0) setCheckStatus('idle')
      return next
    })
  }, [])

  const handleReject = useCallback((id: string) => {
    const view = viewRef.current
    if (!view) return
    rejectSuggestion(view, id)
    setSuggestions(prev => {
      const next = prev.filter(x => x.id !== id)
      if (next.length === 0) setCheckStatus('idle')
      return next
    })
  }, [])

  const handleClosePanel = useCallback(() => {
    const view = viewRef.current
    if (view) view.dispatch({ effects: clearAllSuggestionsEffect.of(null) })
    setSuggestions([])
    setCheckStatus('idle')
  }, [])

  const handleWriteOpen = useCallback(() => {
    const view = viewRef.current
    if (view && suggestions.length > 0) {
      view.dispatch({ effects: clearAllSuggestionsEffect.of(null) })
      setSuggestions([])
      setCheckStatus('idle')
    }
    setWriteOpen(true)
  }, [suggestions])

  const handleWriteAssist = useCallback(async () => {
    const view = viewRef.current
    if (!view || writeStatus === 'loading' || !writePrompt.trim()) return
    setWriteStatus('loading')
    setWriteSuggestions([])
    view.dispatch({ effects: clearAllSuggestionsEffect.of(null) })
    setSuggestions([])
    setCheckStatus('idle')
    try {
      const result = await writingAssist(editorContent, writePrompt, currentFile ?? undefined)
      if (result.suggestions.length === 0) {
        setWriteStatus('no_errors')
        return
      }
      setWriteSuggestions(result.suggestions)
      applySuggestionDecorations(view, result.suggestions)
      setWriteStatus('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setWriteStatus(msg.includes('llm_parse_failure') ? 'parse_error' : 'network_error')
    }
  }, [editorContent, currentFile, writeStatus, writePrompt])

  const handleWriteApprove = useCallback((s: ErrorSuggestion) => {
    const view = viewRef.current
    if (!view) return
    approveSuggestion(view, s)
    setWriteSuggestions(prev => {
      const next = prev.filter(x => x.id !== s.id)
      if (next.length === 0) setWriteStatus('idle')
      return next
    })
  }, [])

  const handleWriteReject = useCallback((id: string) => {
    const view = viewRef.current
    if (!view) return
    rejectSuggestion(view, id)
    setWriteSuggestions(prev => {
      const next = prev.filter(x => x.id !== id)
      if (next.length === 0) setWriteStatus('idle')
      return next
    })
  }, [])

  const handleWriteClose = useCallback(() => {
    const view = viewRef.current
    if (view) view.dispatch({ effects: clearAllSuggestionsEffect.of(null) })
    setWriteSuggestions([])
    setWriteStatus('idle')
    setWriteOpen(false)
    // Comments are persistent — do NOT clear commentField on panel close
  }, [])

  const handleModeChange = useCallback((mode: 'edit' | 'comment') => {
    setAssistMode(mode)
    if (mode === 'comment') setWriteStatus('idle')
    else setCommentStatus('idle')
  }, [])

  const handleCommentAssist = useCallback(async () => {
    if (!currentProject || !currentFile) return
    const view = viewRef.current
    if (!view || commentStatus === 'loading' || !commentPrompt.trim()) return
    setCommentStatus('loading')
    try {
      const result = await commentAssist(editorContent, commentPrompt, currentProject, currentFile)
      if (result.comments.length === 0) {
        setCommentStatus('no_errors')
        return
      }
      const newTexts = new Set(result.comments.map(c => c.anchored_text))
      const merged = [
        ...allComments.filter(c => !newTexts.has(c.anchored_text)),
        ...result.comments,
      ]
      setAllComments(merged)
      applyCommentDecorations(view, merged)
      setCommentStatus('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setCommentStatus(msg.includes('llm_parse_failure') ? 'parse_error' : 'network_error')
    }
  }, [editorContent, currentFile, currentProject, commentStatus, commentPrompt, allComments])

  const handleCommentResolve = useCallback(async (id: string) => {
    if (!currentProject || !currentFile) return
    await updateComment(currentProject, currentFile, id, 'resolved').catch(() => {})
    setAllComments(prev => prev.map(c => c.id === id ? { ...c, status: 'resolved' as const } : c))
    const view = viewRef.current
    if (view) removeCommentDecoration(view, id)
  }, [currentProject, currentFile])

  const handleCommentDismiss = useCallback(async (id: string) => {
    if (!currentProject || !currentFile) return
    await updateComment(currentProject, currentFile, id, 'dismissed').catch(() => {})
    setAllComments(prev => prev.map(c => c.id === id ? { ...c, status: 'dismissed' as const } : c))
    const view = viewRef.current
    if (view) removeCommentDecoration(view, id)
  }, [currentProject, currentFile])

  const handleCommentDelete = useCallback(async (id: string) => {
    if (!currentProject || !currentFile) return
    await deleteComment(currentProject, currentFile, id).catch(() => {})
    setAllComments(prev => prev.filter(c => c.id !== id))
    const view = viewRef.current
    if (view) removeCommentDecoration(view, id)
  }, [currentProject, currentFile])

  return (
    <div className="relative h-full min-w-0 overflow-x-hidden flex flex-col bg-[#0d0f12]">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 h-10 bg-surface-800 border-b border-surface-700 shrink-0">
        <span className="text-xs text-slate-500 font-mono truncate max-w-[140px]">
          {currentFile ?? 'no file open'}
        </span>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {/* AI Assistant */}
          <IconButton title="AI Assistant" onClick={() => setChatOpen(!isChatOpen)}>
            <Bot size={13} className={isChatOpen ? 'text-indigo-400' : ''} />
          </IconButton>
          {/* Check for Errors */}
          <span className="relative">
            <IconButton title="Check for Errors" onClick={handleCheckErrors}>
              {checkStatus === 'loading'
                ? <Loader2 size={13} className="animate-spin text-amber-400" />
                : <AlertCircle size={13} className={suggestions.length > 0 ? 'text-amber-400' : ''} />
              }
            </IconButton>
            {suggestions.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500
                text-white text-[8px] flex items-center justify-center font-bold pointer-events-none">
                {suggestions.length}
              </span>
            )}
          </span>
          {/* Writing Assistant */}
          {WRITING_ASSISTANT_ENABLED && (
          <span className="relative">
            <IconButton title="Writing Assistant" onClick={handleWriteOpen}>
              <PenLine size={13} className={writeOpen ? 'text-indigo-400' : ''} />
            </IconButton>
            {writeSuggestions.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-indigo-500
                text-white text-[8px] flex items-center justify-center font-bold pointer-events-none">
                {writeSuggestions.length}
              </span>
            )}
            {writeSuggestions.length === 0 && allComments.filter(c => c.status === 'active').length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-yellow-500
                text-white text-[8px] flex items-center justify-center font-bold pointer-events-none">
                {allComments.filter(c => c.status === 'active').length}
              </span>
            )}
          </span>
          )}
          {/* Document Statistics */}
          <IconButton title="Document Statistics" onClick={() => setShowStats(true)}>
            <BarChart2 size={13} />
          </IconButton>
          <div className="w-px h-4 bg-surface-600 mx-0.5" />
          {/* Undo / Redo */}
          <IconButton title="Undo" onClick={handleUndo}><Undo2 size={13} /></IconButton>
          <IconButton title="Redo" onClick={handleRedo}><Redo2 size={13} /></IconButton>
          <IconButton title="Search / Replace (Ctrl+F)" onClick={handleSearch}><Search size={13} /></IconButton>

          <div className="w-px h-4 bg-surface-600 mx-0.5" />

          {/* Three-dot overflow menu */}
          <div className="relative" ref={menuRef}>
            <IconButton title="More actions" onClick={() => setMenuOpen(o => !o)}>
              <MoreHorizontal size={13} className={menuOpen ? 'text-slate-200' : ''} />
            </IconButton>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 rounded bg-surface-800 border border-surface-600 shadow-lg z-50 py-1">
                <button
                  onClick={() => { handleCopyAll(); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-700 hover:text-white transition-colors"
                >
                  <Copy size={12} />
                  Copy All
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Snippet bar (horizontally scrollable) ────────────────────────── */}
      <div className="flex gap-1 px-2 py-1.5 bg-surface-800 border-b border-surface-700 overflow-x-auto shrink-0 scrollbar-none">
        {SNIPPETS.map((s) => (
          <button
            key={s.label}
            onClick={() => insertSnippet(s.text)}
            className="shrink-0 px-2 py-0.5 rounded bg-surface-700 hover:bg-indigo-900/50
              text-slate-400 hover:text-slate-200 text-xs font-mono transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Document Statistics Modal ────────────────────────────────────── */}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}

      {/* ── AI Chat Window ───────────────────────────────────────────────── */}
      {isChatOpen && <ChatWindow onClose={() => setChatOpen(false)} />}

      {/* ── Error suggestion panel ───────────────────────────────────────── */}
      <ErrorSuggestionPanel
        status={checkStatus}
        suggestions={suggestions}
        onApprove={handleApprove}
        onReject={handleReject}
        onClose={handleClosePanel}
        onRetry={handleCheckErrors}
      />

      {/* ── Writing assistant panel ─────────────────────────────────────── */}
      {WRITING_ASSISTANT_ENABLED && <WritingAssistPanel
        isOpen={writeOpen}
        mode={assistMode}
        onModeChange={handleModeChange}
        status={writeStatus}
        suggestions={writeSuggestions}
        prompt={writePrompt}
        onPromptChange={setWritePrompt}
        onSubmit={handleWriteAssist}
        onApprove={handleWriteApprove}
        onReject={handleWriteReject}
        onClose={handleWriteClose}
        onRetry={handleWriteAssist}
        commentStatus={commentStatus}
        allComments={allComments}
        commentPrompt={commentPrompt}
        onCommentPromptChange={setCommentPrompt}
        onCommentSubmit={handleCommentAssist}
        onCommentResolve={handleCommentResolve}
        onCommentDismiss={handleCommentDismiss}
        onCommentDelete={handleCommentDelete}
        focusedCommentId={focusedCommentId}
        onFocusedCommentClear={() => setFocusedCommentId(null)}
      />}

      {/* ── CodeMirror mount point ────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden editor-touch-container"
        style={{ touchAction: 'pan-y' }}
        onClick={(e) => {
          if (!WRITING_ASSISTANT_ENABLED) return
          const anchor = (e.target as HTMLElement).closest('.cm-comment-anchor') as HTMLElement | null
          if (!anchor) return
          const commentId = anchor.getAttribute('data-comment-id')
          if (!commentId) return
          setWriteOpen(true)
          setAssistMode('comment')
          setFocusedCommentId(commentId)
        }}
      />
    </div>
  )
}

// ── Small toolbar button helpers ─────────────────────────────────────────────

function IconButton({
  title, onClick, children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors"
    >
      {children}
    </button>
  )
}
