'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  FolderOpen, Folder, FilePlus2, FolderPlus, Trash2, Upload,
  ChevronRight, ChevronLeft, ChevronDown, FileText, ImageIcon, FileIcon,
  Loader2, RefreshCw, AlertCircle, FileArchive,
} from 'lucide-react'
import { useApp } from '@/lib/AppContext'
import * as api from '@/lib/api'
import type { FileEntry, LatexCompiler } from '@/lib/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function FileIcon2({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['tex', 'bib', 'cls', 'sty', 'dtx'].includes(ext))
    return <FileText size={13} className="text-blue-400 shrink-0" />
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext))
    return <ImageIcon size={13} className="text-emerald-400 shrink-0" />
  return <FileIcon size={13} className="text-slate-500 shrink-0" />
}

function shouldSkipFile(relativePath: string): boolean {
  return relativePath.split('/').some(p => p.startsWith('.') || p === '__MACOSX' || p === 'Thumbs.db')
}

// ── File tree builder ─────────────────────────────────────────────────────────

type TreeNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  children: TreeNode[]
}

function buildFileTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const dirMap = new Map<string, TreeNode>()

  const dirs = files
    .filter(f => f.type === 'directory' && !shouldSkipFile(f.path))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))

  for (const d of dirs) {
    const node: TreeNode = { name: d.name, path: d.path, type: 'directory', children: [] }
    dirMap.set(d.path, node)
    const parentPath = d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) : ''
    if (!parentPath) {
      root.push(node)
    } else {
      const parent = dirMap.get(parentPath)
      if (parent) parent.children.push(node)
      else root.push(node)
    }
  }

  for (const f of files) {
    if (f.type !== 'file' || shouldSkipFile(f.path)) continue
    const node: TreeNode = { name: f.name, path: f.path, type: 'file', children: [] }
    const parentPath = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
    if (!parentPath) {
      root.push(node)
    } else {
      const parent = dirMap.get(parentPath)
      if (parent) parent.children.push(node)
      else root.push(node)
    }
  }

  return root
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilesPane() {
  const {
    currentProject, setCurrentProject,
    currentFile, setCurrentFile,
    setEditorContent, setSavedContent, setActivePane, setPdfUrl,
    isFilesPaneCollapsed, setFilesPaneCollapsed,
    setProjectCompiler,
  } = useApp()

  const [projects, setProjects] = useState<string[] | null>(null)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [fileCache, setFileCache] = useState<Record<string, FileEntry[]>>({})
  const [loadingFiles, setLoadingFiles] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState<string | null>(null)
  const [newProjectName, setNewProjectName] = useState<string | null>(null)
  const [newFileName, setNewFileName] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const uploadRef = useRef<HTMLInputElement>(null)
  const folderUploadRef = useRef<HTMLInputElement>(null)
  const zipUploadRef = useRef<HTMLInputElement>(null)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const newProjectInputRef = useRef<HTMLInputElement>(null)
  const newFileInputRef = useRef<HTMLInputElement>(null)
  const newFolderInputRef = useRef<HTMLInputElement>(null)
  // Prevents double-fire from (Enter → blur) sequences.
  const creatingProjectRef = useRef(false)
  const creatingFileRef = useRef(false)
  const creatingFolderRef = useRef(false)

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects())
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  const loadFiles = useCallback(async (project: string, force = false) => {
    if (fileCache[project] && !force) return
    setLoadingFiles(project)
    try {
      const files = await api.listFiles(project)
      setFileCache(prev => ({ ...prev, [project]: files }))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingFiles(null)
    }
  }, [fileCache])

  // Re-expand the active project when returning to the files pane (component remounts on mobile).
  useEffect(() => {
    if (currentProject) {
      setExpandedProject(currentProject)
      loadFiles(currentProject)
    }
  // loadFiles is intentionally omitted — it guards against redundant fetches via fileCache internally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject])

  // Reset expanded folders when switching projects.
  useEffect(() => {
    setExpandedFolders(new Set())
  }, [expandedProject])

  // Auto-focus inline inputs when they appear.
  useEffect(() => {
    if (newProjectName !== null) newProjectInputRef.current?.focus()
  }, [newProjectName])
  useEffect(() => {
    if (newFileName !== null) newFileInputRef.current?.focus()
  }, [newFileName])
  useEffect(() => {
    if (newFolderName !== null) newFolderInputRef.current?.focus()
  }, [newFolderName])

  // ── Project actions ────────────────────────────────────────────────────────

  const toggleProject = useCallback(async (project: string) => {
    if (expandedProject === project) {
      setExpandedProject(null)
      return
    }
    setExpandedProject(project)
    setCurrentProject(project)
    await loadFiles(project)
    api.getProjectConfig(project).then(cfg => {
      setProjectCompiler((cfg.compiler || 'pdflatex') as LatexCompiler)
    }).catch(() => { /* non-fatal */ })
  }, [expandedProject, loadFiles, setCurrentProject, setProjectCompiler])

  const handleCreateProject = useCallback(async (name: string) => {
    if (!name.trim() || creatingProjectRef.current) {
      setNewProjectName(null)
      return
    }
    creatingProjectRef.current = true
    setNewProjectName(null)
    try {
      await api.createProject(name.trim())
      await loadProjects()
      setExpandedProject(name.trim())
      setCurrentProject(name.trim())
      await loadFiles(name.trim(), true)
    } catch (e) {
      setError(String(e))
    } finally {
      creatingProjectRef.current = false
    }
  }, [loadProjects, loadFiles, setCurrentProject])

  const handleDeleteProject = useCallback(async (project: string) => {
    if (!confirm(`Delete project "${project}" and all its files? This cannot be undone.`)) return
    try {
      await api.deleteProject(project)
      setFileCache(prev => { const n = { ...prev }; delete n[project]; return n })
      if (expandedProject === project) setExpandedProject(null)
      if (currentProject === project) {
        setCurrentProject(null)
        setCurrentFile(null)
        setEditorContent('')
      }
      await loadProjects()
    } catch (e) {
      setError(String(e))
    }
  }, [expandedProject, currentProject, loadProjects, setCurrentProject, setCurrentFile, setEditorContent])

  // ── File actions ───────────────────────────────────────────────────────────

  const handleCreateFile = useCallback(async (name: string) => {
    if (!name.trim() || !expandedProject || creatingFileRef.current) {
      setNewFileName(null)
      return
    }
    creatingFileRef.current = true
    setNewFileName(null)
    try {
      await api.createFile(expandedProject, name.trim())
      await loadFiles(expandedProject, true)
      // Open the newly created file immediately.
      const content = (await api.readFile(expandedProject, name.trim())).content
      setCurrentFile(name.trim())
      setEditorContent(content)
      setSavedContent(content)
      setActivePane('editor')
    } catch (e) {
      setError(String(e))
    } finally {
      creatingFileRef.current = false
    }
  }, [expandedProject, loadFiles, setCurrentFile, setEditorContent, setActivePane, setSavedContent])

  const handleCreateFolder = useCallback(async (name: string) => {
    if (!name.trim() || !expandedProject || creatingFolderRef.current) {
      setNewFolderName(null)
      return
    }
    creatingFolderRef.current = true
    setNewFolderName(null)
    try {
      await api.createDirectory(expandedProject, name.trim())
      await loadFiles(expandedProject, true)
      setExpandedFolders(prev => new Set(prev).add(name.trim()))
    } catch (e) {
      setError(String(e))
    } finally {
      creatingFolderRef.current = false
    }
  }, [expandedProject, loadFiles])

  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }, [])

  const handleOpenFile = useCallback(async (project: string, file: FileEntry) => {
    if (file.type === 'directory') return
    setLoadingFile(file.path)
    try {
      const { content } = await api.readFile(project, file.path)
      setCurrentProject(project)
      api.getProjectConfig(project).then(cfg => {
        setProjectCompiler((cfg.compiler || 'pdflatex') as LatexCompiler)
      }).catch(() => { /* non-fatal */ })
      setCurrentFile(file.path)
      setEditorContent(content)
      setSavedContent(content)
      setActivePane('editor')
      localStorage.setItem('texmobile:lastFile', JSON.stringify({ project, file: file.path }))

      if (file.path.endsWith('.tex')) {
        const pdfName = file.path.split('/').pop()!.replace(/\.tex$/, '.pdf')
        const cachedFiles = fileCache[project] ?? []
        if (cachedFiles.some(f => f.type === 'file' && f.path === pdfName)) {
          api.fetchRawFile(project, pdfName)
            .then(blob => setPdfUrl(URL.createObjectURL(blob)))
            .catch(() => { /* non-fatal */ })
        }
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingFile(null)
    }
  }, [setCurrentProject, setCurrentFile, setEditorContent, setSavedContent, setActivePane, setPdfUrl, fileCache, setProjectCompiler])

  const handleDeleteFile = useCallback(async (project: string, file: FileEntry) => {
    const msg = file.type === 'directory'
      ? `Delete folder "${file.name}" and all its contents? This cannot be undone.`
      : `Delete "${file.name}"?`
    if (!confirm(msg)) return
    try {
      await api.deleteFile(project, file.path)
      if (currentFile === file.path && currentProject === project) {
        setCurrentFile(null)
        setEditorContent('')
      }
      await loadFiles(project, true)
    } catch (e) {
      setError(String(e))
    }
  }, [currentFile, currentProject, loadFiles, setCurrentFile, setEditorContent])

  const handleFolderUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    e.target.value = ''
    if (!files || files.length === 0) return

    const projectName = files[0].webkitRelativePath.split('/')[0]
    if (!projectName) return

    const validFiles = Array.from(files).filter(f => !shouldSkipFile(f.webkitRelativePath))
    if (validFiles.length === 0) { setError('No uploadable files found in the selected folder.'); return }

    try {
      await api.createProject(projectName)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('409') || msg.toLowerCase().includes('already exists')) {
        if (!confirm(`A project named "${projectName}" already exists.\n\nUpload files into it anyway?`)) return
      } else { setError(msg); return }
    }

    setUploadProgress({ current: 0, total: validFiles.length })
    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i]
        const segments = file.webkitRelativePath.split('/')
        const subpath = segments.slice(1, -1).join('/')
        await api.uploadFile(projectName, file, subpath)
        setUploadProgress({ current: i + 1, total: validFiles.length })
      }
      await loadProjects()
      setExpandedProject(projectName)
      setCurrentProject(projectName)
      await loadFiles(projectName, true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploadProgress(null)
    }
  }, [loadProjects, loadFiles, setCurrentProject])

  const handleZipUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const doUpload = async (overwrite: boolean) => {
      setUploadProgress({ current: 0, total: 0 })
      try {
        const { project } = await api.uploadZip(file, overwrite)
        await loadProjects()
        setExpandedProject(project)
        setCurrentProject(project)
        await loadFiles(project, true)
      } finally {
        setUploadProgress(null)
      }
    }

    try {
      await doUpload(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('409') || msg.toLowerCase().includes('already exists')) {
        const name = file.name.replace(/\.zip$/i, '')
        if (!confirm(`A project named "${name}" already exists.\n\nUpload files into it anyway?`)) return
        try {
          await doUpload(true)
        } catch (err2: unknown) {
          setError(err2 instanceof Error ? err2.message : String(err2))
        }
      } else {
        setError(msg)
      }
    }
  }, [loadProjects, loadFiles, setCurrentProject])

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !expandedProject) return
    e.target.value = ''
    try {
      await api.uploadFile(expandedProject, file)
      await loadFiles(expandedProject, true)
    } catch (e) {
      setError(String(e))
    }
  }, [expandedProject, loadFiles])

  // ── Tree rendering ─────────────────────────────────────────────────────────

  function renderNodes(nodes: TreeNode[], project: string, depth = 0): React.ReactNode {
    return nodes.map(node => {
      const indent = 12 + depth * 12

      if (node.type === 'directory') {
        const isExpanded = expandedFolders.has(node.path)
        return (
          <li key={node.path}>
            <div
              className="group flex items-center gap-1.5 py-1.5 cursor-pointer
                hover:bg-surface-700 transition-colors select-none"
              style={{ paddingLeft: `${indent}px`, paddingRight: '12px' }}
            >
              <button
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                onClick={() => toggleFolder(node.path)}
              >
                {isExpanded
                  ? <ChevronDown  size={11} className="text-slate-500 shrink-0" />
                  : <ChevronRight size={11} className="text-slate-500 shrink-0" />}
                {isExpanded
                  ? <FolderOpen size={13} className="text-yellow-500 shrink-0" />
                  : <Folder     size={13} className="text-yellow-600 shrink-0" />}
                <span className="text-xs font-mono text-slate-400 truncate">{node.name}</span>
              </button>
              <button
                onClick={() => handleDeleteFile(project, { name: node.name, path: node.path, type: 'directory', size: null })}
                title="Delete folder"
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-600
                  hover:text-red-400 transition-all shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
            {isExpanded && node.children.length > 0 && (
              <ul>{renderNodes(node.children, project, depth + 1)}</ul>
            )}
            {isExpanded && node.children.length === 0 && (
              <p
                className="py-1 text-[10px] text-slate-600 italic"
                style={{ paddingLeft: `${indent + 22}px` }}
              >
                Empty folder
              </p>
            )}
          </li>
        )
      }

      const isActive = currentFile === node.path && currentProject === project
      const isLoading = loadingFile === node.path
      return (
        <li key={node.path}>
          <div
            className={`group flex items-center gap-1.5 py-1.5 cursor-pointer
              hover:bg-surface-700 transition-colors
              ${isActive ? 'bg-indigo-950/60 border-l-2 border-indigo-500 -ml-[2px]' : ''}`}
            style={{ paddingLeft: `${isActive ? indent - 2 : indent}px`, paddingRight: '12px' }}
          >
            <button
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
              onClick={() => handleOpenFile(project, { name: node.name, path: node.path, type: 'file', size: null })}
              disabled={isLoading}
            >
              {isLoading
                ? <Loader2 size={13} className="animate-spin text-slate-500 shrink-0" />
                : <FileIcon2 name={node.name} />}
              <span className={`text-xs font-mono truncate
                ${isActive ? 'text-indigo-300' : 'text-slate-400'}`}
              >
                {node.name}
              </span>
            </button>
            <button
              onClick={() => handleDeleteFile(project, { name: node.name, path: node.path, type: 'file', size: null })}
              title="Delete file"
              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-600
                hover:text-red-400 transition-all shrink-0"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </li>
      )
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isFilesPaneCollapsed) {
    return (
      <div className="hidden md:flex h-full w-8 flex-col items-center pt-2 bg-surface-800 border-r border-surface-700">
        <button
          onClick={() => setFilesPaneCollapsed(false)}
          title="Show files pane"
          className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-surface-600 transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-surface-800">

      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-surface-700 shrink-0">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider select-none">
          Files
        </span>
        <div className="flex items-center gap-0.5">
          <IconBtn title="Refresh" onClick={loadProjects}><RefreshCw size={13} /></IconBtn>
          <IconBtn title="New project" onClick={() => setNewProjectName('')}>
            <FolderPlus size={14} />
          </IconBtn>
          <IconBtn
            title="Upload project folder"
            onClick={() => folderUploadRef.current?.click()}
          >
            <FolderOpen size={14} />
          </IconBtn>
          <IconBtn
            title="Import zipped project"
            onClick={() => zipUploadRef.current?.click()}
          >
            <FileArchive size={14} />
          </IconBtn>
          <button
            title="Hide files pane"
            onClick={() => setFilesPaneCollapsed(true)}
            className="hidden md:inline-flex p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-surface-600 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* New-project inline input */}
      {newProjectName !== null && (
        <InlineInput
          inputRef={newProjectInputRef}
          value={newProjectName}
          placeholder="project-name"
          onChange={setNewProjectName}
          onSubmit={handleCreateProject}
          onCancel={() => setNewProjectName(null)}
        />
      )}

      {/* Hidden folder input */}
      <input
        ref={folderUploadRef}
        type="file"
        className="hidden"
        {...{ webkitdirectory: '', multiple: true } as React.InputHTMLAttributes<HTMLInputElement>}
        onChange={handleFolderUpload}
      />

      {/* Hidden zip input */}
      <input
        ref={zipUploadRef}
        type="file"
        className="hidden"
        accept=".zip"
        onChange={handleZipUpload}
      />

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-950/40 border-b border-red-900/40 text-red-400 text-xs">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1 break-words">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-red-600 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Upload progress banner */}
      {uploadProgress && (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-950/40
          border-b border-indigo-900/40 text-indigo-300 text-xs">
          <Loader2 size={13} className="animate-spin shrink-0" />
          <span>
            {uploadProgress.total === 0
              ? 'Extracting zip…'
              : `Uploading ${uploadProgress.current}/${uploadProgress.total} files…`}
          </span>
        </div>
      )}

      {/* Project + file tree */}
      <div className="flex-1 overflow-y-auto pane-scroll">
        {projects === null ? (
          <Spinner label="Loading…" />
        ) : projects.length === 0 ? (
          <EmptyProjects />
        ) : (
          <ul className="py-1">
            {projects.map(project => (
              <li key={project}>

                {/* ── Project row ─────────────────────────────────────── */}
                <div className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer
                  hover:bg-surface-700 transition-colors select-none
                  ${currentProject === project ? 'bg-surface-700/60' : ''}`}
                >
                  <button
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    onClick={() => toggleProject(project)}
                  >
                    {expandedProject === project
                      ? <ChevronDown  size={13} className="text-slate-500 shrink-0" />
                      : <ChevronRight size={13} className="text-slate-500 shrink-0" />}
                    {expandedProject === project
                      ? <FolderOpen size={14} className="text-yellow-400 shrink-0" />
                      : <Folder     size={14} className="text-yellow-600 shrink-0" />}
                    <span className="text-sm text-slate-300 font-mono truncate">{project}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteProject(project)}
                    title="Delete project"
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-600
                      hover:text-red-400 transition-all shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* ── Files panel ──────────────────────────────────────── */}
                {expandedProject === project && (
                  <div className="border-l-2 border-surface-600 ml-[22px]">

                    {/* File actions toolbar */}
                    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-surface-700 bg-surface-900/40">
                      <button
                        onClick={() => { setNewFolderName(null); setNewFileName('') }}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-300 transition-colors"
                      >
                        <FilePlus2 size={12} /> New file
                      </button>
                      <button
                        onClick={() => { setNewFileName(null); setNewFolderName('') }}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-300 transition-colors"
                      >
                        <FolderPlus size={12} /> New folder
                      </button>
                      <button
                        onClick={() => uploadRef.current?.click()}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-300 transition-colors"
                      >
                        <Upload size={12} /> Upload
                      </button>
                      <input
                        ref={uploadRef}
                        type="file"
                        className="hidden"
                        accept=".tex,.bib,.cls,.sty,.dtx,.png,.jpg,.jpeg,.gif,.svg,.webp,.pdf"
                        onChange={handleUpload}
                      />
                    </div>

                    {/* New-file inline input */}
                    {newFileName !== null && (
                      <InlineInput
                        inputRef={newFileInputRef}
                        value={newFileName}
                        placeholder="filename.tex"
                        onChange={setNewFileName}
                        onSubmit={handleCreateFile}
                        onCancel={() => setNewFileName(null)}
                      />
                    )}

                    {/* New-folder inline input */}
                    {newFolderName !== null && (
                      <InlineInput
                        inputRef={newFolderInputRef}
                        value={newFolderName}
                        placeholder="folder-name"
                        onChange={setNewFolderName}
                        onSubmit={handleCreateFolder}
                        onCancel={() => setNewFolderName(null)}
                      />
                    )}

                    {/* File tree */}
                    {loadingFiles === project ? (
                      <Spinner label="Loading files…" />
                    ) : (() => {
                      const tree = buildFileTree(fileCache[project] ?? [])
                      return tree.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] text-slate-600 italic">No files yet</p>
                      ) : (
                        <ul>{renderNodes(tree, project)}</ul>
                      )
                    })()}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IconBtn({
  title, onClick, children,
}: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-surface-600 transition-colors"
    >
      {children}
    </button>
  )
}

function InlineInput({
  inputRef, value, placeholder, onChange, onSubmit, onCancel,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  placeholder: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  onCancel: () => void
}) {
  return (
    <div className="px-2 py-1.5 bg-surface-700 border-b border-surface-600">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); onSubmit(value) }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        className="w-full bg-surface-900 text-slate-200 text-xs font-mono
          px-2 py-1 rounded border border-surface-600
          focus:border-indigo-500 focus:outline-none placeholder-slate-600"
      />
      <p className="mt-1 text-[10px] text-slate-600">Enter to save · Esc to cancel</p>
    </div>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-slate-600 text-xs">
      <Loader2 size={13} className="animate-spin" /> {label}
    </div>
  )
}

function EmptyProjects() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      <FolderOpen size={32} className="text-surface-600" />
      <p className="text-xs text-slate-600">
        No projects yet.<br />
        Click <FolderPlus size={11} className="inline" /> to create your first one.
      </p>
    </div>
  )
}
