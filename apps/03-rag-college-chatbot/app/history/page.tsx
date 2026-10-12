"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  MessageSquare,
  Clock,
  ArrowRight,
  Trash2,
  GraduationCap,
  Sparkles,
  Loader2,
} from "lucide-react";
import { formatDate } from "@/lib/utils/utils";

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      loadConversations();
    } else if (status === "unauthenticated") {
      setIsLoading(false);
    }
  }, [session, status]);

  const loadConversations = async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  if (status === "unauthenticated") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 text-center space-y-4">
        <div className="p-3 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
          <MessageSquare className="h-8 w-8" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-white">Sign In to View Chat History</h2>
        <p className="text-xs text-slate-400 max-w-sm">
          Conversation history is stored securely for registered student accounts.
        </p>
        <Link
          href="/login?callbackUrl=/history"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition active:scale-95 shadow-lg shadow-indigo-600/25"
        >
          Sign In Now
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-8 py-6 sm:py-8 max-w-5xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Conversation History</h1>
          <p className="text-xs text-slate-400">
            Review your past questions and answers grounded in official college documents
          </p>
        </div>
        <Link
          href="/chat"
          className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition shadow-lg shadow-indigo-600/25 active:scale-95 shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Ask New Question</span>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 sm:p-12 text-center space-y-4 border border-white/10">
          <MessageSquare className="h-10 w-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-white">No Chat History Found</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            You haven&apos;t asked any questions yet. Start a conversation with the college assistant!
          </p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition active:scale-95"
          >
            <span>Go to Chatbot</span> <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href="/chat"
              className="glass-card rounded-2xl p-4 sm:p-5 border border-white/10 hover:border-indigo-500/40 transition group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 shrink-0">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-xs sm:text-sm text-white group-hover:text-indigo-300 transition truncate">
                      {conv.title}
                    </span>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-80 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 transition shrink-0"
                    title="Delete Conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 sm:pt-4 mt-2 sm:mt-3 border-t border-white/5 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(conv.updatedAt || conv.createdAt)}
                </span>
                <span className="text-indigo-400 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                  <span>Continue</span> <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
