/**
 * Google Gemini Embeddings Provider (text-embedding-004)
 */
export async function getGeminiEmbedding(text: string, apiKey?: string, model = "text-embedding-004"): Promise<number[]> {
  const key = apiKey || process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY;
  if (!key || key.startsWith("local-")) {
    throw new Error("Gemini API key is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: `models/${model}`,
      content: {
        parts: [{ text }],
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini Embedding API error: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  return data.embedding.values as number[];
}
