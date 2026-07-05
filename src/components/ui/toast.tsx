"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, XCircle, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  description?: string;
}

interface ToastContextType {
  toast: (message: string, options?: { type?: ToastType; description?: string; duration?: number }) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, options: { type?: ToastType; description?: string; duration?: number } = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    const { type = "info", description, duration = 5000 } = options;

    setToasts((prev) => [...prev, { id, message, type, description }]);

    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  const success = useCallback((message: string, description?: string) => toast(message, { type: "success", description }), [toast]);
  const error = useCallback((message: string, description?: string) => toast(message, { type: "error", description }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error }}>
      {children}
      <div className="fixed bottom-0 right-0 z-[100] flex flex-col gap-2 p-6 sm:max-w-md">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`group relative flex w-full gap-3 overflow-hidden rounded-2xl border p-4 shadow-2xl animate-in slide-in-from-right-full duration-300 backdrop-blur-xl ${
              t.type === "success" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500" :
              t.type === "error" ? "border-red-500/20 bg-red-500/10 text-red-500" :
              t.type === "warning" ? "border-amber-500/20 bg-amber-500/10 text-amber-500" :
              "border-primary/20 bg-primary/10 text-primary"
            }`}
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center">
              {t.type === "success" && <CheckCircle2 className="h-5 w-5" />}
              {t.type === "error" && <XCircle className="h-5 w-5" />}
              {t.type === "warning" && <AlertCircle className="h-5 w-5" />}
              {t.type === "info" && <Info className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold leading-tight">{t.message}</p>
              {t.description && <p className="mt-1 text-xs opacity-80">{t.description}</p>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="absolute right-2 top-2 rounded-lg p-1 opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100 dark:hover:bg-white/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
