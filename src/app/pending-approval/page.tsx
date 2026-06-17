import { Clock, ShieldAlert } from "lucide-react";
import { LogOutButton } from "./logout-button";

export default function PendingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#1e293b]/95 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-amber-500">
            <Clock className="h-8 w-8" />
          </div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-white">
            Approval Pending
          </h1>
          <p className="mb-6 text-sm text-slate-400">
            Your account was created successfully, but it requires administrator approval before you can access the platform.
          </p>
          
          <div className="mb-8 rounded-xl bg-white/5 p-4 text-left">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
              <p className="text-xs text-slate-300">
                Please contact <strong className="text-white">resper@ionic.health</strong> to request access to the ihOS platform.
              </p>
            </div>
          </div>
          
          <LogOutButton />
        </div>
      </div>
    </div>
  );
}
