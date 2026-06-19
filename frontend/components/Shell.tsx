'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { AppProvider, useApp, type Pane } from '@/lib/AppContext'
import * as api from '@/lib/api'
import { AuthStore } from '@/lib/auth'
import type { UserInfo } from '@/lib/api'
import { FolderOpen, FileText, BookOpen, Loader2, Save, Menu, Settings, RefreshCw, SlidersHorizontal, LogOut } from 'lucide-react'
import SettingsModal from './SettingsModal'
import ProjectSettingsModal from './ProjectSettingsModal'
import LoginScreen from './LoginScreen'
import type { LatexCompiler } from '@/lib/types'

const AUTO_COMPILE_KEY = 'texmobile:autoCompile'

function getAutoCompileSettings(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(AUTO_COMPILE_KEY) ?? '{}') } catch { return {} }
}

function setAutoCompileSetting(fileKey: string, enabled: boolean) {
  const settings = getAutoCompileSettings()
  settings[fileKey] = enabled
  localStorage.setItem(AUTO_COMPILE_KEY, JSON.stringify(settings))
}

// CodeMirror and file-system APIs are browser-only; disable SSR for all panes.
const EditorPane = dynamic(() => import('./EditorPane'), { ssr: false })
const PdfPane    = dynamic(() => import('./PdfPane'),    { ssr: false })
const FilesPane  = dynamic(() => import('./FilesPane'),  { ssr: false })

interface ShellInnerProps {
  multiUserMode: boolean
  currentUser: UserInfo | null
  onLogout: () => void
}

function ShellInner({ multiUserMode, currentUser, onLogout }: ShellInnerProps) {
  const {
    activePane, setActivePane,
    setCurrentProject, setCurrentFile,
    setEditorContent, setSavedContent, setPdfUrl,
    isFilesPaneCollapsed, isPdfPaneCollapsed,
    setProjectCompiler, setGlobalDefaultCompiler,
  } = useApp()

  const filesCol = isFilesPaneCollapsed ? '32px' : '260px'
  const pdfCol   = isPdfPaneCollapsed   ? '32px' : 'minmax(0,1fr)'

  // On mount: load global default compiler and reopen the last file.
  useEffect(() => {
    api.getLlmConfig().then(cfg => {
      setGlobalDefaultCompiler((cfg.default_compiler || 'pdflatex') as LatexCompiler)
    }).catch(() => { /* non-fatal */ })

    const saved = localStorage.getItem('texmobile:lastFile')
    if (!saved) return
    let parsed: { project: string; file: string }
    try { parsed = JSON.parse(saved) } catch { return }
    const { project, file } = parsed
    ;(async () => {
      try {
        const { content } = await api.readFile(project, file)
        setCurrentProject(project)
        setCurrentFile(file)
        setEditorContent(content)
        setSavedContent(content)
        api.getProjectConfig(project).then(cfg => {
          setProjectCompiler((cfg.compiler || 'pdflatex') as LatexCompiler)
        }).catch(() => { /* non-fatal */ })
        if (file.endsWith('.tex')) {
          const pdfName = file.split('/').pop()!.replace(/\.tex$/, '.pdf')
          try {
            const files = await api.listFiles(project)
            if (files.some(f => f.type === 'file' && f.path === pdfName)) {
              const blob = await api.fetchRawFile(project, pdfName)
              setPdfUrl(URL.createObjectURL(blob))
            }
          } catch { /* non-fatal */ }
        }
      } catch { /* file may have been deleted since last session */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col h-dvh bg-surface-900">
      <TopBar multiUserMode={multiUserMode} currentUser={currentUser} onLogout={onLogout} />

      {/* Mobile: single active pane */}
      <div className="flex-1 overflow-hidden md:hidden">
        {activePane === 'files'  && <FilesPane />}
        {activePane === 'editor' && <EditorPane />}
        {activePane === 'pdf'    && <PdfPane />}
      </div>

      {/* Desktop: three-column layout — Files | Editor | PDF */}
      <div
        className="hidden md:grid md:grid-rows-1 flex-1 overflow-hidden divide-x divide-surface-700"
        style={{ gridTemplateColumns: `${filesCol} minmax(0,1fr) ${pdfCol}` }}
      >
        <FilesPane />
        <EditorPane />
        <PdfPane />
      </div>

      <BottomNav activePane={activePane} onSelect={setActivePane} />
    </div>
  )
}

// ── Top bar ────────────────────────────────────────────────────────────────

interface HamburgerMenuProps {
  multiUserMode: boolean
  currentUser: UserInfo | null
  onLogout: () => void
}

function HamburgerMenu({ multiUserMode, currentUser, onLogout }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors"
          title="Menu"
        >
          <Menu size={16} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 bg-surface-800 border border-surface-600
              rounded-lg shadow-xl py-1 min-w-[160px]">
              <button
                onClick={() => { setOpen(false); setShowSettings(true) }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-slate-300
                  hover:bg-surface-600 hover:text-slate-100 transition-colors"
              >
                <Settings size={13} className="text-slate-500" />
                Settings
              </button>

              {multiUserMode && currentUser && (
                <>
                  <div className="mx-3 my-1 border-t border-surface-600" />
                  <div className="px-3 py-1.5">
                    <p className="text-[10px] text-slate-600 truncate">{currentUser.email}</p>
                    {currentUser.is_demo && (
                      <p className="text-[10px] text-amber-600">Demo account</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setOpen(false); onLogout() }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-slate-300
                      hover:bg-surface-600 hover:text-slate-100 transition-colors"
                  >
                    <LogOut size={13} className="text-slate-500" />
                    Sign out
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  )
}

function ProjectSettingsButton() {
  const { currentProject } = useApp()
  const [showModal, setShowModal] = useState(false)

  if (!currentProject) return null

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        title="Project settings"
        className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors"
      >
        <SlidersHorizontal size={14} />
      </button>
      {showModal && (
        <ProjectSettingsModal project={currentProject} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}

interface TopBarProps {
  multiUserMode: boolean
  currentUser: UserInfo | null
  onLogout: () => void
}

function TopBar({ multiUserMode, currentUser, onLogout }: TopBarProps) {
  const { currentProject, currentFile } = useApp()

  return (
    <header className="flex items-center justify-between px-3 h-11
      bg-surface-800 border-b border-surface-700 shrink-0 select-none"
    >
      <div className="flex items-center gap-2 shrink-0">
        <HamburgerMenu multiUserMode={multiUserMode} currentUser={currentUser} onLogout={onLogout} />
        <span className="font-mono font-bold text-sm tracking-widest">
          <span className="text-indigo-400">TEX</span>
          <span className="text-slate-300">MOBILE</span>
        </span>
      </div>

      <span className="hidden sm:block text-xs text-slate-500 truncate max-w-[220px] mx-4">
        {currentProject
          ? <>
              <span className="text-slate-400">{currentProject}</span>
              {currentFile && <span className="text-slate-600"> / {currentFile}</span>}
            </>
          : 'No project open'}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        <SaveButton />
        <ProjectSettingsButton />
        <CompileButton />
      </div>
    </header>
  )
}

// ── Save button (autosave + manual save + status indicator) ───────────────

function SaveButton() {
  const {
    currentProject, currentFile,
    editorContent, savedContent, setSavedContent,
  } = useApp()

  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [agoText, setAgoText] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDirty = editorContent !== savedContent

  const handleSave = async () => {
    if (!currentProject || !currentFile) return
    setIsSaving(true)
    try {
      await api.updateFile(currentProject, currentFile, editorContent)
      setSavedContent(editorContent)
      setLastSavedAt(new Date())
    } finally {
      setIsSaving(false)
    }
  }

  // Keep the "saved X ago" label fresh.
  useEffect(() => {
    if (!lastSavedAt) return
    const update = () => {
      const secs = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000)
      if (secs < 60)       setAgoText(`${secs}s ago`)
      else if (secs < 3600) setAgoText(`${Math.floor(secs / 60)}m ago`)
      else                  setAgoText(`${Math.floor(secs / 3600)}h ago`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [lastSavedAt])

  // Autosave: 2 s after the last change while a file is open.
  useEffect(() => {
    if (!currentProject || !currentFile || !isDirty) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { handleSave() }, 2000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorContent, currentProject, currentFile])

  const disabled = !currentProject || !currentFile || isSaving

  return (
    <div className="flex items-center gap-2">
      {/* Status indicator */}
      {currentFile && (
        <span className="hidden sm:block text-xs">
          {isSaving
            ? <span className="text-slate-500 flex items-center gap-1"><Loader2 size={11} className="animate-spin" />Saving…</span>
            : isDirty
              ? <span className="text-amber-600/80">Unsaved</span>
              : lastSavedAt
                ? <span className="text-slate-600">saved {agoText}</span>
                : null
          }
        </span>
      )}
      <button
        onClick={handleSave}
        disabled={disabled || !isDirty}
        title="Save (autosaves after 2 s of inactivity)"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold
          transition-colors
          ${disabled || !isDirty
            ? 'bg-surface-700 text-slate-500 cursor-not-allowed'
            : 'bg-surface-600 hover:bg-surface-500 active:bg-surface-700 text-slate-200'}`}
      >
        <Save size={12} />
        <span className="hidden sm:inline">Save</span>
      </button>
    </div>
  )
}

// ── Compile button (owns the full compile pipeline) ────────────────────────

function CompileButton() {
  const {
    isCompiling, setIsCompiling,
    currentProject, currentFile,
    editorContent, setSavedContent,
    pdfUrl, setPdfUrl,
    setCompileErrors,
    setActivePane,
    projectCompiler,
  } = useApp()

  const disabled = !currentProject || !currentFile || isCompiling

  const [autoCompileEnabled, setAutoCompileEnabled] = useState(false)
  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load per-document setting when the open file changes.
  useEffect(() => {
    if (!currentProject || !currentFile) { setAutoCompileEnabled(false); return }
    const fileKey = `${currentProject}/${currentFile}`
    setAutoCompileEnabled(getAutoCompileSettings()[fileKey] ?? false)
  }, [currentProject, currentFile])

  // Auto-compile: 4 s after last edit (gives autosave's 2 s a head start).
  useEffect(() => {
    if (!autoCompileEnabled || !currentProject || !currentFile || isCompiling) return
    if (!currentFile.endsWith('.tex')) return
    if (compileTimerRef.current) clearTimeout(compileTimerRef.current)
    compileTimerRef.current = setTimeout(() => {
      if (!isCompiling) handleCompile()
    }, 4000)
    return () => { if (compileTimerRef.current) clearTimeout(compileTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorContent, autoCompileEnabled, currentProject, currentFile])

  const handleToggleAutoCompile = () => {
    if (!currentProject || !currentFile) return
    const next = !autoCompileEnabled
    setAutoCompileEnabled(next)
    setAutoCompileSetting(`${currentProject}/${currentFile}`, next)
  }

  const handleCompile = async () => {
    if (!currentProject || !currentFile) return
    setIsCompiling(true)
    setCompileErrors([])

    try {
      // Persist the current editor state before compiling.
      await api.updateFile(currentProject, currentFile, editorContent)
      setSavedContent(editorContent)

      const result = await api.compile(currentProject, currentFile, projectCompiler)

      if (result.ok) {
        // Release the previous PDF blob URL to avoid memory leaks.
        if (pdfUrl) URL.revokeObjectURL(pdfUrl)
        setPdfUrl(URL.createObjectURL(result.pdfBlob))
        setActivePane('pdf')
      } else {
        setCompileErrors(result.errors)
        setActivePane('pdf')
      }
    } catch (e) {
      setCompileErrors([{ line: null, message: String(e) }])
      setActivePane('pdf')
    } finally {
      setIsCompiling(false)
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {currentFile?.endsWith('.tex') && (
        <button
          onClick={handleToggleAutoCompile}
          disabled={!currentProject || !currentFile}
          title={autoCompileEnabled ? 'Auto-compile on (click to disable)' : 'Auto-compile off (click to enable)'}
          className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors
            ${!currentProject || !currentFile
              ? 'text-slate-600 cursor-not-allowed'
              : autoCompileEnabled
                ? 'text-indigo-400 hover:bg-surface-600'
                : 'text-slate-500 hover:text-slate-300 hover:bg-surface-600'}`}
        >
          <RefreshCw size={12} className={autoCompileEnabled ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Auto</span>
        </button>
      )}
      <button
        onClick={handleCompile}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold
          transition-colors shrink-0
          ${disabled
            ? 'bg-surface-700 text-slate-500 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white'}`}
      >
        {isCompiling
          ? <><Loader2 size={13} className="animate-spin" /> Compiling…</>
          : 'Compile'}
      </button>
    </div>
  )
}

// ── Mobile bottom navigation ───────────────────────────────────────────────

const TABS: {
  id: Pane
  label: string
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
}[] = [
  { id: 'files',  label: 'Files',  Icon: FolderOpen },
  { id: 'editor', label: 'Editor', Icon: FileText   },
  { id: 'pdf',    label: 'PDF',    Icon: BookOpen   },
]

function BottomNav({
  activePane, onSelect,
}: { activePane: Pane; onSelect: (p: Pane) => void }) {
  return (
    <nav
      className="md:hidden flex shrink-0 h-14 bg-surface-800 border-t border-surface-700"
      style={{ touchAction: 'none' }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = activePane === id
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`relative flex-1 flex flex-col items-center justify-center
              gap-0.5 text-[10px] font-medium transition-colors duration-150
              focus-visible:outline-none
              ${active ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Icon size={22} strokeWidth={active ? 2.2 : 1.7} />
            <span>{label}</span>
            {active && (
              <span className="absolute bottom-0 w-10 h-0.5 bg-indigo-400 rounded-t-full" />
            )}
          </button>
        )
      })}
    </nav>
  )
}

// ── Root export: auth gate + provider ─────────────────────────────────────

type AuthStatus = 'loading' | 'login' | 'authenticated'

export default function Shell() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [multiUserMode, setMultiUserMode] = useState(false)
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null)

  useEffect(() => {
    api.getInfo().then(info => {
      setMultiUserMode(info.multi_user_mode)
      if (!info.multi_user_mode) {
        setAuthStatus('authenticated')
        return
      }
      const token = AuthStore.getToken()
      if (!token) {
        setAuthStatus('login')
        return
      }
      api.getMe().then(user => {
        setCurrentUser(user)
        setAuthStatus('authenticated')
      }).catch(() => {
        AuthStore.clearToken()
        setAuthStatus('login')
      })
    }).catch(() => {
      // If /api/info fails, fall back to single-user (unauthenticated access).
      setAuthStatus('authenticated')
    })

    const handleUnauthorized = () => {
      AuthStore.clearToken()
      setCurrentUser(null)
      setAuthStatus('login')
    }
    window.addEventListener('texmobile:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('texmobile:unauthorized', handleUnauthorized)
  }, [])

  const handleLogin = (user: UserInfo, _token: string) => {
    setCurrentUser(user)
    setAuthStatus('authenticated')
  }

  const handleLogout = () => {
    AuthStore.clearToken()
    setCurrentUser(null)
    setAuthStatus('login')
  }

  if (authStatus === 'loading') {
    return (
      <div className="min-h-dvh bg-surface-900 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-600" />
      </div>
    )
  }

  if (authStatus === 'login') {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <AppProvider>
      <ShellInner
        multiUserMode={multiUserMode}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    </AppProvider>
  )
}
