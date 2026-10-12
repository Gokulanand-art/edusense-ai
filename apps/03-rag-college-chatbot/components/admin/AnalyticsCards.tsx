"use client";

import { FileText, Layers, MessageSquare, ThumbsUp, CheckCircle, AlertTriangle } from "lucide-react";

interface AnalyticsProps {
  analytics: {
    totalDocuments: number;
    readyDocuments: number;
    failedDocuments: number;
    totalChunks: number;
    totalConversations: number;
    totalQuestionsAsked: number;
    feedback: {
      total: number;
      up: number;
      down: number;
      satisfactionRate: number;
    };
    categoryDistribution?: { category: string; count: number }[];
  } | null;
}

export function AnalyticsCards({ analytics }: AnalyticsProps) {
  if (!analytics) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Total Documents */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/10 space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Documents
          </span>
          <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <FileText className="h-4 w-4" />
          </div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-bold text-white">{analytics.totalDocuments}</div>
          <div className="flex items-center gap-2 mt-1 text-[11px] sm:text-xs text-slate-400">
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> {analytics.readyDocuments} Ready
            </span>
            {analytics.failedDocuments > 0 && (
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {analytics.failedDocuments} Failed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Vector Chunks */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/10 space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Indexed Chunks
          </span>
          <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <Layers className="h-4 w-4" />
          </div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-bold text-white">{analytics.totalChunks}</div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1">pgvector Embeddings Active</p>
        </div>
      </div>

      {/* Student Queries */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/10 space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Student Queries
          </span>
          <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <MessageSquare className="h-4 w-4" />
          </div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-bold text-white">{analytics.totalQuestionsAsked}</div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
            Across {analytics.totalConversations} conversations
          </p>
        </div>
      </div>

      {/* Student Satisfaction */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/10 space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Satisfaction Rate
          </span>
          <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
            <ThumbsUp className="h-4 w-4" />
          </div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-bold text-white">
            {analytics.feedback.satisfactionRate}%
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] sm:text-xs text-slate-400">
            <span className="text-emerald-400">👍 {analytics.feedback.up}</span>
            <span className="text-red-400">👎 {analytics.feedback.down}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
