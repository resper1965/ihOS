import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Users } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UserTable } from "./user-table";

export default async function AdminUsersPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    redirect("/"); // Not authorized
  }

  // Use service role to fetch all users and their profiles
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  const { data: profiles, error: profError } = await supabaseAdmin.from("profiles").select("*");

  const usersWithProfiles = users.map(u => {
    const prof = profiles?.find(p => p.id === u.id);
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      status: prof?.status || "pending",
      role: prof?.role || "ionic_user",
    };
  });

  // Sort: Pending first, then by date descending
  usersWithProfiles.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <>
      <PageTitleRegistrar 
        title="User Management" 
        subtitle="Manage access and approvals for the platform" 
        icon={<Users className="h-4 w-4 text-blue-400" />} 
      />
      <div className="space-y-6">
        <UserTable users={usersWithProfiles} />
      </div>
    </>
  );
}
