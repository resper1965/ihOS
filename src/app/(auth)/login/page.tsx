"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    // TODO: integrate with auth backend
    setTimeout(() => setIsLoading(false), 1500);
  }

  return (
    <div className="glass-card p-8">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20">
          <span className="text-2xl font-bold text-white">iH</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="gradient-text">ihOS</span>
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Ionic Health Operating System
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-text-secondary"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="voce@ionichealth.com"
            className="w-full rounded-xl border border-border-glass bg-white/5 px-4 py-3 text-sm text-text-primary outline-none transition-all duration-200 placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-text-secondary"
          >
            Senha
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full rounded-xl border border-border-glass bg-white/5 px-4 py-3 text-sm text-text-primary outline-none transition-all duration-200 placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Forgot password */}
        <div className="flex justify-end">
          <button
            type="button"
            className="text-xs text-text-muted transition-colors hover:text-primary"
          >
            Esqueceu a senha?
          </button>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-primary to-accent py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Entrando…
            </span>
          ) : (
            "Entrar"
          )}
        </button>
      </form>

      {/* Sign up link */}
      <p className="mt-6 text-center text-sm text-text-muted">
        Não tem conta?{" "}
        <Link
          href="/signup"
          className="font-medium text-primary transition-colors hover:text-primary-hover"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
