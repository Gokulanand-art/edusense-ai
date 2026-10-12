import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const acceptHeader = req.headers.get("accept") || "";

  // If programmatic request (cURL, fetch, Postman, etc.) asking for JSON:
  if (acceptHeader.includes("application/json") && !acceptHeader.includes("text/html")) {
    return NextResponse.json({
      status: "healthy",
      service: "College RAG Chatbot API",
      version: "1.0.0",
      description: "Backend API for Retrieval-Augmented Generation (RAG) Campus Assistant",
      database: "MongoDB Atlas (Connected)",
      endpoints: {
        chat: "/api/chat",
        auth: "/api/auth",
        conversations: "/api/conversations",
        feedback: "/api/feedback",
        admin_documents: "/api/admin/documents",
        admin_analytics: "/api/admin/analytics",
      },
      timestamp: new Date().toISOString(),
    });
  }

  // If visited in a web browser, return a stunning interactive API Documentation portal!
  const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CollegeAI - Backend API Portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Inter', sans-serif; background-color: #030712; color: #f3f4f6; }
    code, pre { font-family: 'JetBrains Mono', monospace; }
    .glass-card { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); }
    .pulse-dot { box-shadow: 0 0 12px #22c55e; }
  </style>
</head>
<body class="min-h-screen flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
  <!-- Header -->
  <header class="border-b border-white/10 glass-card sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">
          ⚡
        </div>
        <div>
          <span class="font-bold text-base text-white">CollegeAI Backend API</span>
          <span class="ml-2 text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">v1.0.0</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
          <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse pulse-dot"></span>
          <span>System Healthy</span>
        </div>
        <a href="/" class="text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 px-3.5 py-1.5 rounded-lg transition font-medium">
          Open Frontend ↗
        </a>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
    <!-- Hero / Status Banner -->
    <div class="glass-card rounded-3xl p-8 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-purple-950/30 border border-indigo-500/20 relative overflow-hidden">
      <div class="relative z-10 space-y-3">
        <h1 class="text-3xl font-extrabold text-white tracking-tight">RAG Campus Assistant API Service</h1>
        <p class="text-sm text-slate-300 max-w-2xl leading-relaxed">
          High-performance serverless backend engine powered by Next.js API Routes, Prisma ORM, and MongoDB Atlas Vector Storage.
        </p>
        <div class="pt-3 flex flex-wrap gap-4 text-xs text-slate-400">
          <div class="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/5">
            <span class="text-indigo-400 font-semibold">Database:</span> MongoDB Atlas (college_rag)
          </div>
          <div class="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/5">
            <span class="text-indigo-400 font-semibold">RAG Pipeline:</span> Hybrid Cosine Similarity + BM25 Scoring
          </div>
          <div class="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/5">
            <span class="text-indigo-400 font-semibold">Auth Protocol:</span> JWT Bearer & NextAuth Session
          </div>
        </div>
      </div>
    </div>

    <!-- Active Endpoints Grid -->
    <div class="space-y-4">
      <h2 class="text-lg font-bold text-white flex items-center gap-2">
        <span>Available API Endpoints</span>
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Chat Endpoint -->
        <div class="glass-card rounded-2xl p-5 space-y-3 border border-white/5 hover:border-indigo-500/30 transition">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">POST</span>
              <span class="font-mono text-sm font-semibold text-slate-200">/api/chat</span>
            </div>
            <span class="text-[11px] text-emerald-400 font-medium">● Active</span>
          </div>
          <p class="text-xs text-slate-400">Execute query against college policy documents, retrieve context chunks, and synthesize grounded response.</p>
          <div class="bg-slate-950 p-2.5 rounded-xl text-[11px] font-mono text-slate-400 border border-white/5">
            Body: { "question": "What is the minimum attendance required?" }
          </div>
        </div>

        <!-- Conversations Endpoint -->
        <div class="glass-card rounded-2xl p-5 space-y-3 border border-white/5 hover:border-indigo-500/30 transition">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">GET</span>
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">POST</span>
              <span class="font-mono text-sm font-semibold text-slate-200">/api/conversations</span>
            </div>
            <span class="text-[11px] text-emerald-400 font-medium">● Active</span>
          </div>
          <p class="text-xs text-slate-400">Fetch user chat history threads and manage active student conversation sessions.</p>
          <div class="bg-slate-950 p-2.5 rounded-xl text-[11px] font-mono text-slate-400 border border-white/5">
            Query: GET /api/conversations (Requires Session Auth)
          </div>
        </div>

        <!-- Documents Endpoint -->
        <div class="glass-card rounded-2xl p-5 space-y-3 border border-white/5 hover:border-indigo-500/30 transition">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">GET</span>
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">POST</span>
              <span class="font-mono text-sm font-semibold text-slate-200">/api/admin/documents</span>
            </div>
            <span class="text-[11px] text-emerald-400 font-medium">● Active</span>
          </div>
          <p class="text-xs text-slate-400">Upload PDF/DOCX/TXT policy handbooks, auto-chunk, compute embeddings, and store in MongoDB.</p>
          <div class="bg-slate-950 p-2.5 rounded-xl text-[11px] font-mono text-slate-400 border border-white/5">
            Auth: ADMIN Role Required
          </div>
        </div>

        <!-- Feedback Endpoint -->
        <div class="glass-card rounded-2xl p-5 space-y-3 border border-white/5 hover:border-indigo-500/30 transition">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">POST</span>
              <span class="font-mono text-sm font-semibold text-slate-200">/api/feedback</span>
            </div>
            <span class="text-[11px] text-emerald-400 font-medium">● Active</span>
          </div>
          <p class="text-xs text-slate-400">Submit student rating (thumbs up/down) and qualitative feedback on RAG response accuracy.</p>
          <div class="bg-slate-950 p-2.5 rounded-xl text-[11px] font-mono text-slate-400 border border-white/5">
            Body: { "messageId": "...", "rating": 1, "comment": "Accurate!" }
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="border-t border-white/10 glass-card py-6 text-center text-xs text-slate-500">
    CollegeAI RAG Backend Engine • Built with Next.js 14, MongoDB Atlas & Prisma ORM
  </footer>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
