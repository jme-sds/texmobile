'use client'

import { X, BarChart2 } from 'lucide-react'
import { useApp } from '@/lib/AppContext'
import { computeStats, fleschReadingLabel } from '@/lib/latexStats'

interface Props {
  onClose: () => void
}

export default function StatsModal({ onClose }: Props) {
  const { savedContent, currentFile } = useApp()
  const stats = savedContent ? computeStats(savedContent) : null

  const fmt = (n: number, decimals = 0) =>
    n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  const fmtTime = (minutes: number) => {
    if (minutes < 1) return '< 1 min'
    const m = Math.round(minutes)
    return m === 1 ? '1 min' : `${m} mins`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-800 border border-surface-600 rounded-lg shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <BarChart2 size={14} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-200">Document Statistics</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {!currentFile ? (
            <p className="text-sm text-slate-500 text-center py-6">No document is currently open.</p>
          ) : !stats ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No saved content to analyse. Save the document first.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Content section */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Content</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <StatRow label="Characters (with spaces)" value={fmt(stats.charsWithSpaces)} />
                  <StatRow label="Characters (no spaces)" value={fmt(stats.charsWithoutSpaces)} />
                  <StatRow label="Words" value={fmt(stats.words)} />
                  <StatRow label="Sentences" value={fmt(stats.sentences)} />
                  <StatRow label="Paragraphs" value={fmt(stats.paragraphs)} />
                  <StatRow label="Syllables" value={fmt(stats.syllables)} />
                </div>
              </div>

              <div className="border-t border-surface-700" />

              {/* Readability section */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Readability</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <StatRow label="Avg words / sentence" value={fmt(stats.avgWordsPerSentence, 1)} />
                  <StatRow label="Avg words / paragraph" value={fmt(stats.avgWordsPerParagraph, 1)} />
                  <StatRow
                    label="Flesch Reading Ease"
                    value={fmt(stats.fleschReadingEase, 1)}
                    badge={fleschReadingLabel(stats.fleschReadingEase)}
                    badgeColor={fleschBadgeColor(stats.fleschReadingEase)}
                  />
                  <StatRow
                    label="Flesch-Kincaid Grade"
                    value={fmt(stats.fleschKincaidGradeLevel, 1)}
                  />
                  <StatRow label="Est. reading time" value={fmtTime(stats.readingTimeMinutes)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-surface-700">
          <p className="text-[10px] text-slate-600 italic">
            Based on last saved version · LaTeX markup excluded
          </p>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200
              hover:bg-surface-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function StatRow({
  label,
  value,
  badge,
  badgeColor,
}: {
  label: string
  value: string
  badge?: string
  badgeColor?: string
}) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-surface-700/50">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono text-slate-200">{value}</span>
        {badge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}

function fleschBadgeColor(score: number): string {
  if (score >= 70) return 'bg-emerald-900/50 text-emerald-400'
  if (score >= 50) return 'bg-amber-900/50 text-amber-400'
  return 'bg-red-900/50 text-red-400'
}
