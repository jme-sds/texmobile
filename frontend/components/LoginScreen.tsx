'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import * as api from '@/lib/api'
import { AuthStore } from '@/lib/auth'
import type { UserInfo } from '@/lib/api'

interface Props {
  onLogin: (user: UserInfo, token: string) => void
}

export default function LoginScreen({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [demoInfo, setDemoInfo] = useState<api.DemoInfo | null>(null)

  useEffect(() => {
    api.getDemoInfo().then(setDemoInfo).catch(() => {})
  }, [])

  const handleDemoLogin = () => {
    if (!demoInfo?.demo_email || !demoInfo?.demo_password) return
    setEmail(demoInfo.demo_email)
    setPassword(demoInfo.demo_password)
    submitLogin(demoInfo.demo_email, demoInfo.demo_password)
  }

  const submitLogin = async (loginEmail = email, loginPassword = password) => {
    setError(null)
    setLoading(true)
    try {
      const res = await api.login(loginEmail, loginPassword)
      AuthStore.setToken(res.access_token)
      onLogin({ id: '', email: res.email, is_demo: res.is_demo }, res.access_token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      setLoading(true)
      try {
        const res = await api.register(email, password)
        AuthStore.setToken(res.access_token)
        onLogin({ id: '', email: res.email, is_demo: res.is_demo }, res.access_token)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Registration failed')
      } finally {
        setLoading(false)
      }
    } else {
      await submitLogin()
    }
  }

  return (
    <div className="min-h-dvh bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="font-mono font-bold text-2xl tracking-widest">
            <span className="text-indigo-400">TEX</span>
            <span className="text-slate-300">MOBILE</span>
          </span>
          <p className="text-slate-500 text-sm mt-2">A LaTeX editor with AI assistance</p>
        </div>

        {/* Demo credentials banner */}
        {demoInfo?.available && (
          <div className="mb-5 p-3.5 rounded-lg bg-indigo-950/60 border border-indigo-800/50">
            <p className="text-xs text-indigo-300 font-medium mb-1">Try it instantly</p>
            <div className="text-xs text-slate-400 space-y-0.5 mb-3">
              <p>Email: <span className="text-slate-200 font-mono">{demoInfo.demo_email}</span></p>
              <p>Password: <span className="text-slate-200 font-mono">{demoInfo.demo_password}</span></p>
            </div>
            <button
              onClick={handleDemoLogin}
              disabled={loading}
              className="w-full py-1.5 rounded text-xs font-semibold bg-indigo-700 hover:bg-indigo-600
                text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}
              Login as Demo
            </button>
          </div>
        )}

        {/* Auth form */}
        <div className="bg-surface-800 border border-surface-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-5">
            {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full bg-surface-700 border border-surface-600 rounded px-3 py-2
                  text-sm text-slate-200 placeholder-slate-600
                  focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                className="w-full bg-surface-700 border border-surface-600 rounded px-3 py-2
                  text-sm text-slate-200 placeholder-slate-600
                  focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full bg-surface-700 border border-surface-600 rounded px-3 py-2
                    text-sm text-slate-200 placeholder-slate-600
                    focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded text-sm font-semibold bg-indigo-600 hover:bg-indigo-500
                text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(null) }}
              className="text-xs text-slate-500 hover:text-indigo-400 transition-colors"
            >
              {mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
