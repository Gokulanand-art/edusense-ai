import { LLMMessage, generateLocalLLMResponse } from "./local";
import { streamGeminiChat } from "./gemini";
import { streamOpenAIChat } from "./openai";

export type LLMProviderType = "local" | "gemini" | "openai";

/**
 * Unified LLM completion and streaming service.
 * Fail closed: an explicitly configured provider must succeed — errors propagate
 * to the caller. The local offline engine is used only when the configured
 * provider is 'local'. (NOTE: this function returns a plain string; there is no
 * response object to carry a providerUsed field without rippling every caller,
 * so none was added.)
 */
export async function generateLLMResponse(
  messages: LLMMessage[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const provider = (process.env.LLM_PROVIDER || "local").toLowerCase() as LLMProviderType;
  const apiKey = process.env.LLM_API_KEY;

  if (provider === "gemini") {
    return await streamGeminiChat(
      messages,
      apiKey,
      process.env.LLM_MODEL || "gemini-1.5-flash",
      onChunk
    );
  }

  if (provider === "openai") {
    return await streamOpenAIChat(
      messages,
      apiKey,
      process.env.LLM_MODEL || "gpt-4o-mini",
      onChunk
    );
  }

  if (provider === "local") {
    const localResp = generateLocalLLMResponse(messages);
    if (onChunk) onChunk(localResp);
    return localResp;
  }

  throw new Error(
    `Unknown LLM_PROVIDER "${provider}". Expected "local", "gemini", or "openai".`
  );
}
