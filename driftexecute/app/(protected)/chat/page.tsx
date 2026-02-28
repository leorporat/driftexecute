import { ChatWindow } from "@/components/chat-window";

export default function ChatPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">Trip Assistant</h1>
      <p className="mb-5 mt-2 text-sm text-slate-600">
        Multi-turn local chat with retrieval over your similar saved trips.
      </p>
      <ChatWindow />
    </section>
  );
}

