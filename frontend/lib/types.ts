// Shared domain types used by both the API client and the React context.

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number | null
}

export interface CompileError {
  line: number | null
  message: string
}

export interface ErrorSuggestion {
  id: string
  description: string
  original: string
  replacement: string
}

export type CheckErrorsStatus =
  | 'idle'
  | 'loading'
  | 'done'
  | 'no_errors'
  | 'parse_error'
  | 'network_error'

export interface DocumentComment {
  id: string
  description: string
  anchored_text: string
  instruction: string
  status: 'active' | 'dismissed' | 'resolved'
  created_at: string
}

export type LatexCompiler = 'pdflatex' | 'xelatex' | 'lualatex' | 'latex' | 'latexmk'

export const COMPILER_OPTIONS: { value: LatexCompiler; label: string }[] = [
  { value: 'pdflatex', label: 'pdflatex (default)' },
  { value: 'xelatex',  label: 'xelatex' },
  { value: 'lualatex', label: 'lualatex' },
  { value: 'latex',    label: 'latex + dvipdf' },
  { value: 'latexmk',  label: 'latexmk (auto)' },
]
