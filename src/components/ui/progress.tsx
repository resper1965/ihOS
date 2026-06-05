interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

function Progress({
  value,
  max = 100,
  label,
  showPercentage = true,
  size = "md",
  className = "",
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="mb-1.5 flex items-center justify-between">
          {label && (
            <span className="text-sm font-medium text-text-secondary">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className="text-sm font-semibold tabular-nums text-text-primary">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-white/5 ${sizeStyles[size]}`}
      >
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
          style={{ width: `${percentage}%` }}
        >
          {/* Shimmer overlay */}
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div
              className="absolute inset-0 -translate-x-full animate-[shimmer-bar_2s_ease-in-out_infinite]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
              }}
            />
          </div>
        </div>
      </div>
      <style>{`
        @keyframes shimmer-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

export { Progress, type ProgressProps };
