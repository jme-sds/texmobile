'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Loader2, Bot, Clock, Plus, Trash2, ArrowLeft, FileText, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useApp } from '@/lib/AppContext'
import * as api from '@/lib/api'

interface Props {
  onClose: () => void
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default function ChatWindow({ onClose }: Props) {
  const { editorContent, currentFile, currentProject } = useApp()

  // 'chat' shows the message thread; 'history' shows the conversation list
  const [view, setView] = useState<'chat' | 'history'>('chat')

  // Active conversation state
  const [convId, setConvId] = useState(genId)
  const [convCreatedAt, setConvCreatedAt] = useState(() => new Date().toISOString())
  const [convTitle, setConvTitle] = useState('')
  const [messages, setMessages] = useState<api.ChatMessage[]>([])

  // Chat input state
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // History panel state
  const [conversations, setConversations] = useState<api.ConversationMeta[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Document context selector
  type DocMode = 'active' | 'all' | 'custom'
  const [docMode, setDocMode] = useState<DocMode>('active')
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [projectFiles, setProjectFiles] = useState<string[]>([])
  const [showDocPicker, setShowDocPicker] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const docPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (view === 'chat') textareaRef.current?.focus()
  }, [view])

  useEffect(() => {
    if (!currentProject) { setProjectFiles([]); return }
    api.listFiles(currentProject)
      .then(files =>
        setProjectFiles(
          files
            .filter(f => f.type === 'file' && /\.(tex|bib)$/.test(f.name))
            .map(f => f.path)
        )
      )
      .catch(() => {})
  }, [currentProject])

  useEffect(() => {
    if (!showDocPicker) return
    const handler = (e: MouseEvent) => {
      if (docPickerRef.current && !docPickerRef.current.contains(e.target as Node))
        setShowDocPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDocPicker])

  const loadHistory = useCallback(async () => {
    if (!currentProject) return
    setLoadingHistory(true)
    try {
      setConversations(await api.listConversations(currentProject))
    } catch {
      // non-fatal
    } finally {
      setLoadingHistory(false)
    }
  }, [currentProject])

  const openHistory = useCallback(() => {
    setView('history')
    loadHistory()
  }, [loadHistory])

  const startNewChat = useCallback(() => {
    setConvId(genId())
    setConvCreatedAt(new Date().toISOString())
    setConvTitle('')
    setMessages([])
    setError(null)
    setInput('')
    setView('chat')
  }, [])

  const openConversation = useCallback(async (id: string) => {
    if (!currentProject) return
    try {
      const detail = await api.getConversation(currentProject, id)
      setConvId(detail.id)
      setConvCreatedAt(detail.created_at)
      setConvTitle(detail.title)
      setMessages(detail.messages)
      setError(null)
      setView('chat')
    } catch {
      // non-fatal
    }
  }, [currentProject])

  const deleteConversation = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!currentProject) return
    await api.deleteConversation(currentProject, id)
    setConversations(prev => prev.filter(c => c.id !== id))
    // Clear the active chat if it was the deleted one
    if (id === convId) startNewChat()
  }, [currentProject, convId, startNewChat])

  const toggleDoc = useCallback((path: string) => {
    setDocMode('custom')
    setSelectedDocs(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    )
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const nextMessages: api.ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError(null)

    // Derive title from the first user message
    const title = convTitle || text.slice(0, 50) + (text.length > 50 ? '…' : '')

    let docContext: string | null = null
    if (docMode === 'active' || !currentProject) {
      docContext = editorContent || null
    } else {
      const paths = docMode === 'all' ? projectFiles : selectedDocs
      const parts: string[] = []
      for (const p of paths) {
        const content = p === currentFile
          ? editorContent
          : (await api.readFile(currentProject, p).catch(() => null))?.content
        if (content) parts.push(`[Document: ${p}]\n${content}`)
      }
      docContext = parts.length ? parts.join('\n\n---\n\n') : null
    }

    try {
      const result = await api.sendChatMessage(
        nextMessages,
        docContext,
        {
          project: currentProject,
          conversationId: convId,
          conversationTitle: title,
          conversationCreatedAt: convCreatedAt,
        },
      )
      setMessages(prev => [...prev, { role: 'assistant', content: result.content }])
      if (!convTitle) setConvTitle(title)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, editorContent, currentFile, currentProject, convId, convTitle, convCreatedAt, docMode, projectFiles, selectedDocs])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── History panel ────────────────────────────────────────────────────────

  const historyPanel = (
    <div className="flex flex-col h-full bg-surface-900 text-slate-200">
      <div className="flex items-center justify-between px-3 py-2 bg-surface-800 border-b border-surface-700 shrink-0">
        <button
          onClick={() => setView('chat')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <span className="text-xs font-semibold text-slate-300">Conversations</span>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* New chat button */}
        <button
          onClick={startNewChat}
          className="flex items-center gap-2 w-full px-4 py-3 text-xs text-indigo-400
            hover:bg-surface-800 border-b border-surface-700/50 transition-colors"
        >
          <Plus size={13} />
          New conversation
        </button>

        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <Loader2 size={16} className="animate-spin text-slate-600" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-[11px] text-slate-600 text-center py-8 px-4">
            {currentProject ? 'No past conversations for this project.' : 'Open a project to see conversation history.'}
          </p>
        ) : (
          <ul>
            {conversations.map(conv => (
              <li key={conv.id}>
                <button
                  onClick={() => openConversation(conv.id)}
                  className={`group flex items-start justify-between gap-2 w-full px-4 py-3
                    text-left border-b border-surface-700/50 transition-colors hover:bg-surface-800
                    ${conv.id === convId ? 'bg-surface-800' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-xs text-slate-300 truncate leading-snug">{conv.title}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{timeAgo(conv.updated_at)}</p>
                  </div>
                  <button
                    onClick={e => deleteConversation(e, conv.id)}
                    className="shrink-0 p-1 rounded text-slate-600 hover:text-red-400
                      hover:bg-surface-700 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  // ── Chat panel ───────────────────────────────────────────────────────────

  const docPickerLabel =
    docMode === 'active'
      ? `Active: ${currentFile ?? 'document'}`
      : docMode === 'all'
        ? `All documents (${projectFiles.length})`
        : selectedDocs.length === 0
          ? 'No documents'
          : `${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''}`

  const chatPanel = (
    <div className="flex flex-col h-full bg-surface-900 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-800 border-b border-surface-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Bot size={14} className="text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-300 truncate">
            {convTitle || (currentFile ? currentFile : 'AI Assistant')}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={startNewChat}
            title="New conversation"
            className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={openHistory}
            title="Conversation history"
            className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors"
          >
            <Clock size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-slate-600 text-center mt-4">
            {currentProject
              ? 'Ask anything about your document.'
              : 'Open a project to start chatting.'}
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed
                whitespace-pre-wrap break-words bg-indigo-700/70 text-indigo-100">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[85%] rounded-lg px-3 py-2 bg-surface-700 text-slate-200
                text-xs leading-relaxed chat-markdown">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-700 rounded-lg px-3 py-2">
              <Loader2 size={12} className="animate-spin text-indigo-400" />
            </div>
          </div>
        )}
        {error && (
          <div className="text-[11px] text-red-400 bg-red-900/20 rounded px-2 py-1.5 border border-red-900/40">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 py-2 bg-surface-800 border-t border-surface-700">
        {/* Document context selector */}
        <div className="relative mb-1.5" ref={docPickerRef}>
          <button
            onClick={() => setShowDocPicker(v => !v)}
            title="Choose which documents to include as context"
            className="flex items-center gap-1 text-[11px] text-slate-500
              hover:text-slate-300 transition-colors px-1 py-0.5 rounded
              hover:bg-surface-700"
          >
            <FileText size={10} />
            <span>{docPickerLabel}</span>
            <ChevronDown size={10} />
          </button>

          {showDocPicker && (
            <div className="absolute bottom-full mb-1 left-0 z-20 bg-surface-700
              border border-surface-600 rounded shadow-lg p-2 w-60">
              <button
                onClick={() => { setDocMode('active'); setShowDocPicker(false) }}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs
                  hover:bg-surface-600 transition-colors
                  ${docMode === 'active' ? 'text-indigo-400' : 'text-slate-300'}`}
              >
                <span className={`w-2 h-2 rounded-full border shrink-0 ${docMode === 'active' ? 'bg-indigo-400 border-indigo-400' : 'border-slate-500'}`} />
                Active document
              </button>
              <button
                onClick={() => { setDocMode('all'); setShowDocPicker(false) }}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs
                  hover:bg-surface-600 transition-colors
                  ${docMode === 'all' ? 'text-indigo-400' : 'text-slate-300'}`}
              >
                <span className={`w-2 h-2 rounded-full border shrink-0 ${docMode === 'all' ? 'bg-indigo-400 border-indigo-400' : 'border-slate-500'}`} />
                All documents ({projectFiles.length})
              </button>
              {projectFiles.length > 0 && (
                <>
                  <div className="border-t border-surface-600 my-1.5" />
                  <p className="text-[10px] text-slate-500 px-2 mb-1">Select files:</p>
                  {projectFiles.map(p => (
                    <label key={p} className="flex items-center gap-2 px-2 py-1 rounded
                      hover:bg-surface-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDocs.includes(p)}
                        onChange={() => toggleDoc(p)}
                        className="accent-indigo-500"
                      />
                      <span className="text-xs text-slate-300 truncate" title={p}>{p}</span>
                    </label>
                  ))}
                </>
              )}
              {!currentProject && (
                <p className="text-[11px] text-slate-500 px-2 py-1">Open a project first.</p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your document… (Enter to send)"
            rows={2}
            className="flex-1 resize-none bg-surface-700 text-slate-200 placeholder-slate-600
              text-xs rounded px-2.5 py-2 border border-surface-600 focus:outline-none
              focus:border-indigo-600 transition-colors scrollbar-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={`p-2 rounded transition-colors shrink-0
              ${!input.trim() || loading
                ? 'bg-surface-700 text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  )

  const inner = view === 'history' ? historyPanel : chatPanel

  return (
    <>
      {/* Desktop: floating panel anchored to top-right of editor pane */}
      <div className="hidden md:flex absolute top-0 right-0 z-50 w-96 h-[520px]
        rounded-bl-lg border border-surface-600 shadow-2xl overflow-hidden flex-col">
        {inner}
      </div>

      {/* Mobile: full-screen overlay */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col">
        {inner}
      </div>
    </>
  )
}
