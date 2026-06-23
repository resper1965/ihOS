"use client";

import { useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/supabase/auth-actions";

function LoginContent() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  const callbackError = searchParams.get("error");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("redirectTo", redirectTo);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="glass-card p-8">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center">
          <img src="/ionic-icon.png" alt="Ionic Health" className="h-12 w-12" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="gradient-text">ihOS</span>
        </h1>
        <p className="mt-1 text-sm text-text-secondary">Ionic Health Operating System</p>
      </div>

      {(error || callbackError) && (
        <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error ?? "Authentication error. Please try again."}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@ionichealth.com"
            className="w-full rounded-xl border border-border-glass bg-black/[0.03] dark:bg-white/5 px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-text-secondary">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-xl border border-border-glass bg-black/[0.03] dark:bg-white/5 px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex justify-end">
          <button type="button" className="text-xs text-text-muted hover:text-primary transition-colors">
            Forgot password?
          </button>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-primary to-accent py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Signing in...
            </span>
          ) : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-text-muted">
        Don't have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:text-primary-hover">Sign Up</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="glass-card flex items-center justify-center p-12 min-w-[320px]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-text-muted">Loading...</span>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
