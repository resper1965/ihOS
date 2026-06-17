"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/lib/supabase/auth-actions";

export function LogOutButton() {
  return (
    <button
      onClick={() => signOut()}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/20"
    >
      <LogOut className="h-4 w-4" />
      Sign Out
    </button>
  );
}
