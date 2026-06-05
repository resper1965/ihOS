import ChatPage from "../page";

// For now, the conversation page re-uses the same ChatPage component.
// Once the backend supports loading existing conversations via conversationId,
// this can be enhanced to pre-populate messages.
export default function ConversationPage() {
  return <ChatPage />;
}
