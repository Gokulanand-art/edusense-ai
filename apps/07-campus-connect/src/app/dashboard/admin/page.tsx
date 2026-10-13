import { redirect } from 'next/navigation'
import { Building2, LayoutDashboard, ShieldCheck } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { AppShell, type NavItem } from '@/components/shell/AppShell'
import { SectionTabs } from '@/components/shell/SectionTabs'
import {
  Section,
  Panel,
  Stat,
  StatRow,
  TableShell,
  Th,
  Td,
  Tr,
  Empty,
} from '@/components/ui/primitives'

export const dynamic = 'force-dynamic'

/**
 * College-wide view. Unlike every other role this one is deliberately read-only:
 * writes belong to the department that owns the data.
 */
export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'ADMIN') redirect('/dashboard/hod')

  const db = await getDb()
  const q = db.query

  const [totals] = await Promise.all([
    q<any>(
      `SELECT (SELECT COUNT(*)::int FROM students WHERE is_active) AS students,
              (SELECT COUNT(*)::int FROM faculty WHERE is_active) AS faculty,
              (SELECT COUNT(*)::int FROM subjects) AS subjects,
              (SELECT COUNT(*)::int FROM departments) AS departments,
              (SELECT COUNT(*)::int FROM leaves WHERE status = 'PENDING') AS pending`,
    ).then((r) => r.rows[0]),
  ])

  const byDept = await q<any>(
    `SELECT d.code, d.name,
            (SELECT COUNT(*)::int FROM students s WHERE s.department_id = d.id AND s.is_active) AS students,
            (SELECT ROUND(AVG(v.effective_percentage), 1) FROM v_attendance_status v
               JOIN subjects sub ON sub.id = v.subject_id
              WHERE sub.department_id = d.id) AS attendance
       FROM departments d
      ORDER BY d.code`,
  )

  const nav: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'departments', label: 'Departments', icon: 'building' },
  ]
  const tabs = nav.map((n) => n.id)

  return (
    <AppShell
      sectionTitle="Administration"
      user={{
        name: `${user.firstName} ${user.lastName}`,
        role: 'Administrator',
        meta: user.email,
        initials: `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase(),
      }}
      nav={nav}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            College overview
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">Read-only across every department</p>
        </div>

        <StatRow>
          <Stat label="Students" value={totals.students} />
          <Stat label="Faculty" value={totals.faculty} />
          <Stat label="Subjects" value={totals.subjects} />
          <Stat label="Pending leave" value={totals.pending} tone={totals.pending > 0 ? 'warn' : 'ok'} />
        </StatRow>

        <div className="mt-9">
          <SectionTabs tabs={tabs}>
            <div data-tab="overview">
              <Section title="Roster at a glance" description="Students per department">
                <Panel bodyClassName="p-0">
                  {byDept.rows.length === 0 ? (
                    <Empty>No departments found.</Empty>
                  ) : (
                    <TableShell>
                      <thead>
                        <tr>
                          <Th>Code</Th>
                          <Th>Department</Th>
                          <Th align="right">Students</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {byDept.rows.map((d) => (
                          <Tr key={d.code}>
                            <Td className="font-medium text-slate-900">{d.code}</Td>
                            <Td>{d.name}</Td>
                            <Td align="right">{d.students}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </TableShell>
                  )}
                </Panel>
              </Section>
            </div>

            <div data-tab="departments">
              <Section title="Departments" description="Roster and attendance by department">
                <Panel bodyClassName="p-0">
                  <TableShell>
                    <thead>
                      <tr>
                        <Th>Code</Th>
                        <Th>Department</Th>
                        <Th align="right">Students</Th>
                        <Th align="right">Avg attendance</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDept.rows.map((d) => (
                        <Tr key={d.code}>
                          <Td className="font-medium text-slate-900">{d.code}</Td>
                          <Td>{d.name}</Td>
                          <Td align="right">{d.students}</Td>
                          <Td align="right">
                            {d.attendance == null ? '—' : `${Number(d.attendance).toFixed(1)}%`}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </TableShell>
                </Panel>
              </Section>
            </div>
          </SectionTabs>
        </div>

        <p className="mt-10 flex items-center gap-1.5 border-t border-slate-200 pt-5 text-[12px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Department dashboards are the working surface. This view is for oversight only.
        </p>
      </div>
    </AppShell>
  )
}
