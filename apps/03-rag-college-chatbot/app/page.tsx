import Link from "next/link";
import {
  GraduationCap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Database,
  FileSearch,
  CheckCircle2,
  Lock,
  Layers,
  BookOpen,
  MessageSquare,
  Bot,
  Zap,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-10 sm:gap-16 py-6 sm:py-10 px-4 sm:px-8 max-w-7xl mx-auto w-full">
      {/* Hero Section */}
      <section className="text-center space-y-4 sm:space-y-6 pt-3 sm:pt-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-[11px] sm:text-xs font-semibold text-indigo-300 backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5 animate-pulse shrink-0" />
          <span>Production-Grade Retrieval-Augmented Generation</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-tight max-w-4xl mx-auto">
          AI Campus Assistant Grounded in{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Official Documents
          </span>
        </h1>

        <p className="text-xs sm:text-base md:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed px-2">
          Ask questions regarding academic regulations, exam rules, hostel curfews, fee concessions, and campus placements. Every response is verified with exact citations.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-2 sm:pt-4 w-full max-w-md sm:max-w-none mx-auto">
          <Link
            href="/chat"
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-6 py-3.5 text-xs sm:text-sm font-semibold text-white shadow-xl shadow-indigo-600/30 transition hover:scale-105 active:scale-95"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Launch Student Chatbot</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/admin"
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 rounded-2xl border border-white/10 bg-slate-900/80 hover:bg-slate-800 px-6 py-3.5 text-xs sm:text-sm font-semibold text-slate-200 transition hover:scale-105 active:scale-95"
          >
            <ShieldCheck className="h-4 w-4 text-purple-400" />
            <span>Admin Knowledge Portal</span>
          </Link>
        </div>

        {/* Demo Credentials Alert Banner */}
        <div className="max-w-xl mx-auto rounded-2xl glass-card border border-white/10 p-3.5 sm:p-4 text-[11px] sm:text-xs text-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 shadow-lg text-left">
          <div className="p-2 sm:p-0 rounded-xl bg-indigo-500/5 sm:bg-transparent">
            <span className="font-semibold text-indigo-400 block mb-0.5">Student Demo:</span>
            <span className="text-slate-200 font-mono text-[10px] sm:text-xs">student@college.edu</span> /{" "}
            <span className="text-slate-200 font-mono text-[10px] sm:text-xs">Student@123</span>
          </div>
          <div className="p-2 sm:p-0 rounded-xl bg-purple-500/5 sm:bg-transparent">
            <span className="font-semibold text-purple-400 block mb-0.5">Admin Demo:</span>
            <span className="text-slate-200 font-mono text-[10px] sm:text-xs">admin@college.edu</span> /{" "}
            <span className="text-slate-200 font-mono text-[10px] sm:text-xs">Admin@123</span>
          </div>
        </div>
      </section>

      {/* RAG Workflow Visualizer Section */}
      <section className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-10 border border-white/10 space-y-6 sm:space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-semibold text-indigo-400 uppercase tracking-wider">
            <Zap className="h-3.5 w-3.5" />
            Architecture Overview
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight">
            How Retrieval-Augmented Generation Works
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            The chatbot never relies on LLM speculation. It executes deterministic semantic search in pgvector to construct grounded context.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Step 1 */}
          <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-4 sm:p-5 space-y-2.5 relative group hover:border-indigo-500/40 transition">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-white">1. Document Ingestion</h3>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
              Official PDFs, DOCX, TXT, and Markdown files are cleaned, normalized, and chunked with 100-token sliding overlap.
            </p>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-4 sm:p-5 space-y-2.5 relative group hover:border-purple-500/40 transition">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Database className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-white">2. Vector Storage</h3>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
              High-dimensional vector embeddings are stored in PostgreSQL with pgvector indexing for sub-millisecond retrieval.
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-4 sm:p-5 space-y-2.5 relative group hover:border-blue-500/40 transition">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <FileSearch className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-white">3. Semantic Search</h3>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
              Student questions are embedded and compared via cosine similarity (`&lt;=&gt;`), filtering top 5 chunks with &gt;= 70% relevance.
            </p>
          </div>

          {/* Step 4 */}
          <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-4 sm:p-5 space-y-2.5 relative group hover:border-emerald-500/40 transition">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-white">4. Grounded Synthesis</h3>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
              The LLM formats a precise answer with source citations. If context is missing, it refuses to hallucinate facts.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Student Box */}
        <div className="glass-card rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-white/10 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Student Capabilities</h3>
              <p className="text-[11px] sm:text-xs text-slate-400">Built for seamless campus inquiries</p>
            </div>
          </div>

          <ul className="space-y-2 sm:space-y-2.5 text-[11px] sm:text-xs text-slate-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Grounded AI answers based strictly on official college documents</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Clickable source drawer with exact page numbers and relevance scores</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Suggested questions and department-wise category filters</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Multi-turn conversational context with saved question history</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Student feedback system (👍 / 👎) on generated responses</span>
            </li>
          </ul>

          <div className="pt-2">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
            >
              <span>Open Student Chatbot</span> <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Admin Box */}
        <div className="glass-card rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-white/10 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Admin Capabilities</h3>
              <p className="text-[11px] sm:text-xs text-slate-400">Total control over campus knowledge</p>
            </div>
          </div>

          <ul className="space-y-2 sm:space-y-2.5 text-[11px] sm:text-xs text-slate-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-400 shrink-0 mt-0.5" />
              <span>Drag-and-drop document upload (PDF, DOCX, TXT, Markdown)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-400 shrink-0 mt-0.5" />
              <span>Automated text cleaning, chunk extraction, and pgvector embeddings</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-400 shrink-0 mt-0.5" />
              <span>Chunk inspector modal to review individual vector segments</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-400 shrink-0 mt-0.5" />
              <span>One-click document reprocessing and cascading deletions</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-400 shrink-0 mt-0.5" />
              <span>Live metrics for document status, total queries, and satisfaction rate</span>
            </li>
          </ul>

          <div className="pt-2">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-400 hover:text-purple-300 transition"
            >
              <span>Access Admin Portal</span> <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
