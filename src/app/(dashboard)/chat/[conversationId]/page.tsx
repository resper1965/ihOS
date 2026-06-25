"use client";

import { use } from "react";
import ChatPage from "../page";

/**
 * Loads an existing conversation by extracting the conversationId from the URL.
 * Passes it to ChatPage which handles loading messages and initializing useChat.
 */
export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);

  return <ChatPage conversationId={conversationId} />;
}
