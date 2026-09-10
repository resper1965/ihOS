"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2, KeyRound } from "lucide-react";
import { updateUserStatus, updateUserRole, setUserPassword } from "./actions";

import { useToast } from "@/components/ui/toast";

interface UserRow {
  id: string;
  email?: string;
  created_at: string;
  status: string;
  role: string;
}

export function UserTable({ users }: { users: UserRow[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
  // Qual linha esta com o campo de senha aberto, e o que foi digitado nela.
  const [pwOpenId, setPwOpenId] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwSavingId, setPwSavingId] = useState<string | null>(null);
  const { error: toastError, success: toastSuccess } = useToast();

  const handleAction = async (id: string, newStatus: "approved" | "rejected") => {
    setLoadingId(id);
    try {
      await updateUserStatus(id, newStatus);
    } catch (err: unknown) {
      toastError(`Error updating user: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingId(null);
    }
  };

  // A action recusa papel fora da lista e recusa rebaixar o ultimo admin; o
  // erro dela chega aqui como toast em vez de sumir no console.
  const handleRoleChange = async (id: string, role: string) => {
    setRoleLoadingId(id);
    try {
      await updateUserRole(id, role);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : String(err));
    } finally {
      setRoleLoadingId(null);
    }
  };

  // A action recusa senha curta, senha vazia e o admin trocando a propria.
  // O erro dela chega como toast em vez de sumir no console.
  const handleSetPassword = async (id: string) => {
    setPwSavingId(id);
    try {
      await setUserPassword(id, pwValue);
      setPwOpenId(null);
      setPwValue("");
      toastSuccess("Password set.");
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : String(err));
    } finally {
      setPwSavingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <div className="space-y-3">
      {/* A consequencia fica escrita onde a decisao e tomada, nao so no codigo. */}
      <p className="text-xs text-text-muted">
        Setting someone&apos;s password means you know it. From then on, actions
        recorded in that person&apos;s name are no longer attributable to them
        alone.
      </p>
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-text-secondary">
          <thead className="bg-black/5 dark:bg-white/5 text-xs uppercase text-text-muted">
            <tr>
              <th className="px-6 py-4 font-medium">User</th>
              <th className="px-6 py-4 font-medium">Role</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Registered At</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-glass">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                <td className="px-6 py-4">
                  <div className="font-medium text-text-primary">{u.email || "No Email"}</div>
                  <div className="text-xs text-text-muted font-mono mt-0.5">{u.id}</div>
                </td>
                <td className="px-6 py-4">
                  <select
                    aria-label={`Role for ${u.email || u.id}`}
                    value={u.role}
                    disabled={roleLoadingId === u.id}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    className="rounded-lg border border-border-glass bg-bg-card px-2 py-1 text-xs text-text-primary disabled:opacity-50"
                  >
                    <option value="admin">admin</option>
                    <option value="ionic_user">ionic_user</option>
                    <option value="client_user">client_user</option>
                  </select>
                </td>
                <td className="px-6 py-4">
                  {u.status === "approved" && (
                    <Badge variant="success" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px]">
                      Approved
                    </Badge>
                  )}
                  {u.status === "pending" && (
                    <Badge variant="warning" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] animate-pulse">
                      Pending
                    </Badge>
                  )}
                  {u.status === "rejected" && (
                    <Badge variant="danger" className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-[10px]">
                      Rejected
                    </Badge>
                  )}
                </td>
                <td className="px-6 py-4 text-text-muted">
                  {formatDate(u.created_at)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {u.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleAction(u.id, "approved")}
                          disabled={loadingId === u.id}
                          className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Approve User"
                        >
                          {loadingId === u.id ? <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" /> : <CheckCircle className="h-4 w-4 stroke-[1.5]" />}
                        </button>
                        <button
                          onClick={() => handleAction(u.id, "rejected")}
                          disabled={loadingId === u.id}
                          className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Reject User"
                        >
                          {loadingId === u.id ? <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" /> : <XCircle className="h-4 w-4 stroke-[1.5]" />}
                        </button>
                      </>
                    )}
                    {pwOpenId === u.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          autoComplete="new-password"
                          aria-label={`New password for ${u.email || u.id}`}
                          value={pwValue}
                          onChange={(e) => setPwValue(e.target.value)}
                          placeholder="New password"
                          className="w-40 rounded-lg border border-border-glass bg-bg-card px-2 py-1 text-xs text-text-primary"
                        />
                        <button
                          onClick={() => handleSetPassword(u.id)}
                          disabled={pwSavingId === u.id}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                        >
                          {pwSavingId === u.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => { setPwOpenId(null); setPwValue(""); }}
                          className="rounded-lg px-2 py-1 text-xs text-text-muted hover:text-text-primary"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setPwOpenId(u.id); setPwValue(""); }}
                        className="p-1.5 text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                        title="Set this user's password"
                      >
                        <KeyRound className="h-4 w-4 stroke-[1.5]" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-text-muted">
                  No users found in the system.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}
