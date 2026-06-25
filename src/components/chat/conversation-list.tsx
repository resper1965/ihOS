"use client";

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { Plus, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/lib/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(isoDate: string | null): string {
  if (!isoDate) return "";
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function truncateTitle(title: string | null): string {
  if (!title) return "Nova Conversa";
  return title.length > 40 ? title.slice(0, 40) + "…" : title;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props & Ref
// ─────────────────────────────────────────────────────────────────────────────

interface ConversationListProps {
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onNewConversation?: (id?: string) => void;
}

export interface ConversationListHandle {
  refresh: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const ConversationList = forwardRef<ConversationListHandle, ConversationListProps>(
  function ConversationList({ activeConversationId, onSelectConversation, onNewConversation }, ref) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    // Stable Supabase client — created once via useRef
    const supabaseRef = useRef(createClient());
    const supabase = supabaseRef.current;

    // Fetch conversations — stable callback (no supabase in deps)
    const fetchConversations = useCallback(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from("conversations")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          console.warn("[conversation-list] fetch error:", error);
          return;
        }

        setConversations(data ?? []);
      } catch (err) {
        console.warn("[conversation-list] unexpected error:", err);
      } finally {
        setIsLoading(false);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      fetchConversations();
    }, [fetchConversations]);

    // Expose refresh method via ref
    useImperativeHandle(ref, () => ({
      refresh: fetchConversations,
    }), [fetchConversations]);

    // Create new conversation (now just signals parent — parent manages state)
    function handleCreate() {
      onNewConversation?.();
    }

    // Delete conversation
    async function handleDelete(id: string) {
      const confirmed = window.confirm("Tem certeza que deseja excluir esta conversa?");
      if (!confirmed) return;

      setDeletingId(id);
      try {
        const { error } = await supabase
          .from("conversations")
          .delete()
          .eq("id", id);

        if (error) {
          console.warn("[conversation-list] delete error:", error);
          return;
        }

        setConversations((prev) => prev.filter((c) => c.id !== id));
      } catch (err) {
        console.warn("[conversation-list] delete unexpected error:", err);
      } finally {
        setDeletingId(null);
      }
    }

    return (
      <div className="flex h-full flex-col">
        {/* Header + New button */}
        <div className="flex items-center justify-between border-b border-border-glass px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Conversas</h3>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-primary/20 transition-all duration-200 hover:shadow-md hover:shadow-primary/30 hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Nova
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
                  <div className="h-8 w-8 animate-shimmer rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-3/4 animate-shimmer rounded" />
                    <div className="h-3 w-1/3 animate-shimmer rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10">
              <MessageSquare className="mb-2 h-8 w-8 text-slate-600" />
              <p className="text-center text-sm text-text-muted">
                Nenhuma conversa ainda. Envie uma mensagem para iniciar.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                  <div
                    key={conv.id}
                    onMouseEnter={() => setHoveredId(conv.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer ${
                      isActive
                        ? "border border-primary/30 bg-primary/5 shadow-sm shadow-primary/10"
                        : "hover:bg-black/[0.03] dark:hover:bg-white/5"
                    }`}
                    onClick={() => onSelectConversation?.(conv.id)}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isActive ? "bg-primary/10" : "bg-black/[0.03] dark:bg-white/5"
                      }`}
                    >
                      <MessageSquare
                        className={`h-4 w-4 ${
                          isActive ? "text-primary" : "text-slate-500"
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm ${
                          isActive
                            ? "font-medium text-primary"
                            : "text-text-secondary"
                        }`}
                      >
                        {truncateTitle(conv.title)}
                      </p>
                      <p className="text-xs text-text-muted">
                        {relativeTime(conv.created_at)}
                      </p>
                    </div>

                    {/* Delete button on hover */}
                    {hoveredId === conv.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(conv.id);
                        }}
                        disabled={deletingId === conv.id}
                        className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        aria-label="Excluir conversa"
                      >
                        {deletingId === conv.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }
);
