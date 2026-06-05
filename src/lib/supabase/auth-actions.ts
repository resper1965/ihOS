"use server";

import { redirect } from "next/navigation";
import { createClient } from "./server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthResult {
  error: string | null;
}

// ---------------------------------------------------------------------------
// Sign In — email + password
// ---------------------------------------------------------------------------

export async function signIn(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string | null;
  const password = formData.get("password") as string | null;
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";

  if (!email || !password) {
    return { error: "Preencha e-mail e senha." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      return { error: "E-mail ou senha incorretos." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { error: "Confirme seu e-mail antes de entrar." };
    }
    return { error: error.message };
  }

  redirect(redirectTo);
}

// ---------------------------------------------------------------------------
// Sign Up — email + password
// ---------------------------------------------------------------------------

export async function signUp(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string | null;
  const password = formData.get("password") as string | null;
  const confirmPassword = formData.get("confirmPassword") as string | null;

  if (!email || !password || !confirmPassword) {
    return { error: "Preencha todos os campos." };
  }

  if (password !== confirmPassword) {
    return { error: "As senhas não coincidem." };
  }

  if (password.length < 6) {
    return { error: "A senha deve ter pelo menos 6 caracteres." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/callback`,
    },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "Este e-mail já está cadastrado." };
    }
    return { error: error.message };
  }

  return { error: null };
}

// ---------------------------------------------------------------------------
// Sign Out
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
