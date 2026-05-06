'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, AlertCircle, RefreshCw, Check, Sparkles, PenLine, CheckCircle2, Trash2, EyeOff } from 'lucide-react'
import type { CheckErrorsStatus, ErrorSuggestion, DocumentComment } from '@/lib/types'

interface Props {
  isOpen: boolean
  mode: 'edit' | 'comment'
  onModeChange: (mode: 'edit' | 'comment') => void
  // Edit mode
  status: CheckErrorsStatus
  suggestions: ErrorSuggestion[]
  prompt: string
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onApprove: (s: ErrorSuggestion) => void
  onReject: (id: string) => void
  onClose: () => void
  onRetry: () => void
  // Comment mode
  commentStatus: CheckErrorsStatus
  allComments: DocumentComment[]
  commentPrompt: string
  onCommentPromptChange: (value: string) => void
  onCommentSubmit: () => void
  onCommentResolve: (id: string) => void
  onCommentDismiss: (id: string) => void
  onCommentDelete: (id: string) => void
  focusedCommentId?: string | null
  onFocusedCommentClear?: () => void
}

export default function WritingAssistPanel({
  isOpen,
  mode,
  onModeChange,
  status,
  suggestions,
  prompt,
  onPromptChange,
  onSubmit,
  onApprove,
  onReject,
  onClose,
  onRetry,
  commentStatus,
  allComments,
  commentPrompt,
  onCommentPromptChange,
  onCommentSubmit,
  onCommentResolve,
  onCommentDismiss,
  onCommentDelete,
  focusedCommentId,
  onFocusedCommentClear,
}: Props) {
  const [activeTab, setActiveTab] = useState<'active' | 'dismissed' | 'resolved'>('active')
  const scrollableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusedCommentId) return
    setActiveTab('active')
    const el = document.getElementById(`comment-${focusedCommentId}`)
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      el.classList.add('comment-focused')
      const timer = setTimeout(() => {
        el.classList.remove('comment-focused')
        onFocusedCommentClear?.()
      }, 1500)
      return () => clearTimeout(timer)
    }
    onFocusedCommentClear?.()
  }, [focusedCommentId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  const activeCount = allComments.filter(c => c.status === 'active').length

  return (
    <div className="
      fixed bottom-0 left-0 right-0 z-40
      md:relative md:bottom-auto md:left-auto md:right-auto md:z-auto
      bg-[#0d1117] border-t border-surface-700
      max-h-[50vh] md:max-h-[60vh]
      flex flex-col
      shadow-[0_-4px_24px_rgba(0,0,0,0.5)] md:shadow-none
    ">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-800 border-b border-surface-700 shrink-0">
        <PenLine size={13} className="text-indigo-400 shrink-0" />
        <span className="text-xs text-slate-400 font-medium">Writing Assistant</span>

        {/* Mode toggle */}
        <div className="flex items-center gap-0.5 ml-1">
          {(['edit', 'comment'] as const).map(m => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                mode === m
                  ? 'bg-indigo-700/70 text-indigo-200'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {m === 'edit' ? 'Edits' : 'Comments'}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Badge */}
        {mode === 'edit' && status === 'done' && suggestions.length > 0 && (
          <span className="text-xs text-slate-500">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
          </span>
        )}
        {mode === 'comment' && activeCount > 0 && (
          <span className="text-xs text-slate-500">
            {activeCount} active
          </span>
        )}

        <button
          onClick={onClose}
          className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-surface-700 transition-colors shrink-0"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>

      {mode === 'edit' ? (
        <>
          {/* Edit mode: prompt input */}
          <div className="px-3 py-2 border-b border-surface-700 shrink-0">
            <textarea
              value={prompt}
              onChange={e => onPromptChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  onSubmit()
                }
              }}
              placeholder='e.g. "Improve the flow of transitions between paragraphs"'
              className="w-full bg-[#0d0f12] border border-surface-600 rounded text-xs
                text-slate-300 placeholder-slate-600 resize-none focus:outline-none
                focus:border-indigo-500 px-2 py-1.5 font-mono leading-relaxed"
              rows={2}
              disabled={status === 'loading'}
            />
            <button
              onClick={onSubmit}
              disabled={!prompt.trim() || status === 'loading'}
              className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1 rounded text-xs
                bg-indigo-700/70 hover:bg-indigo-600/80 text-indigo-200
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'loading'
                ? <><Loader2 size={11} className="animate-spin" /> Analyzing…</>
                : <><Sparkles size={11} /> Analyze</>
              }
            </button>
          </div>

          {/* Edit mode: results */}
          {status === 'no_errors' && (
            <div className="flex items-center justify-center gap-2 py-3">
              <CheckCircle2 size={14} className="text-green-400" />
              <span className="text-xs text-slate-500">No suggestions for this instruction.</span>
            </div>
          )}

          {(status === 'parse_error' || status === 'network_error') && (
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <AlertCircle size={12} className="text-red-400 shrink-0" />
                {status === 'parse_error'
                  ? 'The AI returned an unexpected response.'
                  : 'Could not reach the LLM. Check settings.'}
              </span>
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
                  bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-slate-200
                  transition-colors shrink-0"
              >
                <RefreshCw size={10} />
                Retry
              </button>
            </div>
          )}

          {status === 'done' && suggestions.length > 0 && (
            <div className="flex-1 overflow-y-auto divide-y divide-surface-700">
              {suggestions.map(s => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onApprove={() => onApprove(s)}
                  onReject={() => onReject(s.id)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Comment mode: prompt input */}
          <div className="px-3 py-2 border-b border-surface-700 shrink-0">
            <textarea
              value={commentPrompt}
              onChange={e => onCommentPromptChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  onCommentSubmit()
                }
              }}
              placeholder='e.g. "Review the logical structure of my argument"'
              className="w-full bg-[#0d0f12] border border-surface-600 rounded text-xs
                text-slate-300 placeholder-slate-600 resize-none focus:outline-none
                focus:border-yellow-600 px-2 py-1.5 font-mono leading-relaxed"
              rows={2}
              disabled={commentStatus === 'loading'}
            />
            <button
              onClick={onCommentSubmit}
              disabled={!commentPrompt.trim() || commentStatus === 'loading'}
              className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1 rounded text-xs
                bg-yellow-800/60 hover:bg-yellow-700/70 text-yellow-200
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {commentStatus === 'loading'
                ? <><Loader2 size={11} className="animate-spin" /> Analyzing…</>
                : <><Sparkles size={11} /> Analyze</>
              }
            </button>
          </div>

          {/* Comment mode: status messages */}
          {commentStatus === 'no_errors' && (
            <div className="flex items-center justify-center gap-2 py-2 shrink-0">
              <CheckCircle2 size={14} className="text-green-400" />
              <span className="text-xs text-slate-500">No comments for this instruction.</span>
            </div>
          )}

          {(commentStatus === 'parse_error' || commentStatus === 'network_error') && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0">
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <AlertCircle size={12} className="text-red-400 shrink-0" />
                {commentStatus === 'parse_error'
                  ? 'The AI returned an unexpected response.'
                  : 'Could not reach the LLM. Check settings.'}
              </span>
              <button
                onClick={onCommentSubmit}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
                  bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-slate-200
                  transition-colors shrink-0"
              >
                <RefreshCw size={10} />
                Retry
              </button>
            </div>
          )}

          {/* Comment mode: tab bar + list */}
          {allComments.length > 0 && (
            <>
              <div className="flex border-b border-surface-700 shrink-0">
                {(['active', 'dismissed', 'resolved'] as const).map(tab => {
                  const count = allComments.filter(c => c.status === tab).length
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 text-xs capitalize transition-colors ${
                        activeTab === tab
                          ? 'text-slate-200 border-b-2 border-indigo-500 -mb-px'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {tab}{count > 0 ? ` (${count})` : ''}
                    </button>
                  )
                })}
              </div>
              <div ref={scrollableRef} className="flex-1 overflow-y-auto divide-y divide-surface-700">
                {allComments
                  .filter(c => c.status === activeTab)
                  .map(c => (
                    <CommentCard
                      key={c.id}
                      comment={c}
                      onResolve={() => onCommentResolve(c.id)}
                      onDismiss={() => onCommentDismiss(c.id)}
                      onDelete={() => onCommentDelete(c.id)}
                    />
                  ))
                }
                {allComments.filter(c => c.status === activeTab).length === 0 && (
                  <div className="flex items-center justify-center py-4">
                    <span className="text-xs text-slate-600">No {activeTab} comments.</span>
                  </div>
                )}
              </div>
            </>
          )}

          {allComments.length === 0 && commentStatus === 'idle' && (
            <div className="flex items-center justify-center py-4">
              <span className="text-xs text-slate-600">Enter an instruction above to generate comments.</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SuggestionCard({
  suggestion,
  onApprove,
  onReject,
}: {
  suggestion: ErrorSuggestion
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className="px-3 py-2 flex flex-col gap-1.5">
      <p className="text-xs text-slate-400 truncate">{suggestion.description}</p>
      <div className="flex gap-2 flex-wrap sm:flex-nowrap">
        <code className="flex-1 min-w-0 px-2 py-1 rounded text-[11px] font-mono
          bg-red-950/40 border border-red-900/40 text-red-300
          overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {suggestion.original}
        </code>
        <code className="flex-1 min-w-0 px-2 py-1 rounded text-[11px] font-mono
          bg-green-950/40 border border-green-900/40 text-green-300
          overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {suggestion.replacement}
        </code>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onReject}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs
            bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-slate-200
            transition-colors"
        >
          <X size={10} />
          Dismiss
        </button>
        <button
          onClick={onApprove}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs
            bg-green-900/60 hover:bg-green-800/70 text-green-300 hover:text-green-100
            transition-colors"
        >
          <Check size={10} />
          Apply
        </button>
      </div>
    </div>
  )
}

function CommentCard({
  comment,
  onResolve,
  onDismiss,
  onDelete,
}: {
  comment: DocumentComment
  onResolve: () => void
  onDismiss: () => void
  onDelete: () => void
}) {
  return (
    <div id={`comment-${comment.id}`} className="px-3 py-2 flex flex-col gap-1.5 transition-colors duration-300">
      <code className="px-2 py-1 rounded text-[11px] font-mono
        bg-yellow-950/40 border border-yellow-900/40 text-yellow-300
        overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {comment.anchored_text}
      </code>
      <p className="text-xs text-slate-400 leading-relaxed">{comment.description}</p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs
            bg-surface-700 hover:bg-red-900/40 text-slate-500 hover:text-red-300
            transition-colors"
        >
          <Trash2 size={10} />
          Delete
        </button>
        {comment.status !== 'dismissed' && comment.status !== 'resolved' && (
          <button
            onClick={onDismiss}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs
              bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-slate-200
              transition-colors"
          >
            <EyeOff size={10} />
            Dismiss
          </button>
        )}
        {comment.status !== 'resolved' && (
          <button
            onClick={onResolve}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs
              bg-green-900/60 hover:bg-green-800/70 text-green-300 hover:text-green-100
              transition-colors"
          >
            <CheckCircle2 size={10} />
            Resolve
          </button>
        )}
      </div>
    </div>
  )
}
