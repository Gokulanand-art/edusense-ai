"use client";

import { Sparkles, HelpCircle } from "lucide-react";

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

const SUGGESTIONS = [
  "What is the minimum attendance required for semester exams?",
  "What are the hostel curfew timings and visitor rules?",
  "What is the grading policy and CGPA required for Honors?",
  "What are the eligibility criteria and rules for campus placements?",
  "What scholarships and fee concession schemes are available?",
];

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  return (
    <div className="w-full space-y-2.5 sm:space-y-3 py-2 sm:py-4">
      <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] sm:text-xs font-semibold text-indigo-400 uppercase tracking-wider">
        <Sparkles className="h-3.5 w-3.5" />
        <span>Suggested Questions</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
        {SUGGESTIONS.map((q, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(q)}
            className="flex items-start gap-2.5 text-left p-2.5 sm:p-3 rounded-xl border border-white/5 bg-slate-900/60 hover:bg-indigo-950/40 hover:border-indigo-500/30 transition text-[11px] sm:text-xs text-slate-300 hover:text-white group active:scale-[0.99]"
          >
            <HelpCircle className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
            <span className="leading-snug">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
