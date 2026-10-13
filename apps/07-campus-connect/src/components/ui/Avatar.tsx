'use client'

import * as React from 'react'
import { cn, getInitials } from '@/lib/utils/helpers'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'

const SIZES: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
}

const STATUS_COLOR: Record<AvatarStatus, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-400',
  busy: 'bg-red-500',
  away: 'bg-amber-500',
}

const STATUS_DOT: Record<AvatarSize, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-3.5 w-3.5',
}

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  name?: string
  size?: AvatarSize
  status?: AvatarStatus
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, name, size = 'md', status, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full', SIZES[size], className)}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? name ?? 'Avatar'} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-200 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
          {name ? getInitials(name) : <UserIcon />}
        </div>
      )}
      {status ? (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-background',
            STATUS_COLOR[status],
            STATUS_DOT[size],
          )}
        />
      ) : null}
    </div>
  ),
)
Avatar.displayName = 'Avatar'

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-1/2 w-1/2" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}
