import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  /** Optional action element rendered in the card header */
  action?: ReactNode;
  /** Optional icon rendered beside the title */
  icon?: ReactNode;
}

function Card({
  title,
  children,
  className = "",
  hoverable = false,
  action,
  icon,
}: CardProps) {
  return (
    <div
      className={`
        glass-card p-6
        ${hoverable ? "cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/5" : ""}
        ${className}
      `}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
                {icon}
              </div>
            )}
            {title && (
              <h3 className="text-lg font-semibold text-text-primary">
                {title}
              </h3>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export { Card, type CardProps };
