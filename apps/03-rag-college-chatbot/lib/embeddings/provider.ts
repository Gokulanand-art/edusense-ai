import { generateLocalEmbedding } from "./local";
import { getGeminiEmbedding } from "./gemini";
import { getOpenAIEmbedding } from "./openai";

export type EmbeddingProviderType = "local" | "gemini" | "openai";

/**
 * Unified embedding generator supporting Local, Gemini, and OpenAI providers.
 * Fail closed: an explicitly configured provider must succeed — errors propagate
 * to the caller. Local embeddings are used only when the configured provider is
 * 'local'. (NOTE: generateEmbedding returns a raw number[] and
 * generateLLMResponse returns a string; there is no response object to carry a
 * providerUsed field without rippling every caller, so none was added.)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = (process.env.EMBEDDING_PROVIDER || "local").toLowerCase() as EmbeddingProviderType;
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY;

  if (provider === "gemini") {
    return await getGeminiEmbedding(text, apiKey, process.env.EMBEDDING_MODEL || "text-embedding-004");
  }

  if (provider === "openai") {
    return await getOpenAIEmbedding(text, apiKey, process.env.EMBEDDING_MODEL || "text-embedding-3-small");
  }

  if (provider === "local") {
    return generateLocalEmbedding(text);
  }

  throw new Error(
    `Unknown EMBEDDING_PROVIDER "${provider}". Expected "local", "gemini", or "openai".`
  );
}
