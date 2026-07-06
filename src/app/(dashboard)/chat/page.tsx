"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Send,
  Sparkles,
  Loader2,
  Bot,
  ShieldCheck,
  FileSearch,
  BarChart3,
  Paperclip,
  X,
  FileSpreadsheet,
  AlertCircle,
  FileText,
} from "lucide-react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { SuggestionChips } from "@/components/chat/suggestion-chips";
import { QuestionnaireReview } from "@/components/chat/questionnaire-review";
import { ConversationList } from "@/components/chat/conversation-list";
import { useQuestionnaire } from "@/hooks/useQuestionnaire";
import { useVersion } from "@/lib/context/version-context";
import { Progress } from "@/components/ui/progress";
import type { UIMessage } from "ai";

const SUGGESTION_CHIPS = [
  { text: "What is our ISO 27001 score?", icon: ShieldCheck },
  { text: "Analyze ISO 27701 gaps", icon: FileSearch },
  { text: "Executive summary", icon: BarChart3 },
] as const;

const ACCEPTED_FILE_TYPES = ".xlsx,.csv,.pdf";

interface ChatPageProps {
  /** When provided, the page loads an existing conversation */
  conversationId?: string;
}

export default function ChatPage({ conversationId: initialConversationId }: ChatPageProps = {}) {
  const { activeVersion } = useVersion();
  const router = useRouter();
  const pathname = usePathname();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId ?? null
  );
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationListRef = useRef<{ refresh: () => void }>(null);

  const questionnaire = useQuestionnaire();

  // ── Load conversation messages ─────────────────────────────────────────
  const loadConversation = useCallback(async (convId: string) => {
    setIsLoadingConversation(true);
    setChatError(null);
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setChatError("Conversation not found.");
          return;
        }
        throw new Error(`Failed to load conversation: ${res.status}`);
      }
      const { data } = await res.json();
      // Convert DB messages to UIMessage format
      const uiMessages: UIMessage[] = (data.messages ?? []).map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "assistant",
        content: msg.content ?? "",
        parts: [{ type: "text" as const, text: msg.content ?? "" }],
      }));
      setInitialMessages(uiMessages);
    } catch (err) {
      console.error("[ChatPage] Load conversation error:", err);
      setChatError("Error loading conversation.");
    } finally {
      setIsLoadingConversation(false);
    }
  }, []);

  // Load conversation when activeConversationId changes
  useEffect(() => {
    if (activeConversationId) {
      loadConversation(activeConversationId);
    } else {
      setInitialMessages([]);
    }
  }, [activeConversationId, loadConversation]);

  // Custom fetch to intercept X-Conversation-Id header from response
  const customFetch = useCallback(async (url: string | URL | Request, init?: RequestInit) => {
    const response = await fetch(url, init);
    const newConvId = response.headers.get("X-Conversation-Id");
    if (newConvId && newConvId !== activeConversationId) {
      setActiveConversationId(newConvId);
      window.history.replaceState(null, "", `/chat/${newConvId}`);
      // Refresh sidebar after a short delay to let the DB persist
      setTimeout(() => conversationListRef.current?.refresh(), 500);
    }
    return response;
  }, [activeConversationId]);

  // AI SDK v6: useChat returns sendMessage/messages/status/error/setMessages
  // Input state is managed locally since v6 doesn't provide it
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error: chatHookError,
  } = useChat({
    id: activeConversationId ?? undefined,
    messages: initialMessages.length > 0 ? initialMessages : undefined,
    transport: new DefaultChatTransport({
      fetch: customFetch as typeof globalThis.fetch,
    }),
    onError: (error) => {
      console.error("[ChatPage] Chat error:", error);
      setChatError(error.message || "Error processing message. Please try again.");
    },
  });

  // Sync initialMessages into useChat when they change
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages]);

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clear error after 8 seconds
  useEffect(() => {
    if (chatError) {
      const timer = setTimeout(() => setChatError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [chatError]);

  // ── Handlers ───────────────────────────────────────────────────────────

  function doSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setChatError(null);
    sendMessage(
      { text: trimmed },
      {
        body: {
          conversationId: activeConversationId,
          productVersionId: activeVersion?.id ?? null,
        },
      }
    );
    setInput("");
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSend(input);
  }

  function handleSuggestionClick(text: string) {
    doSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend(input);
    }
  }

  function handleSelectConversation(id: string) {
    setActiveConversationId(id);
    router.push(`/chat/${id}`);
  }

  function handleNewConversation(id?: string) {
    setActiveConversationId(id ?? null);
    setMessages([]);
    setChatError(null);
    if (id) {
      router.push(`/chat/${id}`);
    } else {
      router.push("/chat");
    }
  }

  // ── Textarea auto-resize ───────────────────────────────────────────────
  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // ── File upload handlers ───────────────────────────────────────────────

  function handleFileButtonClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    questionnaire.uploadFile(file);
    e.target.value = "";
  }

  function handleRemoveFile() {
    questionnaire.reset();
  }

  // ── Derived state ──────────────────────────────────────────────────────

  const isQuestionnaireActive = questionnaire.state !== "idle";
  const showReviewModal = questionnaire.state === "reviewing";
  const isQuestionnaireProcessing =
    questionnaire.state === "uploading" ||
    questionnaire.state === "parsing" ||
    questionnaire.state === "generating" ||
    questionnaire.state === "promoting" ||
    questionnaire.state === "downloading";

  const processingLabels: Record<string, string> = {
    uploading: "Uploading file...",
    parsing: "Analyzing questions...",
    generating: "Generating answers with AI...",
    promoting: "Saving to knowledge base...",
    downloading: "Preparing download...",
  };

  const isEmpty = messages.length === 0 && !isLoadingConversation;

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      {/* Mobile Chat Sidebar Toggle */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="absolute left-4 top-4 z-20 rounded-lg border border-border-glass bg-bg-card/80 p-2 text-text-secondary backdrop-blur-md hover:text-text-primary lg:hidden"
        aria-label="View history"
      >
        <FileText className="h-5 w-5" />
      </button>

      {/* Mobile Overlay */}
      {mobileSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Conversation sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-72 transform bg-bg-card transition-transform duration-300 ease-in-out border-r border-border-glass
        lg:relative lg:translate-x-0 lg:w-64 lg:z-0 lg:bg-black/[0.01] lg:dark:bg-white/[0.01]
        ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-4 lg:hidden">
            <span className="font-bold text-text-primary">Chat History</span>
            <button onClick={() => setMobileSidebarOpen(false)} className="rounded-lg p-1 text-text-muted hover:bg-white/5 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ConversationList
              ref={conversationListRef}
              activeConversationId={activeConversationId}
              onSelectConversation={(id) => {
                handleSelectConversation(id);
                setMobileSidebarOpen(false);
              }}
              onNewConversation={() => {
                handleNewConversation();
                setMobileSidebarOpen(false);
              }}
            />
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingConversation ? (
          <div className="flex h-full flex-col items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="mt-2 text-sm text-text-muted">Loading conversation...</p>
          </div>
        ) : isEmpty ? (
          /* ─── Empty State ─── */
          <div className="flex h-full flex-col items-center justify-center px-4">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-2xl shadow-primary/20">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h2 className="mb-2 text-xl font-bold">
              <span className="gradient-text">ihOS AI</span>
            </h2>
            <p className="mb-8 max-w-md text-center text-sm text-text-secondary">
              Intelligent compliance assistant. Ask about frameworks,
              gaps, documents, or request detailed analyses.
            </p>

            {/* Suggestion chips */}
            <SuggestionChips chips={SUGGESTION_CHIPS} onClick={handleSuggestionClick} />
          </div>
        ) : (
          /* ─── Message List ─── */
          <div className="space-y-6 py-6 px-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="glass-card flex items-center gap-2 px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-text-muted">Analyzing...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ─── Error Banner ─── */}
      {(chatError || chatHookError) && (
        <div className="mx-2 mb-3">
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span className="text-sm text-red-400">
              {chatError || chatHookError?.message || "Unexpected error."}
            </span>
            <button
              onClick={() => setChatError(null)}
              className="ml-auto shrink-0 rounded-lg p-1 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Processing Progress Overlay ─── */}
      {isQuestionnaireProcessing && (
        <div className="mx-2 mb-3">
          <div className="glass-card flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-sm text-text-secondary">
                {processingLabels[questionnaire.state] ?? "Processando…"}
              </p>
              <Progress
                value={questionnaire.progress}
                size="sm"
                showPercentage={false}
              />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-text-muted">
              {Math.round(questionnaire.progress)}%
            </span>
          </div>
        </div>
      )}

      {/* ─── Questionnaire Error Banner ─── */}
      {questionnaire.state === "error" && (
        <div className="mx-2 mb-3">
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3">
            <span className="text-sm text-red-400">{questionnaire.error}</span>
            <button
              onClick={handleRemoveFile}
              className="ml-auto shrink-0 rounded-lg p-1 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Complete Banner ─── */}
      {questionnaire.state === "complete" && (
        <div className="mx-2 mb-3">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3">
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-emerald-400">
              Questionnaire exported successfully!
            </span>
            <button
              onClick={handleRemoveFile}
              className="ml-auto shrink-0 rounded-lg p-1 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Input Area ─── */}
      <div className="shrink-0 border-t border-border-glass pb-4 pt-4 px-4">
        {/* File badge */}
        {isQuestionnaireActive && questionnaire.fileName && questionnaire.state !== "error" && questionnaire.state !== "complete" && (
          <div className="mb-2 flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary">
              <FileSpreadsheet className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{questionnaire.fileName}</span>
              {!isQuestionnaireProcessing && (
                <button
                  onClick={handleRemoveFile}
                  className="ml-1 rounded p-0.5 hover:bg-primary/20 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        <form
          id="chat-form"
          onSubmit={handleSubmit}
          className="glass-card flex items-end gap-3 p-3"
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload questionnaire"
          />

          {/* Paperclip button */}
          <button
            type="button"
            onClick={handleFileButtonClick}
            disabled={isQuestionnaireProcessing}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted transition-all duration-200 hover:bg-black/[0.04] dark:hover:bg-white/5 hover:text-primary active:scale-95 disabled:opacity-40"
            title="Upload questionnaire (.xlsx, .csv, .pdf)"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about compliance, frameworks, gaps..."
            aria-label="Chat message"
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
            style={{ maxHeight: "160px" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/25 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-text-muted">
          ihOS AI can make mistakes. Verify important information.
        </p>
      </div>

      {/* ─── Questionnaire Review Modal ─── */}
      {showReviewModal && (
        <QuestionnaireReview
          items={questionnaire.answers}
          onUpdateAnswer={questionnaire.updateAnswer}
          onSetStatus={questionnaire.setStatus}
          onApproveAll={questionnaire.approveAll}
          onPromoteAndDownload={questionnaire.promoteAndDownload}
          onClose={questionnaire.reset}
          isProcessing={false}
          progress={questionnaire.progress}
          fileName={questionnaire.fileName}
        />
      )}

      {/* ─── Promote/Download Processing Modal ─── */}
      {(questionnaire.state === "promoting" || questionnaire.state === "downloading") && (
        <QuestionnaireReview
          items={questionnaire.answers}
          onUpdateAnswer={questionnaire.updateAnswer}
          onSetStatus={questionnaire.setStatus}
          onApproveAll={questionnaire.approveAll}
          onPromoteAndDownload={questionnaire.promoteAndDownload}
          onClose={questionnaire.reset}
          isProcessing={true}
          progress={questionnaire.progress}
          processingLabel={processingLabels[questionnaire.state]}
          fileName={questionnaire.fileName}
        />
      )}
      </div>
    </div>
  );
}
