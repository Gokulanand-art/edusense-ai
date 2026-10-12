import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/utils";

type Size = "sm" | "md" | "lg";
type Variant = "primary" | "ghost";

export function Button({
  size = "md",
  variant = "primary",
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: Size; variant?: Variant; icon?: ReactNode }) {
  return (
    <button
      className={cn(
        "btn-navy inline-flex items-center gap-2 rounded-xl font-semibold text-white",
        "bg-gradient-to-br from-[#00C2FF] to-[#3B82F6]",
        "shadow-[0_8px_20px_-8px_rgba(0,194,255,0.55)] hover:-translate-y-px hover:brightness-110",
        "active:translate-y-0 active:brightness-95 focus-visible:outline focus-visible:outline-3 focus-visible:outline-[#00C2FF]",
        "disabled:opacity-55 disabled:cursor-not-allowed",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-[18px] py-2.5 text-sm",
        size === "lg" && "px-6 py-3.5 text-base",
        variant === "ghost" && "bg-white/10 border border-white/15 shadow-none hover:bg-white/[0.14]",
        className
      )}
      {...rest}
    >
      {icon && <span className="btn-icon inline-flex" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
