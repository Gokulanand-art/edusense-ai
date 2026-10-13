'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Section switcher.
 *
 * The URL hash is the single source of truth for which section is open, so the
 * sidebar (a sibling client component) and this panel stay in sync with no
 * shared state and no prop drilling. Because the hash is real history, the
 * browser's back/forward buttons work.
 *
 * Children are server-rendered and passed straight through — no data is
 * serialised to the client beyond what the page already rendered, and no fetch
 * happens on switch. Each child carries `data-tab="<id>"`; only the matching
 * one is mounted.
 */
export function SectionTabs({ tabs, children }: { tabs: string[]; children: ReactNode }) {
  const [active, setActive] = useState<string>(tabs[0] ?? '')

  useEffect(() => {
    const read = () => {
      const id = window.location.hash.replace(/^#/, '')
      setActive(tabs.includes(id) ? id : tabs[0])
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [tabs])

  // Open on the first tab when the URL carries no hash, so a direct visit to
  // /dashboard/hod never renders an empty body.
  useEffect(() => {
    if (!window.location.hash && tabs[0]) {
      window.history.replaceState(null, '', `#${tabs[0]}`)
    }
  }, [tabs])

  const blocks = (Array.isArray(children) ? children : [children]).filter(
    (b): b is ReactNode => b != null && typeof b !== 'boolean',
  )
  const current = blocks.find(
    (b) => (b as any)?.props?.['data-tab'] === active,
  )

  return <div className="animate-[fade_.18s_ease-out]">{current ?? null}</div>
}
