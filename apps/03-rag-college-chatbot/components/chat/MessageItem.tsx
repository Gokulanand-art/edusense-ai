"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  User,
  Bot,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { SourceItem, SourceDrawer } from "./SourceDrawer";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  usedFallback?: boolean;
  feedback?: "UP" | "DOWN" | null;
  createdAt?: string | Date;
}

interface MessageItemProps {
  message: ChatMessage;
  onFeedback?: (messageId: string, rating: "UP" | "DOWN") => void;
}

export function MessageItem({ message, onFeedback }: MessageItemProps) {
  const [showSources, setShowSources] = useState(false);
  const [feedback, setFeedback] = useState<"UP" | "DOWN" | null>(message.feedback || null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const isUser = message.role === "user";

  const handleFeedback = async (rating: "UP" | "DOWN") => {
    if (feedback === rating || !message.id || feedbackSubmitting) return;
    setFeedback(rating);
    setFeedbackSubmitting(true);

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, rating }),
      });
      if (onFeedback) onFeedback(message.id, rating);
    } catch (err) {
      console.error("Failed to record feedback:", err);
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <div className={`flex gap-2.5 sm:gap-3.5 ${isUser ? "justify-end" : "justify-start"} group w-full`}>
      {/* Bot Icon */}
      {!isUser && (
        <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30">
          <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      )}

      <div
        className={`max-w-[88%] sm:max-w-[78%] rounded-2xl p-3.5 sm:p-4 transition ${
          isUser
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
            : "glass-card border border-white/10 text-slate-200"
        }`}
      >
        {/* Content */}
        <div className="prose prose-invert prose-sm max-w-none text-xs sm:text-sm leading-relaxed break-words overflow-x-auto">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>

        {/* Assistant Details & Sources */}
        {!isUser && (
          <div className="mt-3 pt-2.5 sm:pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Sources button */}
            {message.sources && message.sources.length > 0 ? (
              <button
                onClick={() => setShowSources(true)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs text-indigo-300 hover:bg-indigo-500/20 transition font-medium active:scale-95"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>{message.sources.length} {message.sources.length === 1 ? "Source" : "Sources"}</span>
              </button>
            ) : message.usedFallback ? (
              <span className="flex items-center gap-1 text-amber-400 text-[10px] sm:text-[11px]">
                <AlertCircle className="h-3.5 w-3.5" />
                No matching official document found
              </span>
            ) : null}

            {/* Feedback Buttons */}
            {message.id && (
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[10px] text-slate-500 mr-1 hidden sm:inline">Helpful?</span>
                <button
                  onClick={() => handleFeedback("UP")}
                  disabled={feedbackSubmitting}
                  className={`p-1.5 rounded-lg border transition active:scale-95 ${
                    feedback === "UP"
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                      : "border-white/5 bg-white/5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                  title="Thumbs Up"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleFeedback("DOWN")}
                  disabled={feedbackSubmitting}
                  className={`p-1.5 rounded-lg border transition active:scale-95 ${
                    feedback === "DOWN"
                      ? "bg-red-500/20 border-red-500/40 text-red-400"
                      : "border-white/5 bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                  }`}
                  title="Thumbs Down"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Icon */}
      {isUser && (
        <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 border border-white/10 text-slate-300">
          <User className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      )}

      {/* Source Drawer Modal */}
      {message.sources && message.sources.length > 0 && (
        <SourceDrawer
          sources={message.sources}
          isOpen={showSources}
          onClose={() => setShowSources(false)}
        />
      )}
    </div>
  );
}
