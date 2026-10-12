"use client";

import { X, FileText, Bookmark, Percent, ExternalLink } from "lucide-react";

export interface SourceItem {
  chunkId: string;
  documentTitle: string;
  category: string;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  snippet: string;
  relevanceScore: number;
}

interface SourceDrawerProps {
  sources: SourceItem[];
  isOpen: boolean;
  onClose: () => void;
}

export function SourceDrawer({ sources, isOpen, onClose }: SourceDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl glass-panel border border-white/10 p-4 sm:p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shrink-0">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="truncate">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">Verified Grounding Sources</h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Retrieved chunks from official documents
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0 active:scale-95"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sources list */}
        <div className="flex-1 overflow-y-auto space-y-3.5 py-3 sm:py-4 pr-1">
          {sources.map((src, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-white/10 bg-slate-900/80 p-3.5 sm:p-4 space-y-2.5 transition hover:border-indigo-500/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Bookmark className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">{src.documentTitle}</span>
                  <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[9px] sm:text-[10px] font-medium text-indigo-300 border border-indigo-500/20 shrink-0">
                    {src.category}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                  {src.pageNumber && (
                    <span className="text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                      Page {src.pageNumber}
                    </span>
                  )}
                  <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-300 border border-emerald-500/20 font-mono font-medium text-[11px]">
                    <Percent className="h-3 w-3" />
                    {(src.relevanceScore * 100).toFixed(0)}% Match
                  </span>
                </div>
              </div>

              {src.sectionTitle && (
                <p className="text-[11px] sm:text-xs font-medium text-indigo-300 italic">
                  Section: {src.sectionTitle}
                </p>
              )}

              <div className="rounded-lg bg-black/40 p-2.5 sm:p-3 border border-white/5 text-[11px] sm:text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap break-words overflow-x-auto">
                {src.snippet}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition active:scale-95"
          >
            Close Source Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
