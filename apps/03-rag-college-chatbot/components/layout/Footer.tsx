import Link from "next/link";
import { GraduationCap, Shield, Database, Cpu, Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/80 py-6 sm:py-8 mt-auto safe-bottom">
      <div className="container mx-auto px-4 sm:px-8">
        <div className="flex flex-col md:flex-row gap-4 sm:gap-6 items-center justify-between text-xs text-slate-400 text-center md:text-left">
          {/* Brand info */}
          <div className="flex items-center justify-center md:justify-start gap-2.5 sm:gap-3">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shrink-0">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-200 text-xs sm:text-sm">College RAG Chatbot</p>
              <p className="text-[10px] sm:text-[11px] text-slate-500">
                Grounded Answers with Official Document Attribution
              </p>
            </div>
          </div>

          {/* Tech Badges */}
          <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 text-[11px] sm:text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-indigo-400" /> PostgreSQL + pgvector
            </span>
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-purple-400" /> Configurable LLM
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-emerald-400" /> Zero Hallucination
            </span>
          </div>

          {/* Nav Links */}
          <div className="flex justify-center md:justify-end items-center gap-4 text-xs">
            <Link href="/chat" className="hover:text-indigo-300 transition">
              Chatbot
            </Link>
            <Link href="/admin" className="hover:text-purple-300 transition">
              Admin Portal
            </Link>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">v1.0.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
