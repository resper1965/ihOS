"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// `profiles` NAO esta nos tipos gerados do Supabase (src/lib/supabase/types).
// O cliente tipado resolve as colunas dessa tabela para `never`, entao toda
// leitura e escrita aqui falharia a compilacao com um erro que nao e sobre o
// codigo -- e sobre o gerador de tipos estar desatualizado. Enquanto ele nao
// for regenerado, estas duas actions falam com o banco por uma forma estrutural
// minima, que descreve exatamente o que elas usam e nada mais.
type ProfileWriter = {
  from(table: "profiles"): {
    select(cols: string, opts?: { count: "exact"; head: true }): {
      eq(col: string, value: string): Promise<{ count: number | null; error: { message: string } | null }> & {
        single(): Promise<{ data: { role?: string } | null; error: { message: string } | null }>;
      };
    };
    update(values: Record<string, string>): {
      eq(col: string, value: string): Promise<{ error: { message: string } | null }>;
    };
  };
};

const profileWriter = () => createAdminClient() as unknown as ProfileWriter;

// Papeis que a interface pode atribuir. A lista e fechada de proposito: o
// argumento de uma server action e o que o chamador mandou, e um papel fora
// desta lista viraria texto livre na coluna `role` -- toda checagem de papel
// no resto do sistema pararia de casar, em silencio.
const ASSIGNABLE_ROLES = ["admin", "ionic_user", "client_user"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Sessao valida cujo dono e admin. Lanca em qualquer outro caso. */
async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized: Must be logged in");
  }
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    throw new Error("Forbidden: Requires admin privileges");
  }
  return user;
}

export async function updateUserStatus(userId: string, status: "approved" | "rejected") {
  await requireAdmin();

  const { error } = await profileWriter()
    .from("profiles")
    .update({ status })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/users");
}

/**
 * Troca o papel de um usuario.
 *
 * Duas guardas que a irma acima nao precisa ter:
 *
 *   1. O papel e validado contra ASSIGNABLE_ROLES antes de tocar o banco.
 *   2. O ultimo admin nao pode ser rebaixado. Sem isso, um clique tranca
 *      /admin/users para todo mundo e a unica saida e editar `profiles` direto
 *      no Supabase -- um estado do qual a aplicacao nao se recupera sozinha.
 *
 * Auto-rebaixamento com dois ou mais admins continua permitido: e reversivel
 * por qualquer um dos que sobram.
 */
export async function updateUserRole(userId: string, role: string) {
  await requireAdmin();

  if (!ASSIGNABLE_ROLES.includes(role as AssignableRole)) {
    throw new Error(
      `Unknown role "${role}". Assignable roles: ${ASSIGNABLE_ROLES.join(", ")}.`,
    );
  }

  const admin = profileWriter();

  // Promover nunca reduz a populacao de admins, entao a guarda so roda quando
  // o papel novo NAO e admin.
  if (role !== "admin") {
    const { data: target } = await admin
      .from("profiles").select("role").eq("id", userId).single();

    if ((target as { role?: string } | null)?.role === "admin") {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");

      if ((count ?? 0) <= 1) {
        throw new Error(
          "Refusing to demote the last admin: nobody would be able to reach " +
            "user management afterwards. Promote someone else first.",
        );
      }
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/users");
}
