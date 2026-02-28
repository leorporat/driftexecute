import "dotenv/config";
import OpenAI from "openai";
import { withSupermemory } from "@supermemory/tools/openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("Missing OPENAI_API_KEY in .env");
}

const openai = new OpenAI({ apiKey });
const client = withSupermemory(openai, "user-123", {
  mode: "full",
  addMemory: "always",
  conversationId: "conv-456",
});

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "user", content: "What's my favorite language?" },
  ],
});
