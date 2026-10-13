import { redirect } from 'next/navigation'
import {
  BookOpenCheck,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Users,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import {
  deptKpis,
  deptSubjects,
  deptAtRisk,
  deptLeaves,
  deptFaculty,
  deptTrend,
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
  GradePill,
  Meter,
  TableShell,
  Th,
  Td,
  Tr,
  Empty,
} from '@/components/ui/primitives'
import { TrendChart, DistributionBars } from '@/components/charts/charts'
import { LeaveDecision } from '@/components/dept/LeaveDecision'

export const dynamic = 'force-dynamic'

export default async function HodPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'HOD') redirect('/dashboard/faculty')
  if (!user.departmentId) redirect('/login')

  const db = await getDb()
  const q = db.query
  const deptId = user.departmentId

  const [kpis, subjects, trend, faculty, atRisk, leaves] = await Promise.all([
    deptKpis(deptId, null, q),
    deptSubjects(deptId, null, q),
    deptTrend(deptId, 8, null, q),
    deptFaculty(deptId, q),
    deptAtRisk(deptId, null, q),
    deptLeaves(deptId, 'PENDING', q),
  ])

  const accent = kpis.avgAttendance < 75 ? 'danger' : kpis.avgAttendance < 80 ? 'warn' : 'ok'

  const nav: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'students', label: 'Students', icon: 'users' },
    { id: 'attendance', label: 'Attendance', icon: 'calendar' },
    { id: 'subjects', label: 'Subjects', icon: 'books' },
    { id: 'faculty', label: 'Faculty', icon: 'graduation' },
    { id: 'marks', label: 'Marks entry', icon: 'award' },
    { id: 'leaves', label: 'Leave queue', icon: 'clipboard', badge: leaves.length },
  ]
  const tabs = nav.map((n) => n.id)

  const riskItems = [
    { label: 'Critical', count: atRisk.filter((r) => r.severity === 'CRITICAL').length, tone: 'danger' as const },
    { label: 'High', count: atRisk.filter((r) => r.severity === 'HIGH').length, tone: 'warn' as const },
    { label: 'Watch', count: atRisk.filter((r) => r.severity === 'WATCH').length, tone: 'info' as const },
  ]

  return (
    <AppShell
      sectionTitle={`${user.departmentCode} department`}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        role: 'Head of Department',
        meta: `${user.departmentCode} · semester 5`,
        initials: `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase(),
      }}
      nav={nav}
    >
      <div className="mx-auto max-w-5xl">
        {/* Page identity + the headline figures stay put across every tab: they
            are the context you read any section against. */}
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            Department overview
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Semester 5 · {kpis.students} students · {subjects.length} subjects ·{' '}
            {faculty.length} staff
          </p>
        </div>

        <StatRow>
          <Stat label="Students" value={kpis.students} hint={`${kpis.fullyEligible} fully exam-eligible`} />
          <Stat
            label="Avg attendance"
            value={`${Number(kpis.avgAttendance).toFixed(1)}%`}
            tone={accent === 'danger' ? 'danger' : accent === 'warn' ? 'warn' : 'ok'}
            hint="threshold 75%"
          />
          <Stat
            label="Below 75%"
            value={kpis.atRisk}
            tone={kpis.atRisk > 0 ? 'warn' : 'ok'}
            hint={`${kpis.blockedSubjects} registrations blocked`}
          />
          <Stat
            label="Pending leave"
            value={kpis.pendingLeaves}
            tone={kpis.pendingLeaves > 0 ? 'warn' : 'ok'}
            hint={`avg CGPA ${Number(kpis.avgCgpa).toFixed(2)}`}
          />
        </StatRow>

        <div className="mt-9">
          <SectionTabs tabs={tabs}>
            {/* ------------------------------------------------------ overview */}
            <div data-tab="overview" className="space-y-6">
              <div className="grid items-start gap-5 lg:grid-cols-3">
                <Panel title="Attendance trend" description="Weekly, whole department" className="lg:col-span-2">
                  <TrendChart points={trend.map((t) => ({ label: t.week, pct: Number(t.overall) }))} threshold={75} />
                </Panel>
                <Panel title="At-risk spread" description="Overall attendance under 85%">
                  <DistributionBars items={riskItems} />
                  <p className="mt-5 border-t border-slate-100 pt-4 text-[12px] leading-relaxed text-slate-500">
                    A student enters the watchlist when overall attendance falls below 85%.
                    Registration is blocked only below 75% in a single subject.
                  </p>
                </Panel>
              </div>

              <Panel title="Subject performance" description="All subjects in the department" bodyClassName="p-0">
                <TableShell>
                  <thead>
                    <tr>
                      <Th>Code</Th>
                      <Th>Subject</Th>
                      <Th align="right">Students</Th>
                      <Th className="w-44">Attendance</Th>
                      <Th align="right">Avg marks</Th>
                      <Th align="right">Pass rate</Th>
                      <Th align="right">At risk</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s: any) => (
                      <Tr key={s.subjectId}>
                        <Td className="font-medium text-slate-900">{s.code}</Td>
                        <Td>{s.name}</Td>
                        <Td align="right">{s.students}</Td>
                        <Td><Meter value={Number(s.avgAttendance)} threshold={75} /></Td>
                        <Td align="right">{Number(s.avgMarks).toFixed(1)}%</Td>
                        <Td align="right">{Number(s.passRate).toFixed(1)}%</Td>
                        <Td align="right" className={s.atRisk > 0 ? 'font-semibold text-amber-600' : ''}>{s.atRisk}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableShell>
              </Panel>
            </div>

            {/* ------------------------------------------------------ students */}
            <div data-tab="students">
              <Section
                title="Students needing attention"
                description="Overall attendance under 85%, worst first"
              >
                <Panel bodyClassName="p-0">
                  {atRisk.length === 0 ? (
                    <Empty>No students below the watch threshold.</Empty>
                  ) : (
                    <div className="max-h-[560px] overflow-y-auto">
                      <TableShell>
                        <thead className="sticky top-0 bg-white">
                          <tr>
                            <Th>Roll</Th>
                            <Th>Student</Th>
                            <Th className="w-40">Overall</Th>
                            <Th align="right">Below 75%</Th>
                            <Th>Weakest</Th>
                            <Th align="right">CGPA</Th>
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
                              <Td align="right">{s.cgpa == null ? '—' : Number(s.cgpa).toFixed(2)}</Td>
                              <Td>
                                <Pill severity={s.severity === 'CRITICAL' ? 'critical' : s.severity === 'HIGH' ? 'high' : 'watch'}>
                                  {s.severity}
                                </Pill>
                              </Td>
                            </Tr>
                          ))}
                        </tbody>
                      </TableShell>
                    </div>
                  )}
                </Panel>
              </Section>
            </div>

            {/* ---------------------------------------------------- attendance */}
            <div data-tab="attendance">
              <Section title="Attendance" description="Register trend for the whole department">
                <div className="space-y-5">
                  <Panel title="Weekly trend" description="Trailing eight weeks" bodyClassName="p-5">
                    <TrendChart points={trend.map((t) => ({ label: t.week, pct: Number(t.overall) }))} threshold={75} height={200} />
                  </Panel>
                  <Panel title="By subject" description="Aggregate register for each paper" bodyClassName="p-0">
                    <TableShell>
                      <thead>
                        <tr>
                          <Th>Code</Th>
                          <Th>Subject</Th>
                          <Th className="w-48">Attendance</Th>
                          <Th align="right">At risk</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjects.map((s: any) => (
                          <Tr key={s.subjectId}>
                            <Td className="font-medium text-slate-900">{s.code}</Td>
                            <Td>{s.name}</Td>
                            <Td><Meter value={Number(s.avgAttendance)} threshold={75} /></Td>
                            <Td align="right" className={s.atRisk > 0 ? 'font-semibold text-amber-600' : ''}>{s.atRisk}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </TableShell>
                  </Panel>
                </div>
              </Section>
            </div>

            {/* ------------------------------------------------------ subjects */}
            <div data-tab="subjects">
              <Section title="Subject performance" description="Marks and pass rate across the department">
                <Panel bodyClassName="p-0">
                  <TableShell>
                    <thead>
                      <tr>
                        <Th>Code</Th>
                        <Th>Subject</Th>
                        <Th align="right">Students</Th>
                        <Th className="w-44">Attendance</Th>
                        <Th align="right">Avg marks</Th>
                        <Th align="right">Pass rate</Th>
                        <Th align="right">At risk</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map((s: any) => (
                        <Tr key={s.subjectId}>
                          <Td className="font-medium text-slate-900">{s.code}</Td>
                          <Td>{s.name}</Td>
                          <Td align="right">{s.students}</Td>
                          <Td><Meter value={Number(s.avgAttendance)} threshold={75} /></Td>
                          <Td align="right">{Number(s.avgMarks).toFixed(1)}%</Td>
                          <Td align="right">{Number(s.passRate).toFixed(1)}%</Td>
                          <Td align="right" className={s.atRisk > 0 ? 'font-semibold text-amber-600' : ''}>{s.atRisk}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </TableShell>
                </Panel>
              </Section>
            </div>

            {/* ------------------------------------------------------- faculty */}
            <div data-tab="faculty">
              <Section title="Faculty" description="Teaching in this department">
                <Panel bodyClassName="p-0">
                  <TableShell>
                    <thead>
                      <tr>
                        <Th>Name</Th>
                        <Th>Designation</Th>
                        <Th align="right">Subjects</Th>
                        <Th>Employee ID</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {faculty.map((f: any) => (
                        <Tr key={f.facultyId}>
                          <Td className="font-medium text-slate-900">{f.name}</Td>
                          <Td className="text-slate-500">{f.designation}</Td>
                          <Td align="right">
                            {f.subjects}
                            {f.isHod ? <span className="ml-2 text-[11px] font-medium text-slate-500">HOD</span> : null}
                          </Td>
                          <Td className="tabular-nums text-slate-500">{f.employeeId}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </TableShell>
                </Panel>
              </Section>
            </div>

            {/* --------------------------------------------------------- marks */}
            <div data-tab="marks">
              <Section
                title="Marks entry"
                description="Enter marks for any subject in your department"
              >
                <MarksEntry />
              </Section>
            </div>

            {/* -------------------------------------------------------- leaves */}
            <div data-tab="leaves">
              <Section title="Leave approvals" description="Awaiting your decision">
                <Panel bodyClassName="p-0">
                  {leaves.length === 0 ? (
                    <Empty>Nothing waiting for approval.</Empty>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {leaves.map((l: any) => (
                        <LeaveDecision key={l.id} leave={l} />
                      ))}
                    </div>
                  )}
                </Panel>
              </Section>
            </div>
          </SectionTabs>
        </div>
      </div>
    </AppShell>
  )
}
