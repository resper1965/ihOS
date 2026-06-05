"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
import {
  Send,
  Sparkles,
  User,
  Bot,
  Loader2,
  Wrench,
  ShieldCheck,
  FileSearch,
  BarChart3,
} from "lucide-react";

const SUGGESTION_CHIPS = [
  { text: "Qual nosso score ISO 27001?", icon: ShieldCheck },
  { text: "Analise gaps TX-RAMP", icon: FileSearch },
  { text: "Resumo executivo", icon: BarChart3 },
] as const;

export default function ChatPage() {
  const { messages, sendMessage, status, setMessages } = useChat();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    sendMessage({ text: trimmed });
    setInput("");
  }

  function handleSuggestionClick(text: string) {
    sendMessage({ text });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
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
              Assistente de compliance inteligente. Pergunte sobre frameworks,
              gaps, documentos ou peça análises detalhadas.
            </p>

            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-3">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip.text}
                  onClick={() => handleSuggestionClick(chip.text)}
                  className="glass-card flex items-center gap-2 px-4 py-2.5 text-sm text-text-secondary transition-all duration-200 hover:scale-[1.03] hover:border-primary/30 hover:text-text-primary"
                >
                  <chip.icon className="h-4 w-4 text-primary" />
                  {chip.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ─── Message List ─── */
          <div className="space-y-6 py-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {/* Assistant avatar */}
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-primary text-white"
                      : "glass-card text-text-primary"
                  }`}
                >
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <span key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </span>
                      );
                    }
                    // Tool invocations (dynamic-tool or tool-*)
                    if (
                      part.type === "dynamic-tool" ||
                      part.type.startsWith("tool-")
                    ) {
                      const toolPart = part as { toolName?: string; toolCallId: string; state: string };
                      return (
                        <div
                          key={i}
                          className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted"
                        >
                          <Wrench
                            className={`h-3 w-3 text-primary ${
                              toolPart.state !== "output-available"
                                ? "animate-spin"
                                : ""
                            }`}
                          />
                          <span>
                            {toolPart.state === "output-available"
                              ? "Used"
                              : "Calling"}{" "}
                            <code className="rounded bg-white/10 px-1 font-mono">
                              {toolPart.toolName ?? part.type.replace("tool-", "")}
                            </code>
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>

                {/* User avatar */}
                {message.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-bg-card">
                    <User className="h-4 w-4 text-text-secondary" />
                  </div>
                )}
              </div>
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

      {/* ─── Input Area ─── */}
      <div className="shrink-0 border-t border-border-glass pb-4 pt-4">
        <form
          onSubmit={handleSubmit}
          className="glass-card flex items-end gap-3 p-3"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre compliance, frameworks, gaps…"
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
          ihOS AI pode cometer erros. Verifique informações importantes.
        </p>
      </div>
    </div>
  );
}
