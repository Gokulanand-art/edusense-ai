'use client'

import { useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

/**
 * Sign-in form only — the page owns the layout, so this deliberately renders no
 * container of its own.
 */
export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError('Enter your email, login ID or roll number, and your password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Sign-in failed.')
        return
      }
      // Hard navigation, not router.push + refresh: the dashboards are server
      // components gated on the session cookie, so they need a real round-trip
      // to render the new identity. The client-side pairing raced and cancelled
      // the push.
      window.location.assign(data.redirect)
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-slate-700">
          Email, login ID or roll number
        </label>
        <input
          id="email"
          name="email"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="hod.cse@campus.edu · G001 · 24CS001"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400"
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
