"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { SuggestionChips } from "@/components/chat/suggestion-chips";
import { QuestionnaireReview } from "@/components/chat/questionnaire-review";
import { ConversationList } from "@/components/chat/conversation-list";
import { useQuestionnaire } from "@/hooks/useQuestionnaire";
import { useVersion } from "@/lib/context/version-context";
import { Progress } from "@/components/ui/progress";

const SUGGESTION_CHIPS = [
  { text: "Qual nosso score ISO 27001?", icon: ShieldCheck },
  { text: "Analise gaps TX-RAMP", icon: FileSearch },
  { text: "Resumo executivo", icon: BarChart3 },
] as const;

const ACCEPTED_FILE_TYPES = ".xlsx,.csv,.pdf";

export default function ChatPage() {
  const { activeVersion } = useVersion();
  const { messages, sendMessage, status } = useChat();

  const [input, setInput] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const questionnaire = useQuestionnaire();

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    sendMessage({ text: trimmed }, { body: { productVersionId: activeVersion?.id ?? null } });
    setInput("");
  }

  function handleSuggestionClick(text: string) {
    sendMessage({ text }, { body: { productVersionId: activeVersion?.id ?? null } });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  // ── File upload handlers ───────────────────────────────────────────────

  function handleFileButtonClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    questionnaire.uploadFile(file);
    // Reset the input so the same file can be re-selected
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

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Conversation sidebar */}
      <ConversationList
        activeConversationId={activeConversationId}
        onSelectConversation={setActiveConversationId}
        onNewConversation={(id) => setActiveConversationId(id)}
      />

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
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
          <div className="space-y-6 py-6">
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
                  <span className="text-sm text-text-muted">Analisando…</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

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

      {/* ─── Error Banner ─── */}
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
      <div className="shrink-0 border-t border-border-glass pb-4 pt-4">
        {/* File badge */}
        {isQuestionnaireActive && questionnaire.fileName && questionnaire.state !== "error" && questionnaire.state !== "complete" && (
          <div className="mb-2 flex items-center gap-2 px-3">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted transition-all duration-200 hover:bg-white/5 hover:text-primary active:scale-95 disabled:opacity-40"
            title="Upload questionnaire (.xlsx, .csv, .pdf)"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about compliance, frameworks, gaps..."
            aria-label="Chat message"
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
            style={{ maxHeight: "120px" }}
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
