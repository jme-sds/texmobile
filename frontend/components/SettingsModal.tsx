'use client'

import { useState, useEffect } from 'react'
import { X, Save, Loader2, CheckCircle2, Wifi, WifiOff } from 'lucide-react'
import * as api from '@/lib/api'
import { COMPILER_OPTIONS, type LatexCompiler } from '@/lib/types'
import { useApp } from '@/lib/AppContext'

interface Props {
  onClose: () => void
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

export default function SettingsModal({ onClose }: Props) {
  const { setGlobalDefaultCompiler } = useApp()
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [keyIsSet, setKeyIsSet] = useState(false)
  const [defaultCompiler, setDefaultCompiler] = useState<string>('pdflatex')
  const [demoMode, setDemoMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testState, setTestState] = useState<TestState>('idle')
  const [testMsg, setTestMsg] = useState('')

  useEffect(() => {
    api.getLlmConfig().then(cfg => {
      setEndpoint(cfg.api_endpoint)
      setModel(cfg.model_name)
      setKeyIsSet(cfg.api_key_set)
      setDefaultCompiler(cfg.default_compiler || 'pdflatex')
      setDemoMode(cfg.demo_mode ?? false)
    }).catch(() => {
      setError('Could not load settings.')
    }).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    setTestState('idle')
    try {
      await api.saveLlmConfig({
        api_endpoint: endpoint,
        ...(apiKey ? { api_key: apiKey } : {}),
        model_name: model,
        default_compiler: defaultCompiler,
      })
      setGlobalDefaultCompiler(defaultCompiler as LatexCompiler)
      setSaved(true)
      setApiKey('')
      setKeyIsSet(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTestState('testing')
    setTestMsg('')
    setError(null)
    try {
      const result = await api.testLlmConnection()
      setTestState('ok')
      setTestMsg(`Connected — model replied: "${result.response.slice(0, 60)}"`)
    } catch (e) {
      setTestState('fail')
      setTestMsg(e instanceof Error ? e.message : String(e))
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
          <h2 className="text-sm font-semibold text-slate-200">Settings</h2>
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
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">AI / LLM</p>

              {demoMode ? (
                <div className="space-y-3">
                  <p className="text-xs text-amber-400 bg-amber-900/20 rounded px-3 py-2 border border-amber-900/40">
                    Running in demo mode — LLM settings are configured server-side and cannot be changed here.
                  </p>
                  <ReadOnlyField label="API Endpoint" value={endpoint || '—'} />
                  <ReadOnlyField label="Model" value={model || '—'} />
                  <ReadOnlyField label="API Key" value={keyIsSet ? '••••••••  (configured)' : 'Not set'} />
                </div>
              ) : (
                <>
                  <Field
                    label="API Endpoint"
                    hint='Full base URL including version path, e.g. https://api.openai.com/v1'
                    value={endpoint}
                    onChange={v => { setEndpoint(v); setTestState('idle') }}
                    placeholder="https://api.openai.com/v1"
                  />
                  <Field
                    label="API Key"
                    hint={keyIsSet ? 'A key is already saved — leave blank to keep it' : 'Enter your API key'}
                    value={apiKey}
                    onChange={v => { setApiKey(v); setTestState('idle') }}
                    placeholder={keyIsSet ? '••••••••' : 'sk-...'}
                    type="password"
                  />
                  <Field
                    label="Model Name"
                    hint="e.g. gpt-4o, gpt-3.5-turbo"
                    value={model}
                    onChange={v => { setModel(v); setTestState('idle') }}
                    placeholder="gpt-4o"
                  />
                </>
              )}

              <hr className="border-surface-700" />

              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">LaTeX Compiler</p>
              <SelectField
                label="Default Compiler"
                hint="Used for all projects unless overridden in per-project settings"
                value={defaultCompiler}
                onChange={setDefaultCompiler}
                options={COMPILER_OPTIONS}
              />
            </>
          )}

          {/* Test connection result */}
          {testState === 'ok' && (
            <p className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-900/20 rounded px-3 py-2 border border-emerald-900/40">
              <Wifi size={13} className="shrink-0 mt-0.5" />
              {testMsg}
            </p>
          )}
          {testState === 'fail' && (
            <p className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 rounded px-3 py-2 border border-red-900/40">
              <WifiOff size={13} className="shrink-0 mt-0.5" />
              {testMsg}
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2 border border-red-900/40">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-surface-700">
          <button
            onClick={handleTest}
            disabled={busy || testState === 'testing'}
            title="Test the connection to your LLM provider"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
              ${busy || testState === 'testing'
                ? 'text-slate-600 cursor-not-allowed'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-600'}`}
          >
            {testState === 'testing'
              ? <Loader2 size={12} className="animate-spin" />
              : <Wifi size={12} />}
            Test Connection
          </button>

          <div className="flex items-center gap-3">
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
              {demoMode ? 'Close' : 'Cancel'}
            </button>
            {!demoMode && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-300">{label}</label>
      <p className="w-full bg-surface-700/50 text-slate-400 text-xs rounded px-3 py-2 border border-surface-600">
        {value}
      </p>
    </div>
  )
}

function Field({
  label, hint, value, onChange, placeholder, type = 'text',
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: 'text' | 'password'
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-300">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-700 text-slate-200 placeholder-slate-600 text-xs
          rounded px-3 py-2 border border-surface-600 focus:outline-none
          focus:border-indigo-600 transition-colors"
      />
      <p className="text-[10px] text-slate-600">{hint}</p>
    </div>
  )
}

export function SelectField({
  label, hint, value, onChange, options,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-300">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface-700 text-slate-200 text-xs rounded px-3 py-2
          border border-surface-600 focus:outline-none focus:border-indigo-600
          transition-colors"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <p className="text-[10px] text-slate-600">{hint}</p>
    </div>
  )
}
