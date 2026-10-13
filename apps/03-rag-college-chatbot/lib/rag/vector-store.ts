import { prisma } from "@/lib/db/prisma";
import { cosineSimilarity, computeLocalRelevanceScore } from "@/lib/embeddings/local";
import { RetrievedChunkContext } from "./prompt";
import { BUILTIN_KNOWLEDGE_CHUNKS } from "./knowledge-base";

export interface VectorSearchParams {
  queryEmbedding: number[];
  queryText?: string;
  topK?: number;
  minScore?: number;
  category?: string;
}

/**
 * Canonical document categories (mirrors the upload-form allowlist and seed data).
 * "All Categories" is the UI sentinel meaning "no filter".
 */
const KNOWN_CATEGORIES = [
  "Academics",
  "Hostel",
  "Fees & Scholarships",
  "Placements",
  "General",
];

/**
 * Searches the MongoDB vector store or local knowledge base for the most relevant document chunks.
 * Highly resilient: seamlessly queries DB when available, and falls back to built-in knowledge chunks
 * to guarantee 100% availability even during cold starts, DB maintenance, or fresh deployments.
 *
 * NOTE: The Prisma schema targets MongoDB (see prisma/schema.prisma). There is no
 * live Postgres/pgvector path; retrieval runs in the application layer below.
 */
export async function searchSimilarChunks(
  params: VectorSearchParams
): Promise<RetrievedChunkContext[]> {
  const parsedTopK =
    params.topK !== undefined
      ? params.topK
      : parseInt(process.env.RAG_TOP_K || "5", 10);
  const topK =
    Number.isInteger(parsedTopK) && (parsedTopK as number) > 0
      ? Math.min(parsedTopK as number, 20)
      : 5;
  const minScore =
    params.minScore !== undefined
      ? params.minScore
      : parseFloat(process.env.MIN_RELEVANCE_SCORE || "0.70");

  // Whitelist the category filter against the app's known categories so only
  // recognized values ever reach the database query.
  const categoryFilter =
    params.category &&
    params.category !== "All Categories" &&
    KNOWN_CATEGORIES.includes(params.category)
      ? params.category
      : undefined;

  const scoredChunks: RetrievedChunkContext[] = [];

  // 1. Attempt to fetch chunks from the database
  try {
    if (scoredChunks.length === 0) {
      const dbChunks = await prisma.documentChunk.findMany({
        where: {
          document: {
            status: "READY",
            ...(categoryFilter ? { category: categoryFilter } : {}),
          },
        },
        include: {
          document: {
            select: {
              title: true,
              category: true,
            },
          },
        },
      });

      for (const chunk of dbChunks) {
        let score = 0;

        if (params.queryText) {
          const localRelScore = computeLocalRelevanceScore(
            params.queryText,
            chunk.content,
            chunk.document.title,
            chunk.sectionTitle || ""
          );
          score = Math.max(score, localRelScore);
        }

        if (chunk.vectorJson) {
          let chunkVector: number[] | null = null;
          try {
            chunkVector = JSON.parse(chunk.vectorJson);
          } catch {
            // ignore invalid vector JSON
          }

          if (chunkVector) {
            // Fail closed on embedding-provider dimension drift (e.g. vectors
            // stored with the 768-dim local provider vs a 1536-dim OpenAI
            // model). A length-mismatched cosine score would silently read as
            // ~0 and suppress retrieval, so tell the operator to re-embed
            // instead of returning empty results. Behavior for matching dims
            // is unchanged.
            if (chunkVector.length !== params.queryEmbedding.length) {
              throw new Error(
                `Embedding dimension mismatch: stored vector has dim ${chunkVector.length} but the current provider produced dim ${params.queryEmbedding.length}. Re-embed documents with the current embedding provider to restore retrieval.`
              );
            }
            const cosScore = cosineSimilarity(params.queryEmbedding, chunkVector);
            score = Math.max(score, cosScore);
          }
        }

        if (score >= minScore) {
          scoredChunks.push({
            id: chunk.id,
            documentTitle: chunk.document.title,
            category: chunk.document.category,
            pageNumber: chunk.pageNumber,
            sectionTitle: chunk.sectionTitle,
            content: chunk.content,
            score,
          });
        }
      }
    }
  } catch (dbErr) {
    // Dimension mismatches are operator-actionable: let them propagate instead
    // of being absorbed into the knowledge-base fallback.
    if (dbErr instanceof Error && dbErr.message.includes("Embedding dimension mismatch")) {
      throw dbErr;
    }
    console.warn("Database query skipped or unavailable, using knowledge store:", (dbErr as any)?.message);
  }

  // 2. If no matching chunks found from DB (e.g. fresh deployment or cold start), search built-in knowledge base
  if (scoredChunks.length === 0) {
    const candidateKnowledge = BUILTIN_KNOWLEDGE_CHUNKS.filter((c) => {
      if (!params.category || params.category === "All Categories") return true;
      return c.category.toLowerCase() === params.category.toLowerCase();
    });

    for (const chunk of candidateKnowledge) {
      let score = 0;

      if (params.queryText) {
        const localRelScore = computeLocalRelevanceScore(
          params.queryText,
          chunk.content,
          chunk.documentTitle,
          chunk.sectionTitle || ""
        );
        score = Math.max(score, localRelScore);
      }

      if (chunk.embedding && chunk.embedding.length > 0) {
        const cosScore = cosineSimilarity(params.queryEmbedding, chunk.embedding);
        score = Math.max(score, cosScore);
      }

      if (score >= minScore) {
        scoredChunks.push({
          id: chunk.id,
          documentTitle: chunk.documentTitle,
          category: chunk.category,
          pageNumber: chunk.pageNumber,
          sectionTitle: chunk.sectionTitle,
          content: chunk.content,
          score,
        });
      }
    }
  }

  // Sort descending by score and take topK
  scoredChunks.sort((a, b) => b.score - a.score);
  return scoredChunks.slice(0, topK);
}
