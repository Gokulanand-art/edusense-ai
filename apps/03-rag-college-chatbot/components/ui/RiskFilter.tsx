"use client";
import { cn } from "@/lib/utils/utils";

export type Band = "thriving" | "steady" | "support" | "at-risk";
const BANDS: { key: Band | "all"; label: string; glow: string; bg: string }[] = [
  { key: "all", label: "All", glow: "", bg: "bg-slate-700" },
  { key: "thriving", label: "Thriving", glow: "shadow-[0_6px_18px_-8px_#22C55E]", bg: "bg-[#14532d]" },
  { key: "steady", label: "Steady", glow: "shadow-[0_6px_18px_-8px_#3B82F6]", bg: "bg-[#1e3a8a]" },
  { key: "support", label: "Needs Support", glow: "shadow-[0_6px_18px_-8px_#F59E0B]", bg: "bg-[#92400e]" },
  { key: "at-risk", label: "At-Risk", glow: "shadow-[0_6px_18px_-8px_#EF4444]", bg: "bg-[#7f1d1d]" },
];

function toggleHref(current: string[], band: string): string {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  let next: string[];
  if (band === "all") next = [];
  else if (current.includes(band)) next = current.filter((b) => b !== band);
  else next = [...current, band];
  if (next.length) params.set("band", next.join(","));
  else params.delete("band");
  const qs = params.toString();
  return `${typeof window !== "undefined" ? window.location.pathname : ""}${qs ? `?${qs}` : ""}`;
}

export function RiskFilter({ counts = {} as Partial<Record<Band, number>> }: { counts?: Partial<Record<Band, number>> }) {
  const active = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("band") || "").split(",").filter(Boolean)
    : [];
  return (
    <div className="risk-filter-group flex flex-wrap gap-2 items-center" role="group" aria-label="Filter by risk band (multi-select, OR logic)">
      {BANDS.map((b) => {
        const isActive = b.key === "all" ? active.length === 0 : active.includes(b.key);
        const n = b.key === "all" ? undefined : counts[b.key as Band];
        return (
          <a
            key={b.key}
            href={toggleHref(active, b.key)}
            data-band={b.key}
            aria-pressed={isActive}
            className={cn(
              "risk-pill inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white border border-white/20",
              b.bg, b.glow,
              isActive && "active outline outline-3 outline-white outline-offset-2 brightness-125"
            )}
          >
            {b.label}
            {typeof n === "number" && <span className="risk-count rounded-full bg-white/20 px-2 text-xs">{n}</span>}
          </a>
        );
      })}
      <span className="risk-hint text-xs text-[#9FB3C8]">Multi-select = show ANY selected band (OR). Filtering stays server-side via ?band=.</span>
    </div>
  );
}
