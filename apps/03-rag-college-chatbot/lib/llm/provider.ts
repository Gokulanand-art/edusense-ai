import { LLMMessage, generateLocalLLMResponse } from "./local";
import { streamGeminiChat } from "./gemini";
import { streamOpenAIChat } from "./openai";

export type LLMProviderType = "local" | "gemini" | "openai";

/**
 * Unified LLM completion and streaming service.
 * Supports configurable providers with automatic fallback to local offline engine.
 */
export async function generateLLMResponse(
  messages: LLMMessage[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const provider = (process.env.LLM_PROVIDER || "local").toLowerCase() as LLMProviderType;
  const apiKey = process.env.LLM_API_KEY;

  if (provider === "gemini" && apiKey && !apiKey.startsWith("local-")) {
    try {
      const res = await streamGeminiChat(
        messages,
        apiKey,
        process.env.LLM_MODEL || "gemini-1.5-flash",
        onChunk
      );
      if (res && res.trim().length > 0) {
        return res;
      }
    } catch (err) {
      console.warn("Gemini LLM call failed or timed out, falling back to local reasoning engine:", (err as any)?.message || err);
    }
  }

  if (provider === "openai" && apiKey && !apiKey.startsWith("local-")) {
    try {
      const res = await streamOpenAIChat(
        messages,
        apiKey,
        process.env.LLM_MODEL || "gpt-4o-mini",
        onChunk
      );
      if (res && res.trim().length > 0) {
        return res;
      }
    } catch (err) {
      console.warn("OpenAI LLM call failed or timed out, falling back to local reasoning engine:", (err as any)?.message || err);
    }
  }

  // Fallback to local offline reasoning engine
  const localResp = generateLocalLLMResponse(messages);
  if (onChunk) onChunk(localResp);
  return localResp;
}
