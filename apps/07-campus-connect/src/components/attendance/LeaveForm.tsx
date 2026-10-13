'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'

const TYPES = ['CASUAL', 'SICK', 'MEDICAL', 'ON_DUTY', 'COMPENSATORY', 'BEREAVEMENT', 'OTHER'] as const

/** Leave application form. The impact projection shown above is re-read by the
 *  server on submit and snapshotted onto the row, so what the student saw and
 *  what was recorded cannot diverge. */
export function LeaveForm({ studentId }: { studentId: string }) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [type, setType] = useState<string>('CASUAL')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [reason, setReason] = useState('')
  const [cert, setCert] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/attendance/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveType: type, startDate, endDate, reason, hasMedicalCert: cert }),
      })
      const d = await res.json()
      if (!res.ok) {
        setMsg({ ok: false, text: d.error ?? 'Submission failed' })
      } else {
        setMsg({ ok: true, text: `Submitted. ${d.impact.summary}` })
        setReason('')
        router.refresh()
      }
    } catch {
      setMsg({ ok: false, text: 'Network error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-5 dark:bg-slate-900">
      <h2 className="text-lg font-semibold">Apply for leave</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="lt">Type</label>
          <select
            id="lt"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-md border bg-transparent px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="sd">From</label>
          <input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border bg-transparent px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="ed">To</label>
          <input id="ed" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border bg-transparent px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="rs">Reason</label>
        <textarea id="rs" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
          className="w-full rounded-md border bg-transparent px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cert} onChange={(e) => setCert(e.target.checked)} className="h-4 w-4" />
        I have a medical certificate (enables condonation if attendance is below threshold)
      </label>

      {msg ? (
        <p className={`rounded-md p-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
          {msg.text}
        </p>
      ) : null}

      <button disabled={busy}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        <Send className="h-4 w-4" /> {busy ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  )
}
