import { redirect } from 'next/navigation'
import { getCurrentUser, roleHome } from '@/lib/auth'
import { LoginForm } from '@/components/LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect(roleHome(user.role))

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* ------------------------------------------------------- form side */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              CC
            </div>
            <div>
              <p className="text-[15px] font-semibold leading-tight text-slate-900">
                Campus Connect
              </p>
              <p className="text-[12px] leading-tight text-slate-500">
                Excel Engineering College
              </p>
            </div>
          </div>

          <h1 className="mt-8 text-[24px] font-semibold tracking-tight text-slate-900">
            Sign in
          </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            Sign in with your email address, your placement login ID, or your roll number.
          </p>

          <div className="mt-7">
            <LoginForm />
          </div>

          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Demo accounts · password campus123
            </p>
            <dl className="mt-2 space-y-1 text-[12px] text-slate-600">
              <div className="flex justify-between gap-3">
                <dt>Head of department</dt>
                <dd className="tabular-nums text-slate-400">hod.cse@campus.edu</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Faculty</dt>
                <dd className="tabular-nums text-slate-400">faculty.cse@campus.edu</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Student</dt>
                <dd className="tabular-nums text-slate-400">G001 or 24CS001</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ context side */}
      <div className="relative hidden overflow-hidden bg-slate-900 lg:block">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(60% 55% at 78% 18%, rgba(56,189,248,.28) 0%, transparent 60%), radial-gradient(50% 45% at 18% 82%, rgba(99,102,241,.26) 0%, transparent 60%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-[12px] font-medium text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Live department data
          </div>

          <div className="max-w-md">
            <h2 className="text-[30px] font-semibold leading-[1.15] tracking-tight text-white">
              Every attendance decision, scoped to one department.
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-slate-300">
              Heads of department see the whole cohort. Faculty see only the papers they
              teach. Students see only their own record. The boundary is enforced on the
              server from the signed session — never from the URL.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
            {[
              ['75%', 'exam-eligibility floor'],
              ['62', 'students in cohort'],
              ['0', 'cross-department leaks'],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-[22px] font-semibold tabular-nums text-white">{v}</dt>
                <dd className="mt-0.5 text-[12px] text-slate-400">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </main>
  )
}
