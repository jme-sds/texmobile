'use client'

import { useState, useEffect } from 'react'
import { X, Save, Loader2, CheckCircle2 } from 'lucide-react'
import * as api from '@/lib/api'
import { COMPILER_OPTIONS, type LatexCompiler } from '@/lib/types'
import { useApp } from '@/lib/AppContext'
import { SelectField } from './SettingsModal'

interface Props {
  project: string
  onClose: () => void
}

export default function ProjectSettingsModal({ project, onClose }: Props) {
  const { setProjectCompiler } = useApp()
  const [compiler, setCompiler] = useState<string>('pdflatex')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getProjectConfig(project).then(cfg => {
      setCompiler(cfg.compiler || 'pdflatex')
    }).catch(() => {
      setError('Could not load project settings.')
    }).finally(() => setLoading(false))
  }, [project])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.saveProjectConfig(project, compiler)
      setProjectCompiler(compiler as LatexCompiler)
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const busy = saving || loading

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-800 border border-surface-600 rounded-lg shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Project Settings</h2>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{project}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin text-indigo-400" />
            </div>
          ) : (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">LaTeX Compiler</p>
              <SelectField
                label="Compiler Engine"
                hint="Overrides the global default for this project only"
                value={compiler}
                onChange={setCompiler}
                options={COMPILER_OPTIONS}
              />
            </>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2 border border-red-900/40">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-surface-700">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={13} /> Saved
            </span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200
              hover:bg-surface-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold transition-colors
              ${busy
                ? 'bg-surface-700 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
