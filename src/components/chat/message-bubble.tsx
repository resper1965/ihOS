import { Bot, User, Wrench } from "lucide-react";

interface MessageBubbleProps {
  message: any;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
          <Bot className="h-4 w-4 text-white" />
        </div>
      )}

      {/* Bubble Content */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-white"
            : "glass-card text-text-primary"
        }`}
      >
        {message.parts?.map((part: any, i: number) => {
          if (part.type === "text") {
            return (
              <span key={i} className="whitespace-pre-wrap">
                {part.text}
              </span>
            );
          }

          // Tool invocations (dynamic-tool or tool-*)
          if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
            const toolPart = part as { toolName?: string; toolCallId: string; state: string };
            return (
              <div
                key={i}
                className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted"
              >
                <Wrench
                  className={`h-3 w-3 text-primary ${
                    toolPart.state !== "output-available" ? "animate-spin" : ""
                  }`}
                />
                <span>
                  {toolPart.state === "output-available" ? "Usado" : "Chamando"}{" "}
                  <code className="rounded bg-white/10 px-1 font-mono">
                    {toolPart.toolName ?? part.type.replace("tool-", "")}
                  </code>
                </span>
              </div>
            );
          }
          return null;
        }) ?? <span className="whitespace-pre-wrap">{message.content}</span>}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-bg-card">
          <User className="h-4 w-4 text-text-secondary" />
        </div>
      )}
    </div>
  );
}
