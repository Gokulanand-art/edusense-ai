'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2 } from 'lucide-react'
import { Pill } from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils/helpers'

/**
 * One leave decision row.
 *
 * The 75% rule is enforced server-side; this surfaces the consequence before
 * the click and sends an explicit `override` when the student would breach the
 * threshold, so a breach is always a deliberate, audited choice rather than a
 * silent approval.
 */
export function LeaveDecision({
  leave,
}: {
  leave: {
    id: string
    studentName: string
    rollNumber: string
    leaveType: string
    startDate: string
    endDate: string
    noOfDays: number
    reason: string
    projectedOverall: number | null
    riskLevel: string | null
  }
}) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const breach = leave.projectedOverall != null && leave.projectedOverall < 75

  async function decide(decision: 'APPROVED' | 'REJECTED', override = false) {
    if (decision === 'REJECTED' && note.trim().length < 3) {
      setError('A rejection needs a reason.')
      return
    }
    setBusy(decision)
    setError(null)
    try {
      const res = await fetch('/api/dept/leaves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveId: leave.id, decision, note, override }),
      })
      const body = await res.json().catch(() => ({}))

      if (res.status === 409 && body?.requiresOverride) {
        if (override) {
          setError('Override failed. Try again.')
          setBusy(null)
          return
        }
        const ok = window.confirm(
          `Approving drops ${leave.studentName} to ${body.projected}% — below the 75% exam-eligibility threshold.\n\nContinue as a deliberate override? This is recorded in the audit log.`,
        )
        if (ok) await decide('APPROVED', true)
        setBusy(null)
        return
      }
      if (!res.ok) {
        setError(body?.error ?? 'Could not record the decision.')
        setBusy(null)
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError('Network error.')
      setBusy(null)
    }
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-slate-900">{leave.studentName}</span>
            <span className="text-[12px] tabular-nums text-slate-500">{leave.rollNumber}</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
              {leave.leaveType.replace('_', ' ')}
            </span>
            {leave.projectedOverall != null ? (
              <Pill severity={breach ? 'critical' : 'ok'}>
                {leave.projectedOverall.toFixed(1)}% projected
              </Pill>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-slate-500">
            {formatDate(leave.startDate)} → {formatDate(leave.endDate)} · {leave.noOfDays} day
            {leave.noOfDays === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-slate-600">{leave.reason}</p>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => decide('APPROVED')}
            disabled={busy != null}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === 'APPROVED' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
            )}
            Approve
          </button>
          <button
            onClick={() => decide('REJECTED')}
            disabled={busy != null}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === 'REJECTED' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" strokeWidth={2.4} />
            )}
            Reject
          </button>
        </div>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Decision note (required to reject)"
        className="mt-2.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none placeholder:text-slate-400 focus:border-slate-400"
      />
      {error ? <p className="mt-1.5 text-[12px] font-medium text-rose-600">{error}</p> : null}
    </div>
  )
}
