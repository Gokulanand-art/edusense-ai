'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Save, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'
import { Panel, Pill, Empty, GradePill } from '@/components/ui/primitives'

interface Subject { subjectId: string; code: string; name: string; credits: number; semester: number }
interface Row {
  studentId: string
  rollNumber: string
  name: string
  markId: string | null
  internal: number | null
  external: number | null
  internalMax: number
  externalMax: number
  lastGradedByMe: boolean
}
type Draft = Record<string, { internal: string; external: string }>

const GRADE_LADDER: Array<[number, string]> = [
  [90, 'O'], [80, 'A+'], [70, 'A'], [60, 'B+'], [50, 'B'], [40, 'C'], [35, 'P'], [0, 'F'],
]
function bandFor(pct: number) {
  for (const [min, letter] of GRADE_LADDER) if (pct >= min) return letter
  return 'F'
}

/**
 * Marks entry for the papers a staff member may grade.
 *
 * The editable set is fixed by the server — it returns only subjects the caller
 * owns (lecturer) or their whole department (HOD), and only students in that
 * department. This component cannot widen its own scope; it renders what the
 * API allows and posts back the same student ids.
 */
export function MarksEntry() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [draft, setDraft] = useState<Draft>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    fetch('/api/faculty/marks', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        setSubjects(d.subjects ?? [])
        if (d.subjects?.length) setSubjectId(d.subjects[0].subjectId)
        else setLoading(false)
      })
      .catch(() => { setMessage({ tone: 'error', text: 'Could not load your subjects.' }); setLoading(false) })
  }, [])

  const load = useCallback((id: string) => {
    if (!id) return
    setLoading(true)
    fetch(`/api/faculty/marks?subject=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? [])
        const next: Draft = {}
        for (const r of d.rows ?? []) {
          next[r.studentId] = {
            internal: r.internal == null ? '' : String(r.internal),
            external: r.external == null ? '' : String(r.external),
          }
        }
        setDraft(next)
        setMessage(null)
      })
      .catch(() => setMessage({ tone: 'error', text: 'Could not load the register.' }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(subjectId) }, [subjectId, load])

  const subject = useMemo(() => subjects.find((s) => s.subjectId === subjectId), [subjects, subjectId])

  /** Rows whose typed values differ from what is stored. */
  const dirty = useMemo(
    () =>
      rows.filter((r) => {
        const d = draft[r.studentId]
        if (!d) return false
        return (
          (d.internal === '' ? null : Number(d.internal)) !== r.internal ||
          (d.external === '' ? null : Number(d.external)) !== r.external
        )
      }),
    [rows, draft],
  )

  const invalid = useMemo(
    () =>
      dirty.filter((r) => {
        const d = draft[r.studentId]
        const i = d.internal === '' ? null : Number(d.internal)
        const e = d.external === '' ? null : Number(d.external)
        return (
          (i != null && (!Number.isFinite(i) || i < 0 || i > r.internalMax)) ||
          (e != null && (!Number.isFinite(e) || e < 0 || e > r.externalMax))
        );
      }).length,
    [dirty, draft],
  )

  const stats = useMemo(() => {
    const vals = rows
      .map((r) => {
        const d = draft[r.studentId]
        if (!d || (d.internal === '' && d.external === '')) return null
        const i = d.internal === '' ? 0 : Number(d.internal)
        const e = d.external === '' ? 0 : Number(d.external)
        return ((i + e) / (r.internalMax + r.externalMax)) * 100
      })
      .filter((v): v is number => v != null && Number.isFinite(v))
    if (!vals.length) return null
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    return {
      entered: vals.length,
      avg,
      failing: vals.filter((v) => v < 40).length,
      belowPass: vals.filter((v) => v < 50).length,
    }
  }, [rows, draft])

  async function save() {
    if (!dirty.length || invalid) return
    setSaving(true)
    setMessage(null)
    const entries = dirty.map((r) => {
      const d = draft[r.studentId]
      return {
        studentId: r.studentId,
        internal: d.internal === '' ? 0 : Number(d.internal),
        external: d.external === '' ? 0 : Number(d.external),
      }
    })
    try {
      const res = await fetch('/api/faculty/marks', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId, semester: subject?.semester ?? 5, entries }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ tone: 'error', text: body.error ?? 'Could not save.' })
      } else {
        setMessage({
          tone: 'ok',
          text: `Saved ${body.saved} mark${body.saved === 1 ? '' : 's'}. CGPA recomputed for ${body.recomputed.length} student${body.recomputed.length === 1 ? '' : 's'}.`,
        })
        load(subjectId)
        startTransition(() => router.refresh())
      }
    } catch {
      setMessage({ tone: 'error', text: 'Network error — nothing was saved.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading && !subjects.length) return <Empty>Loading your subjects…</Empty>

  if (!subjects.length) {
    return (
      <Panel>
        <Empty>
          You have no subjects assigned, so there are no marks to enter. Ask your head of
          department to assign papers to you.
        </Empty>
      </Panel>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <label htmlFor="subject" className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-slate-500">
            Subject
          </label>
          <select
            id="subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-slate-400"
          >
            {subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.code} — {s.name} ({s.credits} credits)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-5">
          {stats ? (
            <dl className="flex gap-5">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Entered</dt>
                <dd className="text-[15px] font-semibold tabular-nums text-slate-900">
                  {stats.entered}/{rows.length}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Average</dt>
                <dd className="text-[15px] font-semibold tabular-nums text-slate-900">
                  {stats.avg.toFixed(1)}%
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Failing</dt>
                <dd className={cn('text-[15px] font-semibold tabular-nums', stats.failing ? 'text-rose-600' : 'text-slate-900')}>
                  {stats.failing}
                </dd>
              </div>
            </dl>
          ) : null}

          <button
            onClick={save}
            disabled={!dirty.length || invalid > 0 || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : dirty.length ? `Save ${dirty.length}` : 'No changes'}
          </button>
        </div>
      </div>

      {message ? (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium',
            message.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700',
          )}
        >
          {message.tone === 'ok' ? <Check className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
          {message.text}
        </div>
      ) : null}

      {invalid > 0 ? (
        <p className="text-[12px] font-medium text-rose-600">
          {invalid} row{invalid === 1 ? ' has' : 's have'} a mark outside 0–{rows[0]?.internalMax ?? 40} /
          {rows[0]?.externalMax ?? 60}. Fix before saving.
        </p>
      ) : null}

      <Panel bodyClassName="p-0">
        {rows.length === 0 ? (
          <Empty>No students in this subject yet.</Empty>
        ) : (
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-slate-500">
                    Roll
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-slate-500">
                    Student
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-slate-500">
                    Internal /{rows[0]?.internalMax ?? 40}
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-slate-500">
                    External /{rows[0]?.externalMax ?? 60}
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-slate-500">
                    Total
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-slate-500">
                    Band
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = draft[r.studentId] ?? { internal: '', external: '' }
                  const i = d.internal === '' ? null : Number(d.internal)
                  const e = d.external === '' ? null : Number(d.external)
                  const total = i != null && e != null ? i + e : null
                  const max = r.internalMax + r.externalMax
                  const pct = total != null ? (total / max) * 100 : null
                  const isDirty =
                    (i !== r.internal || e !== r.external) &&
                    !(i == null && e == null && r.internal == null && r.external == null)
                  const badI = i != null && (!Number.isFinite(i) || i < 0 || i > r.internalMax)
                  const badE = e != null && (!Number.isFinite(e) || e < 0 || e > r.externalMax)

                  return (
                    <tr key={r.studentId} className="transition-colors hover:bg-slate-50/70">
                      <td className="border-b border-slate-100 px-3 py-1.5 font-medium text-slate-900 tabular-nums">
                        {r.rollNumber}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-1.5">
                        {r.name}
                        {isDirty ? (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                            edited
                          </span>
                        ) : null}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-1.5 text-right">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={d.internal}
                          onChange={(ev) =>
                            setDraft((prev) => ({
                              ...prev,
                              [r.studentId]: { ...prev[r.studentId], internal: ev.target.value },
                            }))
                          }
                          placeholder="—"
                          className={cn(
                            'w-16 rounded-md border px-2 py-1 text-right text-[13px] tabular-nums outline-none',
                            badI ? 'border-rose-400 bg-rose-50' : 'border-slate-200 focus:border-slate-400',
                          )}
                        />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-1.5 text-right">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={d.external}
                          onChange={(ev) =>
                            setDraft((prev) => ({
                              ...prev,
                              [r.studentId]: { ...prev[r.studentId], external: ev.target.value },
                            }))
                          }
                          placeholder="—"
                          className={cn(
                            'w-16 rounded-md border px-2 py-1 text-right text-[13px] tabular-nums outline-none',
                            badE ? 'border-rose-400 bg-rose-50' : 'border-slate-200 focus:border-slate-400',
                          )}
                        />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums text-slate-900">
                        {total == null ? '—' : total}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-1.5 text-right">
                        {pct == null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <GradePill band={bandFor(pct)} />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-[12px] text-slate-500">
        Saving recomputes each affected student&apos;s SGPA and cumulative CGPA immediately, and
        records you as the grader. Students see the new result as soon as it is saved.
      </p>
    </div>
  )
}
