"use client";

import { useState } from "react";
import { Target, CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCreateGoal } from "@/hooks/queries/use-goals";
import { useUser } from "@/hooks/use-user";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreateGoalFromGapProps {
  controlCode: string;
  controlName: string | null;
  missingElements: string[] | null;
  frameworkCode: string;
  assessmentId: string;
}

// ---------------------------------------------------------------------------
// CreateGoalFromGap
// ---------------------------------------------------------------------------
export function CreateGoalFromGap({
  controlCode,
  controlName,
  missingElements,
  frameworkCode,
  assessmentId,
}: CreateGoalFromGapProps) {
  const { user } = useUser();
  const createGoal = useCreateGoal();

  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill values
  const defaultTitle = `Remediate: ${controlCode}${controlName ? ` — ${controlName}` : ""}`;
  const defaultDescription = missingElements?.length
    ? missingElements.map((el) => `• ${el}`).join("\n")
    : "No specific missing elements identified.";

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);

  async function handleCreate() {
    if (!user?.id) return;
    setError(null);

    try {
      await createGoal.mutateAsync({
        user_id: user.id,
        framework_code: frameworkCode,
        title,
        description,
        source_assessment_id: assessmentId,
        source_control_code: controlCode,
      });
      setOpen(false);
      setCreated(true);
      // Reset after brief visual feedback
      setTimeout(() => setCreated(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal");
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={
          created ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Target className="h-3.5 w-3.5" />
          )
        }
        onClick={() => {
          setTitle(defaultTitle);
          setDescription(defaultDescription);
          setError(null);
          setOpen(true);
        }}
        className={created ? "text-emerald-400" : ""}
        disabled={created}
      >
        {created ? "Goal Created" : "Create Goal"}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create Remediation Goal"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          {/* Source info */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="info">{frameworkCode}</Badge>
            <span className="text-xs text-text-muted font-mono">
              {controlCode}
            </span>
          </div>

          {/* Title */}
          <Input
            label="Goal Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            hint="Auto-generated from the control code. Feel free to edit."
          />

          {/* Description */}
          <div className="w-full space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="
                w-full rounded-xl border border-border-glass bg-black/[0.03] dark:bg-white/5
                px-4 py-2.5 text-sm text-text-primary outline-none
                transition-all duration-300 placeholder:text-text-muted
                focus:border-primary/50 focus:bg-transparent dark:focus:bg-transparent
                focus:ring-2 focus:ring-primary/20
                hover:border-border-glass-hover resize-none
              "
              placeholder="Missing elements from the gap assessment…"
            />
            <p className="text-xs text-text-muted">
              Pre-filled with missing elements from the compliance evaluation.
            </p>
          </div>

          {/* Source metadata (read-only) */}
          <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2 text-xs text-text-muted space-y-1">
            <p>
              <span className="text-text-secondary">Assessment:</span>{" "}
              <span className="font-mono">{assessmentId.slice(0, 8)}…</span>
            </p>
            <p>
              <span className="text-text-secondary">Control:</span>{" "}
              <span className="font-mono">{controlCode}</span>
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <span className="inline-block h-1 w-1 rounded-full bg-red-400" />
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={createGoal.isPending}
              icon={<Target className="h-4 w-4" />}
              onClick={handleCreate}
              disabled={!title.trim() || !user?.id}
            >
              Create Goal
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
