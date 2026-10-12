import { generateLocalEmbedding } from "./local";
import { getGeminiEmbedding } from "./gemini";
import { getOpenAIEmbedding } from "./openai";

export type EmbeddingProviderType = "local" | "gemini" | "openai";

/**
 * Unified embedding generator supporting Local, Gemini, and OpenAI providers.
 * Automatically falls back to local embedding if external API credentials are not set.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = (process.env.EMBEDDING_PROVIDER || "local").toLowerCase() as EmbeddingProviderType;
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY;

  if (provider === "gemini" && apiKey && !apiKey.startsWith("local-")) {
    try {
      return await getGeminiEmbedding(text, apiKey, process.env.EMBEDDING_MODEL || "text-embedding-004");
    } catch (err) {
      console.warn("Gemini embedding failed, falling back to local deterministic embedding:", err);
      return generateLocalEmbedding(text);
    }
  }

  if (provider === "openai" && apiKey && !apiKey.startsWith("local-")) {
    try {
      return await getOpenAIEmbedding(text, apiKey, process.env.EMBEDDING_MODEL || "text-embedding-3-small");
    } catch (err) {
      console.warn("OpenAI embedding failed, falling back to local deterministic embedding:", err);
      return generateLocalEmbedding(text);
    }
  }

  return generateLocalEmbedding(text);
}
