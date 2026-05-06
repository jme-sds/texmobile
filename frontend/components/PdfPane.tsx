'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, AlertCircle, X, FileWarning, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useApp } from '@/lib/AppContext'
import type { CompileError } from '@/lib/types'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export default function PdfPane() {
  const {
    pdfUrl, compileErrors, setCompileErrors,
    isPdfPaneCollapsed, setPdfPaneCollapsed,
    currentFile,
  } = useApp()

  const downloadFilename = currentFile
    ? currentFile.split('/').pop()!.replace(/\.tex$/, '.pdf')
    : 'output.pdf'

  if (isPdfPaneCollapsed) {
    return (
      <div className="hidden md:flex h-full w-8 flex-col items-center pt-2 bg-surface-900 border-l border-surface-700">
        <button
          onClick={() => setPdfPaneCollapsed(false)}
          title="Show PDF pane"
          className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-surface-700 transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative h-full flex flex-col bg-surface-900">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-10 bg-surface-800 border-b border-surface-700 shrink-0">
        <button
          onClick={() => setPdfPaneCollapsed(true)}
          title="Hide PDF pane"
          className="hidden md:inline-flex p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-surface-600 transition-colors shrink-0"
        >
          <ChevronRight size={14} />
        </button>
        <BookOpen size={14} className="text-slate-500" />
        <span className="text-xs text-slate-500 font-mono">output.pdf</span>
        <div className="ml-auto flex items-center gap-2">
          {compileErrors.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle size={12} />
              {compileErrors.length} error{compileErrors.length !== 1 ? 's' : ''}
            </span>
          )}
          {pdfUrl && (
            <a
              href={pdfUrl}
              download={downloadFilename}
              title="Download PDF"
              className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-surface-600 transition-colors"
            >
              <Download size={14} />
            </a>
          )}
        </div>
      </div>

      {/* PDF viewer or empty state */}
      {pdfUrl
        ? <PdfViewer pdfUrl={pdfUrl} />
        : <EmptyState hasErrors={compileErrors.length > 0} />
      }

      {/* Error overlay — rendered on top of the PDF (or empty state) */}
      {compileErrors.length > 0 && (
        <ErrorOverlay
          errors={compileErrors}
          onDismiss={() => setCompileErrors([])}
        />
      )}
    </div>
  )
}

// ── PDF viewer ────────────────────────────────────────────────────────────────

function PdfViewer({ pdfUrl }: { pdfUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [numPages, setNumPages] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto pane-scroll bg-[#404040] flex flex-col items-center gap-2 py-2"
    >
      <Document
        file={pdfUrl}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<LoadingSpinner />}
        error={<DocumentError />}
      >
        {containerWidth > 0 && Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i + 1}
            pageNumber={i + 1}
            width={containerWidth - 16}
            loading={null}
          />
        ))}
      </Document>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-sm text-slate-400 font-mono">Loading PDF…</div>
    </div>
  )
}

function DocumentError() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-sm text-red-400 font-mono">Failed to load PDF</div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ hasErrors }: { hasErrors: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3 p-8">
        {hasErrors
          ? <FileWarning size={40} className="mx-auto text-red-700" />
          : <BookOpen    size={40} className="mx-auto text-surface-600" />}
        <p className="font-mono text-sm text-slate-500">
          {hasErrors ? 'Compilation failed' : 'No PDF compiled yet'}
        </p>
        <p className="text-xs text-slate-600 max-w-[200px]">
          {hasErrors
            ? 'See the errors listed below.'
            : 'Open a .tex file from the Files pane, then tap Compile.'}
        </p>
      </div>
    </div>
  )
}

// ── Error overlay ─────────────────────────────────────────────────────────────

function ErrorOverlay({
  errors, onDismiss,
}: { errors: CompileError[]; onDismiss: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col bg-surface-900/96 backdrop-blur-sm z-10">

      {/* Overlay header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-red-900/50
        bg-red-950/50 shrink-0"
      >
        <div className="flex items-center gap-2">
          <AlertCircle size={15} className="text-red-400" />
          <span className="font-semibold text-red-300 text-sm">
            Compilation failed &mdash; {errors.length} error{errors.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onDismiss}
          title="Dismiss"
          className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-700 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Error list */}
      <div className="flex-1 overflow-y-auto pane-scroll p-3 space-y-2">
        {errors.map((err, i) => (
          <ErrorCard key={i} error={err} />
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-surface-700 bg-surface-800/60 shrink-0">
        <p className="text-xs text-slate-600">
          Fix the errors in the Editor pane and compile again.
        </p>
      </div>
    </div>
  )
}

function ErrorCard({ error }: { error: CompileError }) {
  return (
    <div className="rounded-md border border-red-900/40 bg-red-950/20 overflow-hidden">
      {error.line !== null && (
        <div className="px-3 py-1 bg-red-950/50 border-b border-red-900/30">
          <span className="text-[11px] font-mono text-red-500">Line {error.line}</span>
        </div>
      )}
      <div className="px-3 py-2 font-mono text-sm text-red-200 break-words leading-relaxed">
        {error.message}
      </div>
    </div>
  )
}
