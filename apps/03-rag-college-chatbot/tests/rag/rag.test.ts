import { describe, it, expect } from "vitest";
import { generateLocalEmbedding, cosineSimilarity } from "../../lib/embeddings/local";
import { buildRAGSystemPrompt, UNKNOWN_ANSWER_FALLBACK } from "../../lib/rag/prompt";
import { generateLocalLLMResponse } from "../../lib/llm/local";

describe("RAG Retrieval & Anti-Hallucination Suite", () => {
  it("should generate normalized unit vectors and compute semantic similarity", () => {
    const vec1 = generateLocalEmbedding("minimum attendance requirement for semester exams");
    const vec2 = generateLocalEmbedding("attendance percentage policy for final examination");
    const vec3 = generateLocalEmbedding("swimming pool opening hours on Sunday");

    expect(vec1.length).toBe(768);
    expect(vec2.length).toBe(768);

    const relatedScore = cosineSimilarity(vec1, vec2);
    const unrelatedScore = cosineSimilarity(vec1, vec3);

    expect(relatedScore).toBeGreaterThan(unrelatedScore);
  });

  it("should enforce fallback refusal prompt when no relevant chunks are found", () => {
    const prompt = buildRAGSystemPrompt([]);
    expect(prompt).toContain(UNKNOWN_ANSWER_FALLBACK);
  });

  it("should synthesize grounded answer from context chunks", () => {
    const systemPrompt = buildRAGSystemPrompt([
      {
        id: "chunk-1",
        documentTitle: "Academic Regulations",
        category: "Academics",
        pageNumber: 12,
        sectionTitle: "Attendance Policy",
        content: "All registered students must maintain a minimum attendance of 75% in each course.",
        score: 0.88,
      },
    ]);

    const response = generateLocalLLMResponse([
      { role: "system", content: systemPrompt },
      { role: "user", content: "What is the minimum attendance required?" },
    ]);

    expect(response).toContain("75%");
    expect(response).not.toBe(UNKNOWN_ANSWER_FALLBACK);
  });

  it("should return fallback message when question cannot be answered from context", () => {
    const systemPrompt = buildRAGSystemPrompt([
      {
        id: "chunk-1",
        documentTitle: "Hostel Rules",
        category: "Hostel",
        content: "Quiet hours are observed from 11:00 PM to 6:00 AM.",
        score: 0.75,
      },
    ]);

    const response = generateLocalLLMResponse([
      { role: "system", content: systemPrompt },
      { role: "user", content: "What is the tuition fee for computer science?" },
    ]);

    expect(response).toBe(UNKNOWN_ANSWER_FALLBACK);
  });
});
