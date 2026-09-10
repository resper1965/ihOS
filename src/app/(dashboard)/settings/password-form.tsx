"use client";

// Troca de senha do proprio usuario.
//
// O Supabase nao expoe "verificar senha atual": updateUser({ password }) troca
// a senha de quem tem a sessao, sem perguntar mais nada. Isso significa que
// qualquer um que alcance uma sessao viva pode trocar a senha e trancar o dono
// para fora. Entao a senha atual e confirmada re-autenticando primeiro
// (signInWithPassword com o e-mail da propria sessao) e a troca so acontece se
// isso passar.
//
// A re-autenticacao usa o mesmo e-mail da sessao corrente, nunca um digitado:
// o campo de e-mail nao existe justamente para nao virar um formulario de
// login disfarcado.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Loader2 } from "lucide-react";

/** Piso local. O Supabase tem a regra dele e recusa por cima desta. */
const MIN_LENGTH = 8;

export function PasswordForm({ email }: { email: string | null }) {
  const { error: toastError, success: toastSuccess } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const disabled = saving || !current || !next || !confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toastError("Could not read the session's e-mail. Sign in again.");
      return;
    }
    if (next !== confirm) {
      toastError("The new password and its confirmation do not match.");
      return;
    }
    if (next.length < MIN_LENGTH) {
      toastError(`The new password must have at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next === current) {
      toastError("The new password is the same as the current one.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // Confirma a senha atual antes de trocar qualquer coisa.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (reauthError) {
        toastError("The current password is not correct.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        toastError(error.message);
        return;
      }

      setCurrent("");
      setNext("");
      setConfirm("");
      toastSuccess("Password changed.");
    } catch (err) {
      toastError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-text-muted">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded-lg border border-border-glass bg-bg-card px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-muted">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full rounded-lg border border-border-glass bg-bg-card px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-muted">Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-border-glass bg-bg-card px-3 py-2 text-sm text-text-primary"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Change password
      </button>
    </form>
  );
}
