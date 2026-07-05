"use client";

import { Dialog } from "./dialog";
import { Button } from "./button";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary";
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary",
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4 pt-2">
        <div className="flex items-start gap-4">
          <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            variant === "danger" ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"
          }`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            loading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
