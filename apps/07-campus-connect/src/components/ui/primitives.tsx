import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/helpers'

/* ------------------------------------------------------------------ section */

export function Section({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn('scroll-mt-20', className)}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/* --------------------------------------------------------------------- card */

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]',
        className,
      )}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
            {description ? (
              <p className="mt-0.5 text-[12px] text-slate-500">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </div>
  )
}

/* ----------------------------------------------------------------- stat tile */

type Tone = 'neutral' | 'ok' | 'warn' | 'danger'

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-slate-900',
  ok: 'text-emerald-600',
  warn: 'text-amber-600',
  danger: 'text-rose-600',
}

/**
 * Stat row, after inspo archetype "stat/row": hairline rules between figures
 * rather than four boxed cards, tabular-nums so digits align as values change,
 * and a mono meta line under each. Denser, and it stops the page reading as a
 * pile of disconnected boxes.
 */
export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const map = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  } as const
  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-x-8 gap-y-7 border-y border-slate-200 py-7',
        map[cols],
      )}
    >
      {children}
    </dl>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  rule = true,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  /** hairline on the leading edge; hidden on the first cell of each row */
  rule?: boolean
}) {
  return (
    <div className={cn('pl-0 lg:pl-8', rule && 'lg:border-l lg:border-slate-200 lg:first:border-l-0 lg:first:pl-0')}>
      <dt className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={cn(
          'mt-2 text-[30px] font-semibold leading-none tracking-tight [font-variant-numeric:tabular-nums]',
          TONE_TEXT[tone],
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-2 text-[12px] leading-snug text-slate-500">{hint}</p> : null}
    </div>
  )
}

/* -------------------------------------------------------------------- pill */

export type Severity = 'critical' | 'high' | 'watch' | 'ok'

const PILL: Record<Severity, string> = {
  critical: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  high: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  watch: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

export function Pill({
  children,
  severity = 'ok',
  className,
}: {
  children: ReactNode
  severity?: Severity
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        PILL[severity],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Grade pill, keyed to the real GRADE_SCALE in lib/utils/cgpa (O, A+, A, B+,
 * B, C, P, F, Ab) — not a ladder invented here, which previously left B+ and P
 * falling through to the wrong colour.
 */
const GRADE_SEVERITY: Record<string, Severity> = {
  O: 'ok',
  'A+': 'ok',
  A: 'ok',
  'B+': 'watch',
  B: 'watch',
  C: 'high',
  P: 'high',
  D: 'critical',
  F: 'critical',
  Ab: 'critical',
}

export function GradePill({ band }: { band: string }) {
  return <Pill severity={GRADE_SEVERITY[band] ?? 'watch'}>{band}</Pill>
}

/* --------------------------------------------------------------------- bar */

/** Horizontal proportion bar with a threshold marker. */
export function Meter({
  value,
  threshold,
  className,
}: {
  value: number
  threshold?: number
  className?: string
}) {
  const v = Math.max(0, Math.min(100, value || 0))
  const colour = threshold != null && v < threshold ? 'bg-rose-500' : 'bg-emerald-500'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full', colour)} style={{ width: `${v}%` }} />
        {threshold != null ? (
          <span
            className="absolute inset-y-0 w-px bg-slate-400"
            style={{ left: `${threshold}%` }}
            aria-hidden
          />
        ) : null}
      </div>
      <span className="w-12 shrink-0 text-right text-[12px] font-medium tabular-nums text-slate-700">
        {v.toFixed(1)}%
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------- table */

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  )
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children?: ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  children?: ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <td
      className={cn(
        'border-b border-slate-100 px-3 py-2.5 text-slate-700',
        align === 'right' && 'text-right tabular-nums',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  )
}

export function Tr({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <tr
      onClick={onClick}
      className={cn('transition-colors hover:bg-slate-50/70', onClick && 'cursor-pointer', className)}
    >
      {children}
    </tr>
  )
}

/* --------------------------------------------------------------- empty row */

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-slate-400">{children}</div>
  )
}
