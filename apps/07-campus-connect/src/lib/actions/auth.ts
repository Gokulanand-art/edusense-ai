'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/auth'

/**
 * Server action for sign-out. A form action rather than a fetch so it works
 * without JavaScript, which is the only reason the logout control is in a form.
 */
export async function signOut() {
  cookies().delete(SESSION_COOKIE)
  redirect('/login')
}
