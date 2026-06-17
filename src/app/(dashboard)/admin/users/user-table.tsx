"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { updateUserStatus } from "./actions";

interface UserRow {
  id: string;
  email?: string;
  created_at: string;
  status: string;
  role: string;
}

export function UserTable({ users }: { users: UserRow[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleAction = async (id: string, newStatus: "approved" | "rejected") => {
    setLoadingId(id);
    try {
      await updateUserStatus(id, newStatus);
    } catch (err: any) {
      alert(`Error updating user: ${err.message}`);
    } finally {
      setLoadingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-white/5 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-6 py-4 font-medium">User</th>
              <th className="px-6 py-4 font-medium">Role</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Registered At</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.02]">
                <td className="px-6 py-4">
                  <div className="font-medium text-white">{u.email || "No Email"}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{u.id}</div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant="neutral" className="text-[10px]">
                    {u.role}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  {u.status === "approved" && (
                    <Badge variant="success" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                      Approved
                    </Badge>
                  )}
                  {u.status === "pending" && (
                    <Badge variant="warning" className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] animate-pulse">
                      Pending
                    </Badge>
                  )}
                  {u.status === "rejected" && (
                    <Badge variant="danger" className="bg-red-500/10 text-red-400 border border-red-500/20 text-[10px]">
                      Rejected
                    </Badge>
                  )}
                </td>
                <td className="px-6 py-4 text-slate-400">
                  {formatDate(u.created_at)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {u.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleAction(u.id, "approved")}
                          disabled={loadingId === u.id}
                          className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Approve User"
                        >
                          {loadingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => handleAction(u.id, "rejected")}
                          disabled={loadingId === u.id}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Reject User"
                        >
                          {loadingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        </button>
                      </>
                    )}
                    {u.status !== "pending" && u.role !== "admin" && (
                      <span className="text-xs text-slate-500 italic">No actions</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No users found in the system.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
