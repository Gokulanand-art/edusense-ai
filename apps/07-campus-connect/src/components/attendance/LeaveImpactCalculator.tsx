'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, AlertTriangle, ShieldCheck, Info } from 'lucide-react'
import { Progress } from '@/components/ui/Progress'

interface SubjectProjection {
  subjectId: string
  code: string
  name: string
  current: number
  projected: number
  delta: number
  threshold: number
  willBreach: boolean
  classesMissed: number
}

interface Impact {
  leaveDays: number
  perSubject: SubjectProjection[]
  overallCurrent: number
  overallProjected: number
  overallDelta: number
  overallWillBreach: boolean
  worstSubject: { code: string; name: string; projected: number; delta: number } | null
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  summary: string
}

const RISK_STYLE: Record<string, { box: string; text: string; icon: typeof Info }> = {
  LOW: { box: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', icon: ShieldCheck },
  MEDIUM: { box: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', icon: Info },
  HIGH: { box: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300', icon: AlertTriangle },
  CRITICAL: { box: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', icon: AlertTriangle },
}

/**
 * Leave impact calculator.
 *
 * Re-projects server-side on every change to `days` — the projection is never
 * computed in the browser, because the eligibility rules (per-subject
 * thresholds, observed meeting cadence, condonation) all live on the server and
 * duplicating them client-side would let the displayed number drift from the
 * number the leave is actually judged against.
 */
export function LeaveImpactCalculator({ studentId }: { studentId?: string }) {
  const [days, setDays] = useState(1)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams({ days: String(days) })
    if (studentId) qs.set('studentId', studentId)

    fetch(`/api/attendance/impact?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d.ok) {
          setImpact(d.impact)
          setError(null)
        } else {
          setError(d.error ?? 'Could not project impact')
        }
      })
      .catch(() => !cancelled && setError('Network error'))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [days, studentId])

  const style = impact ? RISK_STYLE[impact.riskLevel] : null
  const RiskIcon = style?.icon ?? Info

  return (
    <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-5 w-5 text-blue-600" />
            Leave impact calculator
          </h2>
          <p className="text-sm text-slate-500">
            See exactly what a leave costs you in attendance — before you apply.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="leave-days" className="text-sm text-slate-500">
            Days
          </label>
          <input
            id="leave-days"
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            className="w-20 rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </header>

      {error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      ) : null}

      {loading && !impact ? <p className="text-sm text-slate-500">Projecting…</p> : null}

      {impact ? (
        <div className="space-y-4">
          {/* Headline */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Now" value={`${impact.overallCurrent.toFixed(2)}%`} />
            <Metric
              label={`After ${impact.leaveDays}-day leave`}
              value={`${impact.overallProjected.toFixed(2)}%`}
              tone={impact.overallWillBreach ? 'danger' : 'ok'}
            />
            <Metric
              label="Change"
              value={`−${impact.overallDelta.toFixed(2)} pts`}
              tone={impact.overallDelta > 0 ? 'warn' : 'ok'}
            />
          </div>

          {/* Risk banner */}
          {style ? (
            <div className={`rounded-lg border p-4 ${style.box}`}>
              <div className="flex items-start gap-3">
                <RiskIcon className={`mt-0.5 h-5 w-5 shrink-0 ${style.text}`} />
                <div>
                  <h3 className={`text-sm font-semibold uppercase tracking-wide ${style.text}`}>
                    {impact.riskLevel} risk
                  </h3>
                  <p className="mt-1 text-sm">{impact.summary}</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Per-subject table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3 text-right">Now</th>
                  <th className="py-2 pr-3 text-right">After</th>
                  <th className="py-2 pr-3 text-right">Change</th>
                  <th className="py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {impact.perSubject.map((p) => (
                  <tr key={p.subjectId} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs text-slate-400">{p.code}</span>{' '}
                      <span className="font-medium">{p.name}</span>
                      {p.classesMissed > 0 ? (
                        <div className="text-xs text-slate-400">
                          {p.classesMissed} class{p.classesMissed === 1 ? '' : 'es'} missed
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{p.current.toFixed(1)}%</td>
                    <td className="py-2 pr-3 text-right font-mono font-semibold">{p.projected.toFixed(1)}%</td>
                    <td className="py-2 pr-3 text-right font-mono text-red-600">−{p.delta.toFixed(2)}</td>
                    <td className="py-2 text-right">
                      {p.willBreach ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                          Below {p.threshold}%
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          Clear
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Visual bar */}
          <div className="space-y-2 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <Bar label="Now" pct={impact.overallCurrent} tone="ok" />
            <Bar label="After leave" pct={impact.overallProjected} tone={impact.overallWillBreach ? 'danger' : 'ok'} />
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-slate-500">Threshold</span>
              <div className="relative h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="absolute -top-1 h-4 w-0.5 bg-red-500" style={{ left: '75%' }} />
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-xs text-red-600">75%</span>
            </div>
          </div>

          {impact.worstSubject ? (
            <p className="text-xs text-slate-500">
              Worst-affected subject:{' '}
              <strong>
                {impact.worstSubject.code} {impact.worstSubject.name}
              </strong>{' '}
              → {impact.worstSubject.projected.toFixed(2)}% ({impact.worstSubject.delta.toFixed(2)} pts below current)
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'danger' }) {
  const c =
    tone === 'danger' ? 'text-red-600 dark:text-red-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : ''
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold ${c}`}>{value}</div>
    </div>
  )
}

function Bar({ label, pct, tone }: { label: string; pct: number; tone: 'ok' | 'danger' }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-slate-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full ${tone === 'danger' ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-xs">{pct.toFixed(1)}%</span>
    </div>
  )
}