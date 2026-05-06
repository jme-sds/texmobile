'use client'

import { CheckCircle2, X, Loader2, AlertCircle, RefreshCw, Check } from 'lucide-react'
import type { CheckErrorsStatus, ErrorSuggestion } from '@/lib/types'

interface Props {
  status: CheckErrorsStatus
  suggestions: ErrorSuggestion[]
  onApprove: (s: ErrorSuggestion) => void
  onReject: (id: string) => void
  onClose: () => void
  onRetry: () => void
}

export default function ErrorSuggestionPanel({
  status,
  suggestions,
  onApprove,
  onReject,
  onClose,
  onRetry,
}: Props) {
  if (status === 'idle') return null

  return (
    <div className="
      fixed bottom-0 left-0 right-0 z-40
      md:relative md:bottom-auto md:left-auto md:right-auto md:z-auto
      bg-[#0d1117] border-t border-surface-700
      max-h-[45vh] md:max-h-48
      flex flex-col
      shadow-[0_-4px_24px_rgba(0,0,0,0.5)] md:shadow-none
    ">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-800 border-b border-surface-700 shrink-0">
        {status === 'loading' && (
          <Loader2 size={13} className="text-amber-400 animate-spin shrink-0" />
        )}
        {status === 'done' && (
          <AlertCircle size={13} className="text-amber-400 shrink-0" />
        )}
        {status === 'no_errors' && (
          <CheckCircle2 size={13} className="text-green-400 shrink-0" />
        )}
        {(status === 'parse_error' || status === 'network_error') && (
          <AlertCircle size={13} className="text-red-400 shrink-0" />
        )}

        <span className="text-xs text-slate-400 flex-1 min-w-0">
          {status === 'loading' && 'Checking for errors…'}
          {status === 'done' && `${suggestions.length} error${suggestions.length !== 1 ? 's' : ''} found`}
          {status === 'no_errors' && 'No errors found'}
          {status === 'parse_error' && 'Could not parse LLM response'}
          {status === 'network_error' && 'Check failed — network or config error'}
        </span>

        {(status === 'parse_error' || status === 'network_error') && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
              bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-slate-200
              transition-colors shrink-0"
          >
            <RefreshCw size={10} />
            Retry
          </button>
        )}

        <button
          onClick={onClose}
          className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-surface-700 transition-colors shrink-0"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      {status === 'loading' && (
        <div className="flex-1 flex items-center justify-center py-4">
          <span className="text-xs text-slate-600">Analyzing document…</span>
        </div>
      )}

      {status === 'no_errors' && (
        <div className="flex-1 flex items-center justify-center gap-2 py-4">
          <CheckCircle2 size={16} className="text-green-500" />
          <span className="text-xs text-slate-500">Your document looks good.</span>
        </div>
      )}

      {(status === 'parse_error' || status === 'network_error') && (
        <div className="flex-1 flex items-center justify-center py-4 px-4">
          <span className="text-xs text-slate-500 text-center">
            {status === 'parse_error'
              ? 'The AI returned an unexpected response. Try again.'
              : 'Could not reach the LLM. Check your connection and settings.'}
          </span>
        </div>
      )}

      {status === 'done' && suggestions.length > 0 && (
        <div className="flex-1 overflow-y-auto divide-y divide-surface-700">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onApprove={() => onApprove(s)}
              onReject={() => onReject(s.id)}
            />
          ))}
        </div>
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
      {/* Description */}
      <p className="text-xs text-slate-400 truncate">{suggestion.description}</p>

      {/* Before / After */}
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

      {/* Actions */}
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
