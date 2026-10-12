import { generateEmbedding } from "@/lib/embeddings/provider";
import { searchSimilarChunks } from "./vector-store";
import { buildRAGSystemPrompt, RetrievedChunkContext, UNKNOWN_ANSWER_FALLBACK } from "./prompt";
import { generateLLMResponse } from "@/lib/llm/provider";
import { LLMMessage, generateLocalLLMResponse } from "@/lib/llm/local";

export interface RAGQueryResult {
  answer: string;
  sources: {
    chunkId: string;
    documentTitle: string;
    category: string;
    pageNumber?: number | null;
    sectionTitle?: string | null;
    snippet: string;
    relevanceScore: number;
  }[];
  usedFallback: boolean;
}

export interface QueryOptions {
  topK?: number;
  minScore?: number;
  category?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  onChunk?: (text: string) => void;
}

/**
 * Full RAG execution pipeline matching spec.md.
 * 1. Embed query
 * 2. Search pgvector / MongoDB / local vector store
 * 3. Filter top K by relevance score
 * 4. Augment context
 * 5. Generate grounded response with LLM
 * 6. Attach verified source citations
 */
export async function executeRAGQuery(
  question: string,
  options?: QueryOptions
): Promise<RAGQueryResult> {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    return {
      answer: "Please ask a question regarding college academics, hostels, fees, or policies.",
      sources: [],
      usedFallback: false,
    };
  }

  try {
    // 1. Generate query embedding
    const queryEmbedding = await generateEmbedding(trimmedQuestion);

    // 2. Vector search pgvector / local store
    const relevantChunks: RetrievedChunkContext[] = await searchSimilarChunks({
      queryEmbedding,
      queryText: trimmedQuestion,
      topK: options?.topK,
      minScore: options?.minScore,
      category: options?.category,
    });

    // 3. Build system prompt with grounding context
    const systemPrompt = buildRAGSystemPrompt(relevantChunks);

    // Build message sequence with conversation history
    const messages: LLMMessage[] = [{ role: "system", content: systemPrompt }];

    if (options?.history && options.history.length > 0) {
      // Keep last 4 conversational turns for context without blowing token budget
      const recentHistory = options.history.slice(-4);
      recentHistory.forEach((h) => {
        messages.push({ role: h.role, content: h.content });
      });
    }

    messages.push({ role: "user", content: trimmedQuestion });

    // 4. Generate LLM answer with streaming support
    let answer = await generateLLMResponse(messages, options?.onChunk);

    if (!answer || !answer.trim()) {
      answer = generateLocalLLMResponse(messages);
    }

    // 5. Format source citations
    const sources = relevantChunks.map((c) => ({
      chunkId: c.id,
      documentTitle: c.documentTitle,
      category: c.category,
      pageNumber: c.pageNumber,
      sectionTitle: c.sectionTitle,
      snippet: c.content.length > 300 ? c.content.substring(0, 300) + "..." : c.content,
      relevanceScore: Math.round(c.score * 100) / 100,
    }));

    return {
      answer,
      sources,
      usedFallback: relevantChunks.length === 0,
    };
  } catch (err: any) {
    console.error("Error in executeRAGQuery, executing safe offline recovery:", err);

    // Safe offline fallback
    const fallbackMessages: LLMMessage[] = [
      { role: "system", content: "You are an official College Information AI Assistant." },
      { role: "user", content: trimmedQuestion },
    ];
    const fallbackAnswer = generateLocalLLMResponse(fallbackMessages);

    return {
      answer: fallbackAnswer,
      sources: [],
      usedFallback: true,
    };
  }
}
