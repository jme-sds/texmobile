// All paths are relative so Next.js rewrites proxy them to the backend.
// See next.config.ts for the rewrite rule.

import type { FileEntry, CompileError, ErrorSuggestion, DocumentComment } from './types'

const enc = encodeURIComponent

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const b = await res.json(); msg = b.detail ?? JSON.stringify(b) } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

// ── Projects ────────────────────────────────────────────────────────────────

export const listProjects = () =>
  req<string[]>('/api/files/projects')

export const createProject = (name: string) =>
  req<{ project: string }>('/api/files/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const deleteProject = (name: string) =>
  req<{ deleted: string }>(`/api/files/projects/${enc(name)}`, { method: 'DELETE' })

export const duplicateProject = (source: string, newName: string) =>
  req<{ project: string }>(`/api/files/projects/${enc(source)}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: newName }),
  })

// ── Files ────────────────────────────────────────────────────────────────────

export const listFiles = (project: string) =>
  req<FileEntry[]>(`/api/files/projects/${enc(project)}/files`)

export const readFile = (project: string, filename: string) =>
  req<{ filename: string; content: string }>(
    `/api/files/projects/${enc(project)}/files/${enc(filename)}`
  )

// Returns a stable URL for serving a raw file (e.g. a PDF) directly in an iframe.
// Each path segment is encoded individually so subdirectory slashes are preserved.
export const getRawFileUrl = (project: string, filepath: string) =>
  `/api/files/projects/${enc(project)}/raw/${filepath.split('/').map(enc).join('/')}`

export const createFile = (project: string, name: string, content = '') =>
  req<{ file: string }>(`/api/files/projects/${enc(project)}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content }),
  })

export const createDirectory = (project: string, name: string) =>
  req<{ directory: string }>(`/api/files/projects/${enc(project)}/directories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const updateFile = (project: string, filename: string, content: string) =>
  req<{ filename: string }>(
    `/api/files/projects/${enc(project)}/files/${enc(filename)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }
  )

export const deleteFile = (project: string, filename: string) =>
  req<{ deleted: string }>(
    `/api/files/projects/${enc(project)}/files/${enc(filename)}`,
    { method: 'DELETE' }
  )

export function uploadFile(project: string, file: File, subpath = ''): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  if (subpath) form.append('subpath', subpath)
  return req<void>(`/api/files/projects/${enc(project)}/upload`, { method: 'POST', body: form })
}

export async function uploadZip(file: File, overwrite = false): Promise<{ project: string; extracted: number }> {
  const form = new FormData()
  form.append('file', file)
  const url = `/api/files/projects/upload-zip${overwrite ? '?overwrite=true' : ''}`
  return req<{ project: string; extracted: number }>(url, { method: 'POST', body: form })
}

// ── Compilation ──────────────────────────────────────────────────────────────

export type CompileResult =
  | { ok: true; pdfBlob: Blob }
  | { ok: false; errors: CompileError[]; log: string }

export async function compile(project: string, filename: string, compiler = 'pdflatex'): Promise<CompileResult> {
  const res = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, filename, compiler }),
  })

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const b = await res.json(); msg = b.detail ?? JSON.stringify(b) } catch { /* ignore */ }
    throw new Error(msg)
  }

  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/pdf')) {
    return { ok: true, pdfBlob: await res.blob() }
  }
  const data = await res.json() as { errors: CompileError[]; log: string }
  return { ok: false, errors: data.errors, log: data.log }
}

// ── LLM Chat ─────────────────────────────────────────────────────────────────

export interface LlmConfig {
  api_endpoint: string
  api_key_set: boolean
  model_name: string
  default_compiler: string
}

export const getLlmConfig = () =>
  req<LlmConfig>('/api/chat/config')

export const saveLlmConfig = (config: { api_endpoint?: string; api_key?: string; model_name?: string; default_compiler?: string }) =>
  req<{ ok: boolean }>('/api/chat/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })

export const getProjectConfig = (project: string) =>
  req<{ compiler: string }>(`/api/files/projects/${enc(project)}/config`)

export const saveProjectConfig = (project: string, compiler: string) =>
  req<{ ok: boolean }>(`/api/files/projects/${enc(project)}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ compiler }),
  })

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface ConversationMeta {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ConversationDetail extends ConversationMeta {
  project: string
  messages: ChatMessage[]
}

export interface SendChatOptions {
  project?: string | null
  conversationId?: string
  conversationTitle?: string
  conversationCreatedAt?: string
}

export const sendChatMessage = (
  messages: ChatMessage[],
  document_context: string | null,
  opts: SendChatOptions = {},
) =>
  req<{ content: string }>('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      document_context,
      project: opts.project ?? null,
      conversation_id: opts.conversationId,
      conversation_title: opts.conversationTitle,
      conversation_created_at: opts.conversationCreatedAt,
    }),
  })

export const testLlmConnection = () =>
  req<{ ok: boolean; response: string }>('/api/chat/test', { method: 'POST' })

export interface CheckErrorsResult {
  suggestions: ErrorSuggestion[]
}

export const checkErrors = (document: string, filename?: string) =>
  req<CheckErrorsResult>('/api/chat/check-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document, filename }),
  })

export const writingAssist = (document: string, instruction: string, filename?: string) =>
  req<CheckErrorsResult>('/api/chat/writing-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document, instruction, filename }),
  })

export interface CommentAssistResult {
  comments: DocumentComment[]
}

export const commentAssist = (
  document: string,
  instruction: string,
  project?: string,
  filename?: string,
) =>
  req<CommentAssistResult>('/api/chat/comment-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document, instruction, project, filename }),
  })

export const getComments = (project: string, filename: string) =>
  req<DocumentComment[]>(`/api/chat/comments/${enc(project)}/${enc(filename)}`)

export const updateComment = (project: string, filename: string, id: string, status: string) =>
  req<{ ok: boolean }>(
    `/api/chat/comments/${enc(project)}/${enc(filename)}/${enc(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }
  )

export const deleteComment = (project: string, filename: string, id: string) =>
  req<{ ok: boolean }>(
    `/api/chat/comments/${enc(project)}/${enc(filename)}/${enc(id)}`,
    { method: 'DELETE' }
  )

export const listConversations = (project: string) =>
  req<ConversationMeta[]>(`/api/chat/conversations/${enc(project)}`)

export const getConversation = (project: string, id: string) =>
  req<ConversationDetail>(`/api/chat/conversations/${enc(project)}/${enc(id)}`)

export const deleteConversation = (project: string, id: string) =>
  req<{ ok: boolean }>(`/api/chat/conversations/${enc(project)}/${enc(id)}`, { method: 'DELETE' })
