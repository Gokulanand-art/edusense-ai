import { LLMMessage } from "./local";

/**
 * OpenAI LLM API client supporting streaming and completion.
 */
export async function streamOpenAIChat(
  messages: LLMMessage[],
  apiKey?: string,
  model = "gpt-4o-mini",
  onChunk?: (text: string) => void
): Promise<string> {
  const key = apiKey || process.env.LLM_API_KEY;
  if (!key || key.startsWith("local-")) {
    throw new Error("OpenAI API key not configured");
  }

  const url = "https://api.openai.com/v1/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1, // low temperature for strict grounding
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI LLM API error: ${response.status} ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (onChunk) onChunk(text);
  return text;
}
