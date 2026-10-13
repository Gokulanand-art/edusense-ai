import { redirect } from 'next/navigation'
import { getCurrentUser, roleHome } from '@/lib/auth'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  redirect(roleHome(user.role))
}
