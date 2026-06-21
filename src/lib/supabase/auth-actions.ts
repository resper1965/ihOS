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
    return { error: "Please enter your email and password." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      return { error: "Incorrect email or password." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { error: "Please confirm your email before signing in." };
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
    return { error: "Please fill in all fields." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long." };
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
      return { error: "This email is already registered." };
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
