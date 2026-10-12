"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { ShieldCheck, Lock, AlertTriangle, ArrowRight } from "lucide-react";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const user = session?.user as any;
  const isAdmin = user?.role === "ADMIN";

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <p className="text-xs text-slate-400">Verifying administrative credentials...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md glass-panel rounded-3xl p-8 border border-white/10 text-center space-y-6 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <Lock className="h-7 w-7" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Admin Access Required</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              This area is restricted to college administrators to manage documents and monitor RAG indexing.
            </p>
          </div>

          <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-3.5 text-xs text-purple-300">
            <p className="font-semibold mb-1">Demo Administrator Credentials:</p>
            <code>admin@college.edu</code> / <code>Admin@123</code>
          </div>

          <div className="pt-2">
            <Link
              href="/login?callbackUrl=/admin"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 py-3 px-4 text-xs font-semibold text-white shadow-lg shadow-purple-600/25 transition"
            >
              Sign In as Administrator <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}
