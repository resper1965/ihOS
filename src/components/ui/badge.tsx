import type { ReactNode } from "react";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  /** Show a pulsing dot indicator */
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  success: {
    bg: "bg-emerald-500/10 border-emerald-500/20",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  warning: {
    bg: "bg-amber-500/10 border-amber-500/20",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  danger: {
    bg: "bg-red-500/10 border-red-500/20",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  info: {
    bg: "bg-blue-500/10 border-blue-500/20",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  neutral: {
    bg: "bg-slate-500/10 border-slate-500/20",
    text: "text-slate-400",
    dot: "bg-slate-400",
  },
};

function Badge({ variant = "neutral", children, dot = false, className = "" }: BadgeProps) {
  const styles = variantStyles[variant];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5
        text-xs font-medium transition-colors
        ${styles.bg} ${styles.text}
        ${className}
      `}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${styles.dot}`}
          />
          <span
            className={`relative inline-flex h-1.5 w-1.5 rounded-full ${styles.dot}`}
          />
        </span>
      )}
      {children}
    </span>
  );
}

export { Badge, type BadgeProps, type BadgeVariant };
