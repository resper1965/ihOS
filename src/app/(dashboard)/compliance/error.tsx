"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ComplianceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[compliance] page error:", error);
  }, [error]);

  return (
    <div className="flex max-w-lg flex-col items-center justify-center px-4 py-24">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
        <AlertTriangle className="h-8 w-8 text-red-400" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-text-primary">
        Erro ao carregar dados
      </h2>
      <p className="mb-6 text-center text-sm text-text-secondary">
        Não foi possível carregar os dados de compliance.
        Tente novamente ou contate o suporte se o problema persistir.
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/25 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 active:scale-95"
      >
        <RefreshCw className="h-4 w-4" />
        Tentar novamente
      </button>
      {error.digest && (
        <p className="mt-4 text-xs text-text-muted">
          Código: {error.digest}
        </p>
      )}
    </div>
  );
}
