import { cn } from '@/lib/utils/helpers'

/**
 * Weekly attendance trend.
 *
 * Hand-rolled SVG rather than a chart library: this is one line series with a
 * threshold rule, and pulling in Recharts/visx for it would add far more bundle
 * than the whole screen is worth.
 */
export function TrendChart({
  points,
  threshold = 75,
  height = 132,
}: {
  points: Array<{ label: string; pct: number }>
  threshold?: number
  height?: number
}) {
  if (!points.length) {
    return <div className="py-10 text-center text-[13px] text-slate-400">No trend data yet</div>
  }

  const W = 640
  const H = height
  const PAD = { top: 10, right: 8, bottom: 22, left: 30 }
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom

  // Fixed 0-100 domain: truncating the axis would exaggerate small swings,
  // which on an attendance chart reads as a crisis that isn't there.
  const y = (pct: number) => PAD.top + ih - (Math.max(0, Math.min(100, pct)) / 100) * ih
  const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.pct)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${PAD.top + ih} L${x(0)},${PAD.top + ih} Z`

  const gridValues = [0, 25, 50, 75, 100]
  const below = points.some((p) => p.pct < threshold)

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Attendance trend">
        {gridValues.map((g) => (
          <g key={g}>
            <line
              x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)}
              stroke="#f1f5f9" strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(g) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
              {g}
            </text>
          </g>
        ))}

        {/* threshold rule */}
        <line
          x1={PAD.left} x2={W - PAD.right} y1={y(threshold)} y2={y(threshold)}
          stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3"
        />

        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={below ? '#f43f5e' : '#0ea5e9'} stopOpacity={0.18} />
            <stop offset="100%" stopColor={below ? '#f43f5e' : '#0ea5e9'} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#trendFill)" />
        <path
          d={line}
          fill="none"
          stroke={below ? '#e11d48' : '#0284c7'}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={i} cx={x(i)} cy={y(p.pct)} r={i === points.length - 1 ? 3.5 : 2}
            fill={p.pct < threshold ? '#e11d48' : '#0284c7'}
          >
            <title>{`${p.label}: ${p.pct}%`}</title>
          </circle>
        ))}

        {/* Anchor the first and last labels inward — at the plot edges a
            middle-anchored label runs off the viewBox and gets clipped. */}
        {points.map((p, i) => {
          const last = i === points.length - 1
          const show = last || i === 0 || i % Math.ceil(points.length / 6) === 0
          if (!show) return null
          return (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor={last ? 'end' : i === 0 ? 'start' : 'middle'}
              className="fill-slate-400 text-[9px]"
            >
              {p.label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

/** Attendance donut — the student's headline number. */
export function AttendanceRing({
  pct,
  threshold = 75,
  size = 132,
  label,
}: {
  pct: number
  threshold?: number
  size?: number
  label?: string
}) {
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, pct || 0))
  const offset = c - (v / 100) * c
  const colour = v < threshold ? '#e11d48' : '#059669'

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={colour} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p
            className={cn(
              'text-[22px] font-semibold leading-none tracking-tight tabular-nums',
              v < threshold ? 'text-rose-600' : 'text-emerald-600',
            )}
          >
            {v.toFixed(1)}%
          </p>
          {label ? <p className="mt-1 text-[10px] font-medium text-slate-500">{label}</p> : null}
        </div>
      </div>
    </div>
  )
}

/** Compact distribution bars, used for grade bands and risk counts. */
export function DistributionBars({
  items,
}: {
  items: Array<{ label: string; count: number; tone?: 'ok' | 'warn' | 'danger' | 'info' }>
}) {
  const max = Math.max(1, ...items.map((i) => i.count))
  const colour = {
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-sky-500',
  } as const

  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-[12px] font-medium text-slate-600">{i.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full', colour[i.tone ?? 'info'])}
              style={{ width: `${(i.count / max) * 100}%` }}
            />
          </div>
          <span className="w-7 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-700">
            {i.count}
          </span>
        </div>
      ))}
    </div>
  )
}
