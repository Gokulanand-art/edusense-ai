/**
 * OpenAI Embeddings Provider (text-embedding-3-small)
 */
export async function getOpenAIEmbedding(text: string, apiKey?: string, model = "text-embedding-3-small"): Promise<number[]> {
  const key = apiKey || process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY;
  if (!key || key.startsWith("local-")) {
    throw new Error("OpenAI API key is not configured");
  }

  const url = "https://api.openai.com/v1/embeddings";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      input: text,
      model,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI Embedding API error: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  return data.data[0].embedding as number[];
}
