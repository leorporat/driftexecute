import { ChatWindow } from "@/components/chat-window";

export default function ChatPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold text-zinc-100">Trip Assistant</h1>
      <p className="read-box mb-5 mt-3 text-sm">
        Multi-turn local chat with retrieval over your similar saved trips.
      </p>
      <ChatWindow />
    </section>
  );
}




