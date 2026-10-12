import { LLMMessage } from "./local";

/**
 * Google Gemini LLM API client supporting streaming and completion.
 */
export async function streamGeminiChat(
  messages: LLMMessage[],
  apiKey?: string,
  model = "gemini-1.5-flash",
  onChunk?: (text: string) => void
): Promise<string> {
  const key = apiKey || process.env.LLM_API_KEY;
  if (!key || key.startsWith("local-")) {
    throw new Error("Gemini API key not configured");
  }

  const systemMessage = messages.find((m) => m.role === "system")?.content;
  const conversationMessages = messages.filter((m) => m.role !== "system");

  const contents = conversationMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const requestBody: any = {
    contents,
    generationConfig: {
      temperature: 0.1, // low temperature for strict grounding
      maxOutputTokens: 1024,
    },
  };

  if (systemMessage) {
    requestBody.systemInstruction = {
      parts: [{ text: systemMessage }],
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini LLM API error: ${response.status} ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (onChunk) onChunk(text);
  return text;
}
