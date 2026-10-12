"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap,
  LogIn,
  Lock,
  Mail,
  AlertCircle,
  Loader2,
  ShieldCheck,
  User,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/chat";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: email.trim(),
        password,
        callbackUrl,
      });

      if (res?.error) {
        setError(res.error);
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: any) {
      setError("An unexpected error occurred during login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="w-full max-w-md space-y-5 sm:space-y-6">
      {/* Card */}
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-white/10 shadow-2xl space-y-5 sm:space-y-6">
        <div className="text-center space-y-1.5 sm:space-y-2">
          <div className="mx-auto flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30">
            <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Sign In to CollegeAI</h1>
          <p className="text-xs text-slate-400">
            Access the campus chatbot and official document portal
          </p>
        </div>

        {/* Quick Demo Fillers */}
        <div className="space-y-2">
          <div className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
            Quick Demo Accounts
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin("student@college.edu", "Student@123")}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-indigo-500/30 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 text-xs font-medium transition active:scale-95"
            >
              <User className="h-3.5 w-3.5" />
              <span>Student Demo</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin("admin@college.edu", "Admin@123")}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-purple-500/30 bg-purple-600/10 text-purple-300 hover:bg-purple-600/20 text-xs font-medium transition active:scale-95"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin Demo</span>
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@college.edu"
                required
                className="w-full rounded-xl border border-white/10 bg-slate-900/90 pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-white/10 bg-slate-900/90 pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 py-3 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition active:scale-95"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        {/* Footer link */}
        <div className="text-center text-xs text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-indigo-400 hover:underline">
            Create student account
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
      <Suspense fallback={<div className="text-slate-400 text-sm">Loading login...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
