import OpenAI from "openai";

let client = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in .env");
  }
  client = new OpenAI({ apiKey });
  return client;
}

export async function generateExecutionPlan(context) {
  const response = await getClient().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "You are an execution assistant. Return only valid JSON with keys: explanation (string), microSteps (string[3]), recommendedStrategy (one of: shorten+send, microstep+timer, choose-top-3), actionPayload (object|null).",
      },
      {
        role: "user",
        content: context,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "execution_plan",
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "explanation",
            "microSteps",
            "recommendedStrategy",
            "actionPayload",
          ],
          properties: {
            explanation: { type: "string" },
            microSteps: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: { type: "string" },
            },
            recommendedStrategy: {
              type: "string",
              enum: ["shorten+send", "microstep+timer", "choose-top-3"],
            },
            actionPayload: {
              anyOf: [{ type: "object" }, { type: "null" }],
            },
          },
        },
        strict: true,
      },
    },
  });

  const output = response.output_text;
  return JSON.parse(output);
}
