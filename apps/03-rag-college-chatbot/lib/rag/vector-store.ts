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
 * Searches the MongoDB / PostgreSQL vector store or local knowledge base for the most relevant document chunks.
 * Highly resilient: seamlessly queries DB when available, and falls back to built-in knowledge chunks
 * to guarantee 100% availability even during cold starts, DB maintenance, or fresh deployments.
 */
export async function searchSimilarChunks(
  params: VectorSearchParams
): Promise<RetrievedChunkContext[]> {
  const topK =
    params.topK ||
    parseInt(process.env.RAG_TOP_K || "5", 10);
  const minScore =
    params.minScore !== undefined
      ? params.minScore
      : parseFloat(process.env.MIN_RELEVANCE_SCORE || "0.70");

  const scoredChunks: RetrievedChunkContext[] = [];

  // 1. Attempt to fetch chunks from the database
  try {
    const isPostgres = process.env.DATABASE_URL?.startsWith("postgres");

    if (isPostgres && typeof (prisma as any).$queryRawUnsafe === "function") {
      try {
        const embeddingStr = `[${params.queryEmbedding.join(",")}]`;
        const rawResults: any[] = await (prisma as any).$queryRawUnsafe(`
          SELECT 
            dc.id,
            dc."documentId",
            dc.content,
            dc."chunkIndex",
            dc."pageNumber",
            dc."sectionTitle",
            d.title as "documentTitle",
            d.category,
            1 - (dc.embedding <=> '${embeddingStr}'::vector) as similarity
          FROM document_chunks dc
          JOIN documents d ON d.id = dc."documentId"
          WHERE d.status = 'READY'
            AND dc.embedding IS NOT NULL
            ${params.category ? `AND d.category = '${params.category}'` : ""}
          ORDER BY similarity DESC
          LIMIT ${topK * 2};
        `);

        if (rawResults && rawResults.length > 0) {
          for (const r of rawResults) {
            const score = Number(r.similarity);
            if (score >= minScore) {
              scoredChunks.push({
                id: r.id,
                documentTitle: r.documentTitle,
                category: r.category,
                pageNumber: r.pageNumber,
                sectionTitle: r.sectionTitle,
                content: r.content,
                score,
              });
            }
          }
        }
      } catch {
        // Fall back to application layer retrieval
      }
    }

    if (scoredChunks.length === 0) {
      const dbChunks = await prisma.documentChunk.findMany({
        where: {
          document: {
            status: "READY",
            ...(params.category && params.category !== "All Categories" ? { category: params.category } : {}),
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
          try {
            const chunkVector: number[] = JSON.parse(chunk.vectorJson);
            const cosScore = cosineSimilarity(params.queryEmbedding, chunkVector);
            score = Math.max(score, cosScore);
          } catch {
            // ignore invalid vector JSON
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
