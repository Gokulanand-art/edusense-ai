import { redirect } from 'next/navigation'
import { BookOpenCheck, CalendarCheck, LayoutDashboard, Users } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import {
  deptKpis,
  deptSubjects,
  deptAtRisk,
  deptTrend,
  facultySubjects,
} from '@/lib/services/department'
import { AppShell, type NavItem } from '@/components/shell/AppShell'
import { SectionTabs } from '@/components/shell/SectionTabs'
import { MarksEntry } from '@/components/faculty/MarksEntry'
import {
  Section,
  Panel,
  Stat,
  StatRow,
  Pill,
  Meter,
  TableShell,
  Th,
  Td,
  Tr,
  Empty,
} from '@/components/ui/primitives'
import { TrendChart, DistributionBars } from '@/components/charts/charts'

export const dynamic = 'force-dynamic'

export default async function FacultyPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'FACULTY') redirect('/dashboard/hod')
  if (!user.departmentId || !user.facultyId) redirect('/login')

  const db = await getDb()
  const q = db.query

  // A lecturer sees their own papers. departmentId still scopes the roster;
  // subjectIds narrows every aggregate to the subjects they actually teach.
  const mine = await facultySubjects(user.facultyId, q)
  const subjectIds = mine.map((s) => s.subjectId)

  const [kpis, subjects, trend, atRisk] = await Promise.all([
    deptKpis(user.departmentId, subjectIds, q),
    deptSubjects(user.departmentId, subjectIds, q),
    deptTrend(user.departmentId, 8, subjectIds, q),
    deptAtRisk(user.departmentId, subjectIds, q),
  ])

  const nav: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'students', label: 'My students', icon: 'users' },
    { id: 'attendance', label: 'Attendance', icon: 'calendar' },
    { id: 'subjects', label: 'My subjects', icon: 'books' },
    { id: 'marks', label: 'Marks entry', icon: 'award' },
  ]
  const tabs = nav.map((n) => n.id)

  const accent = kpis.avgAttendance < 75 ? 'danger' : kpis.avgAttendance < 80 ? 'warn' : 'ok'

  return (
    <AppShell
      sectionTitle={`${user.departmentCode} department`}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        role: 'Faculty',
        meta: `${mine.length} subject${mine.length === 1 ? '' : 's'} · ${user.departmentCode}`,
        initials: `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase(),
      }}
      nav={nav}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            Teaching overview
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {mine.length > 0 ? mine.map((m) => m.code).join(' · ') : 'No subjects assigned yet'}
          </p>
        </div>

        {mine.length === 0 ? (
          <Panel>
            <Empty>
              You have no subjects assigned, so there is nothing to report on yet. Ask your head
              of department to assign papers to you.
            </Empty>
          </Panel>
        ) : (
          <>
            <StatRow>
              <Stat label="My subjects" value={subjects.length} hint={`${kpis.students} students in department`} />
              <Stat
                label="Attendance, my papers"
                value={`${Number(kpis.avgAttendance).toFixed(1)}%`}
                tone={accent === 'danger' ? 'danger' : accent === 'warn' ? 'warn' : 'ok'}
                hint="threshold 75%"
              />
              <Stat label="At risk" value={atRisk.length} tone={atRisk.length > 0 ? 'warn' : 'ok'} hint="overall under 85%" />
              <Stat
                label="Below 75%"
                value={kpis.atRisk}
                tone={kpis.atRisk > 0 ? 'warn' : 'ok'}
                hint={`${kpis.blockedSubjects} registrations blocked`}
              />
            </StatRow>

            <div className="mt-9">
              <SectionTabs tabs={tabs}>
                <div data-tab="overview" className="grid items-start gap-5 lg:grid-cols-3">
                  <Panel title="Attendance trend" description="Weekly, across your subjects" className="lg:col-span-2">
                    <TrendChart points={trend.map((t) => ({ label: t.week, pct: Number(t.overall) }))} threshold={75} />
                  </Panel>
                  <Panel title="Risk spread" description="Across your subjects">
                    <DistributionBars
                      items={[
                        { label: 'Critical', count: atRisk.filter((r) => r.severity === 'CRITICAL').length, tone: 'danger' },
                        { label: 'High', count: atRisk.filter((r) => r.severity === 'HIGH').length, tone: 'warn' },
                        { label: 'Watch', count: atRisk.filter((r) => r.severity === 'WATCH').length, tone: 'info' },
                      ]}
                    />
                  </Panel>
                </div>

                <div data-tab="students">
                  <Section title="Students needing attention" description="Across your subjects only, worst first">
                    <Panel bodyClassName="p-0">
                      {atRisk.length === 0 ? (
                        <Empty>No students in your cohort are below the watch threshold.</Empty>
                      ) : (
                        <TableShell>
                          <thead>
                            <tr>
                              <Th>Roll</Th>
                              <Th>Student</Th>
                              <Th className="w-40">Overall</Th>
                              <Th align="right">Below 75%</Th>
                              <Th>Weakest</Th>
                              <Th>Status</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {atRisk.map((s) => (
                              <Tr key={s.studentId}>
                                <Td className="font-medium text-slate-900">{s.rollNumber}</Td>
                                <Td>{s.name}</Td>
                                <Td><Meter value={Number(s.overall)} threshold={75} /></Td>
                                <Td align="right" className={s.belowSubjects > 0 ? 'font-semibold text-rose-600' : ''}>
                                  {s.belowSubjects}
                                </Td>
                                <Td className="text-slate-500">
                                  {s.worst ? `${s.worst.code} · ${Number(s.worst.pct).toFixed(0)}%` : '—'}
                                </Td>
                                <Td>
                                  <Pill severity={s.severity === 'CRITICAL' ? 'critical' : s.severity === 'HIGH' ? 'high' : 'watch'}>
                                    {s.severity}
                                  </Pill>
                                </Td>
                              </Tr>
                            ))}
                          </tbody>
                        </TableShell>
                      )}
                    </Panel>
                  </Section>
                </div>

                <div data-tab="attendance">
                  <Section title="Attendance" description="Register trend across your papers">
                    <Panel bodyClassName="p-5">
                      <TrendChart points={trend.map((t) => ({ label: t.week, pct: Number(t.overall) }))} threshold={75} height={220} />
                    </Panel>
                  </Section>
                </div>

                <div data-tab="subjects">
                  <Section title="My subjects" description="Only the papers assigned to you">
                    <Panel bodyClassName="p-0">
                      <TableShell>
                        <thead>
                          <tr>
                            <Th>Code</Th>
                            <Th>Subject</Th>
                            <Th align="right">Credits</Th>
                            <Th align="right">Students</Th>
                            <Th className="w-44">Attendance</Th>
                            <Th align="right">Avg marks</Th>
                            <Th align="right">At risk</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {subjects.map((s: any) => (
                            <Tr key={s.subjectId}>
                              <Td className="font-medium text-slate-900">{s.code}</Td>
                              <Td>{s.name}</Td>
                              <Td align="right">{s.credits}</Td>
                              <Td align="right">{s.students}</Td>
                              <Td><Meter value={Number(s.avgAttendance)} threshold={75} /></Td>
                              <Td align="right">{Number(s.avgMarks).toFixed(1)}%</Td>
                              <Td align="right" className={s.atRisk > 0 ? 'font-semibold text-amber-600' : ''}>{s.atRisk}</Td>
                            </Tr>
                          ))}
                        </tbody>
                      </TableShell>
                    </Panel>
                  </Section>
                </div>
                <div data-tab="marks">
                  <Section
                    title="Marks entry"
                    description="Enter internal and external marks for the papers you teach"
                  >
                    <MarksEntry />
                  </Section>
                </div>
              </SectionTabs>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
