import { redirect } from 'next/navigation'
import {
  Award,
  CalendarCheck,
  CalendarPlus,
  FileCheck2,
  LayoutDashboard,
} from 'lucide-react'
import { formatDate } from '@/lib/utils/helpers'
import { getCurrentUser, roleHome } from '@/lib/auth'
import { getDb } from '@/lib/db'
import {
  getOverallAttendance,
  getSubjectAttendance,
  examEligibility,
  listLeaves,
} from '@/lib/services/attendance'
import { getMarks, getCgpaHistory } from '@/lib/services/marks'
import { AppShell, type NavItem } from '@/components/shell/AppShell'
import { SectionTabs } from '@/components/shell/SectionTabs'
import {
  Section,
  Panel,
  Stat,
  StatRow,
  Pill,
  GradePill,
  Meter,
  TableShell,
  Th,
  Td,
  Tr,
  Empty,
} from '@/components/ui/primitives'
import { AttendanceRing } from '@/components/charts/charts'
import { LeaveForm } from '@/components/attendance/LeaveForm'
import { ImpactView } from '@/components/student/ImpactView'

export const dynamic = 'force-dynamic'

export default async function StudentPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'STUDENT') redirect(roleHome(user.role))
  if (!user.studentId) redirect('/login')

  const sid = user.studentId

  // One adapter handle for the whole render — several PGlite handles on the
  // same data dir is a classic source of intermittent WASM aborts.
  const db = await getDb()
  const q = db.query

  const [profile, overall, subjects, eligibility, leaves, marks, cgpa] = await Promise.all([
    q<{ roll_number: string; current_semester: number; father_name: string | null; phone: string | null }>(
      `SELECT s.roll_number, s.current_semester, s.father_name, u.phone
         FROM students s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1`,
      [sid],
    ).then((r) => r.rows[0]),
    getOverallAttendance(sid, q),
    getSubjectAttendance(sid, undefined, q),
    examEligibility(sid, q),
    listLeaves({ studentId: sid, limit: 20 }, q),
    getMarks(sid, undefined, q),
    getCgpaHistory(sid, q),
  ])

  const cgpaLatest = (cgpa as any[])?.[0] ?? null
  const cgpaNow = cgpaLatest?.cgpa ?? null
  const blocked = overall.subjectsAtRisk.length
  const trendPoints = await q<any>(
    `SELECT to_char(date_trunc('week', a.class_date), 'DD-Mon') AS label,
            ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))
                  / NULLIF(COUNT(*), 0), 2) AS pct
       FROM attendance a
      WHERE a.student_id = $1 AND a.class_date >= CURRENT_DATE - INTERVAL '56 days'
      GROUP BY 1 ORDER BY 1`,
    [sid],
  )

  const nav: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'attendance', label: 'Attendance', icon: 'calendar' },
    { id: 'impact', label: 'Impact', icon: 'trending' },
    { id: 'marks', label: 'Marks', icon: 'award' },
    { id: 'leave', label: 'Leave', icon: 'calendarPlus' },
  ]
  const tabs = nav.map((n) => n.id)

  const attendanceTone = overall.effectivePercentage < overall.threshold ? 'danger' : 'ok'

  return (
    <AppShell
      sectionTitle="Student portal"
      user={{
        name: `${user.firstName} ${user.lastName}`,
        role: `Student · semester ${profile?.current_semester ?? '—'}`,
        meta: profile?.roll_number ?? '',
        initials: `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase(),
      }}
      nav={nav}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            Your semester at a glance
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {profile?.roll_number} · semester {profile?.current_semester}
          </p>
        </div>

        <StatRow>
          <Stat
            label="Overall attendance"
            value={`${overall.effectivePercentage.toFixed(1)}%`}
            tone={attendanceTone === 'ok' ? 'ok' : 'danger'}
            hint={`threshold ${overall.threshold}% · ${overall.attended}/${overall.held} classes`}
          />
          <Stat
            label="CGPA"
            value={cgpaNow == null ? '—' : Number(cgpaNow).toFixed(2)}
            hint={`out of 10 · semester ${cgpaLatest?.semester ?? '—'}`}
          />
          <Stat
            label="Subjects below 75%"
            value={blocked}
            tone={blocked > 0 ? 'danger' : 'ok'}
            hint={blocked > 0 ? 'registration blocked' : 'all clear'}
          />
          <Stat
            label="Pending leave"
            value={(leaves as any[]).filter((l) => l.status === 'PENDING').length}
            hint={`${(leaves as any[]).length} applications total`}
          />
        </StatRow>

        <div className="mt-9">
          <SectionTabs tabs={tabs}>
            {/* ------------------------------------------------------ overview */}
            <div data-tab="overview" className="grid items-start gap-5 lg:grid-cols-3">
              <Panel className="lg:col-span-1">
                <div className="flex flex-col items-center gap-3 py-2">
                  <AttendanceRing pct={overall.effectivePercentage} threshold={overall.threshold} label="overall attendance" />
                  <div className="text-center">
                    <p className="text-[13px] font-medium text-slate-900">
                      {overall.attended} of {overall.held} classes attended
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {overall.absent} absent
                      {overall.excused > 0 ? ` · ${overall.excused} excused` : ''}
                    </p>
                    {overall.condonedPct > 0 ? (
                      <p className="mt-0.5 text-[12px] text-emerald-600">
                        +{overall.condonedPct.toFixed(2)}% condonation applied
                      </p>
                    ) : null}
                  </div>
                  <Pill severity={overall.isEligibleForExam ? 'ok' : 'critical'}>
                    {overall.isEligibleForExam ? 'Eligible for exams' : 'Not exam-eligible'}
                  </Pill>
                </div>
              </Panel>

              <Panel title="Weekly trend" description="Last eight weeks" className="lg:col-span-2" bodyClassName="p-5">
                <div className="flex items-end gap-2 overflow-x-auto pb-1">
                  {trendPoints.rows.map((t: any, i: number) => (
                    <div key={i} className="flex min-w-[46px] flex-1 flex-col items-center gap-1.5">
                      <div className="flex h-28 w-full items-end">
                        <div
                          className={`w-full rounded-t ${Number(t.pct) < 75 ? 'bg-rose-400' : 'bg-slate-800'}`}
                          style={{ height: `${Math.max(2, Number(t.pct))}%` }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-slate-600">{Number(t.pct).toFixed(0)}%</span>
                      <span className="text-[10px] text-slate-400">{t.label}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* ----------------------------------------------------- attendance */}
            <div data-tab="attendance">
              <Section title="Attendance by subject" description="Effective percentage includes approved condonation">
                <div className="space-y-5">
                  <Panel bodyClassName="p-0">
                    <TableShell>
                      <thead>
                        <tr>
                          <Th>Code</Th>
                          <Th>Subject</Th>
                          <Th align="right">Held</Th>
                          <Th align="right">Attended</Th>
                          <Th align="right">Absent</Th>
                          <Th className="w-48">Effective</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjects.map((s: any) => (
                          <Tr key={s.subjectId}>
                            <Td className="font-medium text-slate-900">{s.code}</Td>
                            <Td>{s.name}</Td>
                            <Td align="right">{s.held}</Td>
                            <Td align="right">{s.attended}</Td>
                            <Td align="right">{s.absent}</Td>
                            <Td><Meter value={s.effectivePercentage} threshold={s.threshold} /></Td>
                            <Td>
                              {s.isBelowThreshold ? (
                                <Pill severity="critical">Blocked</Pill>
                              ) : s.effectivePercentage < 80 ? (
                                <Pill severity="high">At risk</Pill>
                              ) : (
                                <Pill severity="ok">Clear</Pill>
                              )}
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </TableShell>
                  </Panel>

                  <Panel title="Exam eligibility" description="Per subject, with the shortfall spelled out">
                    <div className="space-y-3">
                      {(eligibility as any[]).map((e) => (
                        <div key={e.subjectId} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-slate-800">
                              {e.code}
                              <span className="ml-2 font-normal text-slate-500">{e.name}</span>
                            </p>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{e.reason}</p>
                          </div>
                          <Pill severity={e.status === 'CLEARED' ? 'ok' : 'high'}>
                            {e.status === 'CLEARED' ? 'Cleared' : 'Blocked'}
                          </Pill>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              </Section>
            </div>

            {/* -------------------------------------------------------- impact */}
            <div data-tab="impact">
              <Section
                title="Attendance impact"
                description="What each class actually cost or gained you"
              >
                <ImpactView studentId={sid} q={q} />
              </Section>
            </div>

            {/* --------------------------------------------------------- marks */}
            <div data-tab="marks">
              <Section title="Marks" description="Published internal and external results">
                <Panel bodyClassName="p-0">
                  {(marks as any[]).length === 0 ? (
                    <Empty>No marks published yet.</Empty>
                  ) : (
                    <TableShell>
                      <thead>
                        <tr>
                          <Th>Code</Th>
                          <Th>Subject</Th>
                          <Th align="right">Credits</Th>
                          <Th align="right">Internal /40</Th>
                          <Th align="right">External /60</Th>
                          <Th align="right">Total</Th>
                          <Th align="right">Band</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(marks as any[]).map((m) => (
                          <Tr key={m.id}>
                            <Td className="font-medium text-slate-900">{m.code}</Td>
                            <Td>{m.name}</Td>
                            <Td align="right">{m.credits}</Td>
                            <Td align="right">{m.internal}</Td>
                            <Td align="right">{m.external}</Td>
                            <Td align="right" className="font-semibold text-slate-900">
                              {m.total}
                              <span className="font-normal text-slate-400">/{m.max}</span>
                            </Td>
                            <Td align="right"><GradePill band={m.grade} /></Td>
                          </Tr>
                        ))}
                      </tbody>
                    </TableShell>
                  )}
                </Panel>
              </Section>
            </div>

            {/* --------------------------------------------------------- leave */}
            <div data-tab="leave">
              <Section title="Leave" description="Apply for leave and track decisions">
                <div className="grid items-start gap-5 lg:grid-cols-2">
                  <Panel title="Apply for leave" description="You will see the projected impact before submitting">
                    <LeaveForm studentId={sid} />
                  </Panel>
                  <Panel title="History" bodyClassName="p-0">
                    {(leaves as any[]).length === 0 ? (
                      <Empty>No leave applications yet.</Empty>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {(leaves as any[]).map((l) => (
                          <div key={l.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-slate-900">
                                {String(l.leave_type).replace(/_/g, ' ')}
                                <span className="ml-2 font-normal text-slate-500">
                                  {l.no_of_days}d · {formatDate(l.start_date)} → {formatDate(l.end_date)}
                                </span>
                              </p>
                              <p className="mt-0.5 text-[12px] text-slate-500">{l.reason}</p>
                            </div>
                            <Pill severity={l.status === 'APPROVED' ? 'ok' : l.status === 'REJECTED' ? 'critical' : 'watch'}>
                              {l.status}
                            </Pill>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                </div>
              </Section>
            </div>
          </SectionTabs>
        </div>

        <p className="mt-10 flex items-center gap-1.5 border-t border-slate-200 pt-5 text-[12px] text-slate-400">
          <FileCheck2 className="h-3.5 w-3.5" />
          Attendance is recorded from the register. Condonation is the only adjustment applied to a percentage.
        </p>
      </div>
    </AppShell>
  )
}
