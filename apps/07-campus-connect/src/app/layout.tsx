import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/Toaster'

export const metadata: Metadata = {
  title: 'Campus Connect',
  description:
    'Campus management with predictive attendance, a leave-impact calculator, and exam-eligibility enforcement.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
