import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  /** Hint text displayed below the input */
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, hint, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
              <span className="text-text-muted">{icon}</span>
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full rounded-xl border bg-white/5 px-4 py-2.5 text-sm
              text-text-primary outline-none
              transition-all duration-300
              placeholder:text-text-muted
              focus:border-primary/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-primary/20
              ${icon ? "pl-10" : ""}
              ${
                error
                  ? "border-danger/50 focus:border-danger/70 focus:ring-danger/20"
                  : "border-border-glass hover:border-border-glass-hover"
              }
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="flex items-center gap-1 text-xs text-danger">
            <span className="inline-block h-1 w-1 rounded-full bg-danger" />
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-xs text-text-muted">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input, type InputProps };
