import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import {
  Panel,
  Section,
  Stat,
  TableShell,
  Th,
  Td,
  Tr,
  Pill,
  Meter,
  Empty,
} from '@/components/ui/primitives'
import { attendanceImpact, type AttendanceStatus } from '@/lib/services/attendance-impact'
import type { QueryFn } from '@/lib/db'

const STATUS_STYLE: Record<AttendanceStatus, { label: string; className: string }> = {
  PRESENT: { label: 'Present', className: 'text-emerald-700' },
  LATE: { label: 'Late', className: 'text-emerald-700' },
  ABSENT: { label: 'Absent', className: 'text-rose-600' },
  HALF_DAY: { label: 'Half day', className: 'text-amber-600' },
  ON_DUTY: { label: 'On duty', className: 'text-slate-500' },
  EXCUSED: { label: 'Excused', className: 'text-slate-500' },
}

/**
 * Attendance status with the consequence attached.
 *
 * Each row is one class: what happened, the running percentage either side of
 * it, and the points it moved. The point of the view is that a student can see
 * an absence cost them something specific rather than just being "below 75%".
 */
export async function ImpactView({ studentId, q }: { studentId: string; q: QueryFn }) {
  const im = await attendanceImpact(studentId, { q })

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Panel title="Where you stand" description="Running total across the register" className="lg:col-span-2">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">
                Overall attendance
              </p>
              <p
                className={`mt-1.5 text-[38px] font-semibold leading-none tracking-tight tabular-nums ${
                  im.isBelowThreshold ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {im.percentage.toFixed(2)}%
              </p>
            </div>
            <div className="min-w-[220px] flex-1">
              <Meter value={im.percentage} threshold={im.threshold} />
              <p className="mt-2 text-[12px] text-slate-500">
                {im.attended} attended · {im.absent} absent
                {im.excused ? ` · ${im.excused} excused` : ''} of {im.held} held
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
            <div className="flex items-start gap-2.5">
              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
              <div>
                <p className="text-[12px] font-medium text-slate-900">
                  Attend the next class
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {im.nextPresent.pct.toFixed(2)}%{' '}
                  <span className="font-semibold text-emerald-600">
                    ({im.nextPresent.delta >= 0 ? '+' : ''}
                    {im.nextPresent.delta} pp)
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" strokeWidth={2} />
              <div>
                <p className="text-[12px] font-medium text-slate-900">Miss the next class</p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {im.nextAbsent.pct.toFixed(2)}%{' '}
                  <span className="font-semibold text-rose-600">
                    ({im.nextAbsent.delta} pp)
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} />
              <div>
                <p className="text-[12px] font-medium text-slate-900">
                  {im.sessionsToThreshold
                    ? `${im.sessionsToThreshold} in a row to clear`
                    : 'Already clear'}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {im.sessionsToThreshold
                    ? `consecutive attendances to reach ${im.threshold}%`
                    : `holding above ${im.threshold}%`}
                </p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="By subject" description="Weakest first">
          <div className="space-y-3">
            {im.subjects.map((s) => (
              <div key={s.subjectId}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium text-slate-800">{s.code}</span>
                  <span className="text-[11px] tabular-nums text-slate-500">
                    {s.attended}/{s.held}
                  </span>
                </div>
                <div className="mt-1">
                  <Meter value={s.percentage} threshold={im.threshold} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Section
        title="Class by class"
        description={`Each row is one session: the running percentage before and after it, and the points it moved${
          im.recentTruncated ? ` · showing the ${im.recent.length} most recent of ${im.held}` : ''
        }`}
      >
        <Panel bodyClassName="p-0">
          {im.recent.length === 0 ? (
            <Empty>No attendance recorded yet.</Empty>
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Subject</Th>
                  <Th>Status</Th>
                  <Th align="right">Before</Th>
                  <Th align="right">After</Th>
                  <Th align="right">Change</Th>
                </tr>
              </thead>
              <tbody>
                {im.recent.map((s) => {
                  const style = STATUS_STYLE[s.status]
                  return (
                    <Tr key={s.id}>
                      <Td className="whitespace-nowrap tabular-nums text-slate-600">{s.date}</Td>
                      <Td>
                        <span className="font-medium text-slate-900">{s.subjectCode}</span>{' '}
                        <span className="text-slate-500">{s.subjectName}</span>
                      </Td>
                      <Td>
                        <span className={style.className}>{style.label}</span>
                      </Td>
                      <Td align="right" className="text-slate-500">
                        {s.heldBefore > 0 ? `${s.pctBefore.toFixed(1)}%` : '—'}
                      </Td>
                      <Td align="right" className="font-medium text-slate-900">
                        {s.pctAfter.toFixed(1)}%
                      </Td>
                      <Td align="right">
                        {s.neutral ? (
                          <span className="text-slate-400">no effect</span>
                        ) : s.delta > 0 ? (
                          <span className="font-semibold text-emerald-600">
                            +{s.delta} pp
                          </span>
                        ) : s.delta < 0 ? (
                          <span className="font-semibold text-rose-600">{s.delta} pp</span>
                        ) : (
                          <span className="text-slate-400">0 pp</span>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </TableShell>
          )}
        </Panel>
      </Section>

      <Section
        title="Day by day"
        description={`Net movement across each date${
          im.daysTruncated ? ` · showing the ${im.days.length} most recent of ${im.days.length + 1}+` : ''
        }`}
      >
        <Panel bodyClassName="p-0">
          <TableShell>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th align="right">Classes</Th>
                <Th align="right">Present</Th>
                <Th align="right">Absent</Th>
                <Th align="right">Excused</Th>
                <Th align="right">That day</Th>
                <Th align="right">Running</Th>
              </tr>
            </thead>
            <tbody>
              {im.days.map((d) => (
                <Tr key={d.date}>
                  <Td className="whitespace-nowrap font-medium text-slate-900 tabular-nums">
                    {d.date}
                  </Td>
                  <Td align="right">{d.held}</Td>
                  <Td align="right" className="text-emerald-700">{d.present}</Td>
                  <Td align="right" className={d.absent ? 'font-semibold text-rose-600' : ''}>
                    {d.absent}
                  </Td>
                  <Td align="right" className="text-slate-500">{d.excused}</Td>
                  <Td align="right">
                    {d.delta === 0 ? (
                      <span className="text-slate-400">no change</span>
                    ) : d.delta > 0 ? (
                      <span className="font-semibold text-emerald-600">+{d.delta} pp</span>
                    ) : (
                      <span className="font-semibold text-rose-600">{d.delta} pp</span>
                    )}
                  </Td>
                  <Td align="right" className="tabular-nums text-slate-600">
                    {d.pctAfter.toFixed(1)}%
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>
      </Section>
    </div>
  )
}
