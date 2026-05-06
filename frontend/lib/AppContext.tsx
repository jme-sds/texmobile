'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { CompileError, LatexCompiler } from './types'

export type Pane = 'editor' | 'pdf' | 'files'

export type { CompileError }

interface AppState {
  activePane: Pane
  setActivePane: (p: Pane) => void

  currentProject: string | null
  setCurrentProject: (p: string | null) => void
  currentFile: string | null
  setCurrentFile: (f: string | null) => void

  editorContent: string
  setEditorContent: (c: string) => void
  savedContent: string
  setSavedContent: (c: string) => void

  pdfUrl: string | null
  setPdfUrl: (u: string | null) => void
  compileErrors: CompileError[]
  setCompileErrors: (e: CompileError[]) => void
  isCompiling: boolean
  setIsCompiling: (v: boolean) => void

  isChatOpen: boolean
  setChatOpen: (v: boolean) => void

  isFilesPaneCollapsed: boolean
  setFilesPaneCollapsed: (v: boolean) => void
  isPdfPaneCollapsed: boolean
  setPdfPaneCollapsed: (v: boolean) => void

  projectCompiler: LatexCompiler
  setProjectCompiler: (c: LatexCompiler) => void
  globalDefaultCompiler: LatexCompiler
  setGlobalDefaultCompiler: (c: LatexCompiler) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [activePane, setActivePane] = useState<Pane>('editor')
  const [currentProject, setCurrentProject] = useState<string | null>(null)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compileErrors, setCompileErrors] = useState<CompileError[]>([])
  const [isCompiling, setIsCompiling] = useState(false)
  const [isChatOpen, setChatOpen] = useState(false)
  const [isFilesPaneCollapsed, setFilesPaneCollapsed] = useState(false)
  const [isPdfPaneCollapsed, setPdfPaneCollapsed] = useState(false)
  const [projectCompiler, setProjectCompiler] = useState<LatexCompiler>('pdflatex')
  const [globalDefaultCompiler, setGlobalDefaultCompiler] = useState<LatexCompiler>('pdflatex')

  return (
    <AppContext.Provider value={{
      activePane, setActivePane,
      currentProject, setCurrentProject,
      currentFile, setCurrentFile,
      editorContent, setEditorContent,
      savedContent, setSavedContent,
      pdfUrl, setPdfUrl,
      compileErrors, setCompileErrors,
      isCompiling, setIsCompiling,
      isChatOpen, setChatOpen,
      isFilesPaneCollapsed, setFilesPaneCollapsed,
      isPdfPaneCollapsed, setPdfPaneCollapsed,
      projectCompiler, setProjectCompiler,
      globalDefaultCompiler, setGlobalDefaultCompiler,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
