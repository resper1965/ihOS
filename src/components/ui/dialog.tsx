"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  /** Max width class, default max-w-lg */
  maxWidth?: string;
}

function Dialog({
  open,
  onClose,
  title,
  children,
  className = "",
  maxWidth = "max-w-lg",
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Focus trap
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`
          relative w-full ${maxWidth}
          glass-card border border-white/10 bg-slate-950/80 shadow-2xl p-6
          relative overflow-hidden transition-all duration-300 transform scale-100
          animate-in fade-in zoom-in-95 duration-200
          ${className}
        `}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
          {title ? (
            <h3 className="text-lg font-semibold text-text-primary">
              {title}
            </h3>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-white/10 hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="text-sm text-text-secondary leading-relaxed">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export { Dialog, type DialogProps };
