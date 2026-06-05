"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signUp } from "@/lib/supabase/auth-actions";

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signUp(formData);
      if (result.error) setError(result.error);
      else setSuccess(true);
    });
  }

  return (
    <div className="glass-card p-8">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20">
          <span className="text-2xl font-bold text-white">iH</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="gradient-text">Criar Conta</span>
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Junte-se ao Ionic Health Operating System
        </p>
      </div>

      {success && (
        <div className="mb-5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-4 text-sm text-accent">
          <p className="font-medium">✓ Conta criada com sucesso!</p>
          <p className="mt-1 opacity-80">Verifique seu e-mail para confirmar o cadastro.</p>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!success && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="voce@ionichealth.com"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary">Confirmar Senha</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Repita a senha"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-gradient-to-r from-primary to-accent py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {isPending ? "Criando conta…" : "Cadastrar"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-text-muted">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary hover:text-primary-hover">Entrar</Link>
      </p>
    </div>
  );
}
