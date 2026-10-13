import { redirect } from 'next/navigation'
import { getCurrentUser, roleHome } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * `/portal` used to serve the vendored static multi-page shell from /public.
 * That shell is gone; the path now resolves into the real app so old links and
 * bookmarks still land on the right dashboard.
 */
export default async function PortalIndex() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  redirect(roleHome(user.role))
}
