"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  GraduationCap,
  MessageSquare,
  FileText,
  ShieldCheck,
  LogOut,
  LogIn,
  UserPlus,
  Sparkles,
  Menu,
  X,
  User as UserIcon,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const user = session?.user as any;
  const isAdmin = user?.role === "ADMIN";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on page navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 sm:gap-3 group shrink-0"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform">
            <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-base sm:text-lg text-white tracking-tight">CollegeAI</span>
              <span className="rounded-full bg-indigo-500/20 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                RAG Engine
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 hidden sm:block">
              Official Campus Information Assistant
            </p>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          <Link
            href="/chat"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith("/chat")
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Chatbot
          </Link>

          {user && (
            <Link
              href="/history"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/history"
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <FileText className="h-4 w-4" />
              History
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-purple-600/20 text-purple-300 border border-purple-500/30"
                  : "text-purple-300 hover:text-white hover:bg-purple-500/10"
              }`}
            >
              <ShieldCheck className="h-4 w-4 text-purple-400" />
              Admin Portal
            </Link>
          )}
        </nav>

        {/* Desktop User / Auth State */}
        <div className="hidden md:flex items-center gap-3">
          {status === "loading" ? (
            <div className="h-8 w-20 animate-pulse rounded-lg bg-slate-800" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-sm font-medium text-white">{user.name}</span>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
                    isAdmin
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                      : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                  }`}
                >
                  {user.role}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
              >
                <LogIn className="h-3.5 w-3.5" />
                Login
              </Link>
              <Link
                href="/register"
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/30"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Register
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center gap-2">
          {user && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                isAdmin
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                  : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
              }`}
            >
              {user.role}
            </span>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close Menu" : "Open Menu"}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900/90 text-slate-200 hover:text-white hover:bg-white/10 transition active:scale-95"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Overlay Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-white/10 animate-fadeIn flex flex-col justify-between p-5 overflow-y-auto">
          <div className="space-y-4">
            {/* User Profile Card if logged in */}
            {user && (
              <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <UserIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{user.name}</div>
                    <div className="text-xs text-slate-400">{user.email}</div>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    isAdmin
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                      : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                  }`}
                >
                  {user.role}
                </span>
              </div>
            )}

            {/* Navigation Links */}
            <nav className="space-y-1.5">
              <Link
                href="/chat"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  pathname.startsWith("/chat")
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-300 hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <span>Campus Chatbot</span>
              </Link>

              {user && (
                <Link
                  href="/history"
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    pathname === "/history"
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <span>Conversation History</span>
                </Link>
              )}

              {isAdmin && (
                <Link
                  href="/admin"
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    pathname.startsWith("/admin")
                      ? "bg-purple-600/20 text-purple-300 border border-purple-500/30"
                      : "text-purple-300 hover:text-white hover:bg-purple-500/10"
                  }`}
                >
                  <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <span>Admin Knowledge Portal</span>
                </Link>
              )}
            </nav>
          </div>

          {/* Mobile Auth Bottom Section */}
          <div className="pt-6 border-t border-white/10 space-y-3">
            {user ? (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  signOut({ callbackUrl: "/" });
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out ({user.name})</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 p-3 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                >
                  <LogIn className="h-4 w-4" />
                  Login
                </Link>
                <Link
                  href="/register"
                  className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 p-3 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/30"
                >
                  <UserPlus className="h-4 w-4" />
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
