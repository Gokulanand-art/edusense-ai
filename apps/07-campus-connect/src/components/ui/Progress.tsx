'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/helpers'

type Variant = 'default' | 'success' | 'warning' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

const BAR: Record<Variant, string> = {
  default: 'bg-blue-600',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-red-500',
}

const HEIGHT: Record<Size, string> = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' }

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  max?: number
  label?: string
  showValue?: boolean
  variant?: Variant
  size?: Size
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, label, showValue = true, variant = 'default', size = 'md', ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, max === 0 ? 0 : (value / max) * 100))
    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {label ? (
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium">{label}</span>
            {showValue ? <span className="font-mono text-muted-foreground">{value}/{max}</span> : null}
          </div>
        ) : null}
        <div className={cn('w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', HEIGHT[size])}>
          <div
            className={cn('h-full rounded-full transition-[width] duration-500', BAR[variant])}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={max}
          />
        </div>
      </div>
    )
  },
)
Progress.displayName = 'Progress'
