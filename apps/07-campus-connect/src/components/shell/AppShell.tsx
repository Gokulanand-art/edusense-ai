'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  Award,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  CalendarPlus,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  TrendingDown,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils/helpers'
import { signOut } from '@/lib/actions/auth'

/**
 * Icons cross the server->client boundary as NAMES, not component references:
 * a component is a function, and Next refuses to serialise functions into a
 * client component's props.
 */
const ICONS = {
  award: Award,
  books: BookOpenCheck,
  building: Building2,
  calendar: CalendarCheck,
  calendarPlus: CalendarPlus,
  clipboard: ClipboardCheck,
  file: FileCheck2,
  graduation: GraduationCap,
  dashboard: LayoutDashboard,
  shield: ShieldCheck,
  trending: TrendingDown,
  users: Users,
} as const

export type IconName = keyof typeof ICONS
export type NavItem = { id: string; label: string; icon: IconName; badge?: number }

export function AppShell({
  user,
  nav,
  sectionTitle,
  children,
}: {
  user: { name: string; role: string; meta: string; initials: string }
  nav: NavItem[]
  sectionTitle?: string
  children: React.ReactNode
}) {
  // The hash is shared state between this sidebar and <SectionTabs>. Both read
  // it, so neither needs to know about the other.
  const [active, setActive] = useState(nav[0]?.id ?? '')

  useEffect(() => {
    const read = () => {
      const id = window.location.hash.replace(/^#/, '')
      setActive(nav.some((n) => n.id === id) ? id : (nav[0]?.id ?? ''))
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [nav])

  const initials = user.initials || user.name.slice(0, 2).toUpperCase()

  return (
    <div className="flex min-h-screen bg-white">
      {/* ---------------------------------------------------------- sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-6 pb-8 pt-7">
          <p className="text-[15px] font-semibold tracking-tight text-slate-900">
            Campus Connect
          </p>
          <p className="mt-0.5 text-[12px] text-slate-500">{sectionTitle}</p>
        </div>

        {/*
          Marginal index (inspo archetype N7): numbered, mono, and the label
          slides right on hover so the eye can track without a colour change.
          Reads like a table of contents pulled into the chrome.
        */}
        <nav aria-label="Sections" className="flex-1 space-y-0.5 px-4">
          {nav.map((item, i) => {
            const on = item.id === active
            const Icon = ICONS[item.icon] ?? LayoutDashboard
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors',
                  on ? 'bg-slate-100' : 'hover:bg-slate-50',
                )}
              >
                <span
                  className={cn(
                    'w-4 shrink-0 font-mono text-[11px] tabular-nums',
                    on ? 'text-slate-900' : 'text-slate-400',
                  )}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    on ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-600',
                  )}
                  strokeWidth={1.7}
                />
                <span
                  className={cn(
                    'flex-1 text-[13px] transition-transform duration-200',
                    on
                      ? 'font-semibold text-slate-900'
                      : 'font-medium text-slate-600 group-hover:translate-x-0.5',
                  )}
                >
                  {item.label}
                </span>
                {item.badge ? (
                  <span className="rounded-full bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white">
                    {item.badge}
                  </span>
                ) : null}
              </a>
            )
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight text-slate-900">
                {user.name}
              </p>
              <p className="truncate text-[11px] leading-tight text-slate-500">{user.meta}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Sign out"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------- main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 px-6 lg:px-10">
          <Link
            href="/"
            className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-[11px] font-bold text-white lg:hidden"
          >
            CC
          </Link>
          <p className="min-w-0 flex-1 truncate text-[13px] text-slate-500">
            <span className="font-medium text-slate-900">{user.name}</span>
            <span className="mx-1.5 text-slate-300">/</span>
            {user.role}
          </p>
          <span className="hidden font-mono text-[11px] tabular-nums text-slate-400 sm:inline">
            {sectionTitle}
          </span>
        </header>
        <main className="flex-1 px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  )
}
