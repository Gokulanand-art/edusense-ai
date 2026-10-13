import { cleanDocumentText } from "./cleaner";

export interface ChunkMetadata {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber?: number;
  sectionTitle?: string;
}

export interface ChunkerOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Documented defaults (see .env.example: CHUNK_SIZE=700, CHUNK_OVERLAP=100).
 */
const DEFAULT_CHUNK_SIZE = 700;
const DEFAULT_CHUNK_OVERLAP = 100;

function parseEnvInt(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Estimates token count for text (~4 characters per token average in English).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.trim().length / 4);
}

/**
 * Splits text into overlapping chunks using sliding window algorithm.
 * Respects paragraph boundaries and sentence breaks where possible.
 */
export function chunkText(
  rawText: string,
  options?: ChunkerOptions,
  pageNumber?: number,
  defaultSection?: string
): ChunkMetadata[] {
  const cleanedText = cleanDocumentText(rawText);
  if (!cleanedText) return [];

  const chunkSizeTokens =
    options?.chunkSize ||
    parseEnvInt(process.env.CHUNK_SIZE, DEFAULT_CHUNK_SIZE);
  const chunkOverlapTokens =
    options?.chunkOverlap ??
    parseEnvInt(process.env.CHUNK_OVERLAP, DEFAULT_CHUNK_OVERLAP);

  // Validate sliding-window geometry: 0 <= overlap < size. Without this, an
  // overlap >= size collapses the window step to Math.max(1, ...) below and
  // degrades into ~1-char stepping over large paragraphs.
  if (!Number.isFinite(chunkSizeTokens) || chunkSizeTokens <= 0) {
    throw new Error(
      `Invalid chunkSize (${chunkSizeTokens}): must be a positive integer.`
    );
  }
  const safeOverlapTokens =
    Number.isFinite(chunkOverlapTokens) && chunkOverlapTokens >= 0
      ? chunkOverlapTokens
      : DEFAULT_CHUNK_OVERLAP;
  if (safeOverlapTokens >= chunkSizeTokens) {
    throw new Error(
      `Invalid chunkOverlap (${safeOverlapTokens}): must satisfy 0 <= overlap < size (${chunkSizeTokens}).`
    );
  }

  // Convert token sizes to approximate character limits
  const chunkSizeChars = chunkSizeTokens * 4;
  const chunkOverlapChars = safeOverlapTokens * 4;
  const stepSizeChars = Math.max(100, chunkSizeChars - chunkOverlapChars);

  const paragraphs = cleanedText.split(/\n\n+/);
  const chunks: ChunkMetadata[] = [];
  let currentChunk = "";
  let currentSection = defaultSection || "";
  let chunkIdx = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // Detect section headers (e.g. # Heading, Section 1:, 1. Introduction)
    const headerMatch = trimmedPara.match(/^(?:#+\s*|(?:\d+\.|\bSection\s+\d+[:\.]?)\s*)([^\n]+)/i);
    if (headerMatch && headerMatch[1]) {
      currentSection = headerMatch[1].trim();
    }

    if ((currentChunk + "\n\n" + trimmedPara).length <= chunkSizeChars) {
      currentChunk = currentChunk ? currentChunk + "\n\n" + trimmedPara : trimmedPara;
    } else {
      // If current accumulated chunk has content, push it
      if (currentChunk) {
        chunks.push({
          chunkIndex: chunkIdx++,
          content: currentChunk.trim(),
          tokenCount: estimateTokens(currentChunk),
          pageNumber,
          sectionTitle: currentSection || undefined,
        });

        // Compute overlap carry-over from end of currentChunk
        const overlapStart = Math.max(0, currentChunk.length - chunkOverlapChars);
        const overlapText = currentChunk.substring(overlapStart).trim();
        currentChunk = overlapText ? overlapText + "\n\n" + trimmedPara : trimmedPara;
      } else {
        // Individual paragraph exceeds chunkSizeChars: split by sentences or hard window
        let start = 0;
        while (start < trimmedPara.length) {
          const end = Math.min(start + chunkSizeChars, trimmedPara.length);
          let slice = trimmedPara.substring(start, end);

          // Try to snap to sentence boundary (.!?) if not at end
          if (end < trimmedPara.length) {
            const lastPeriod = Math.max(
              slice.lastIndexOf(". "),
              slice.lastIndexOf("? "),
              slice.lastIndexOf("! ")
            );
            if (lastPeriod > chunkSizeChars / 2) {
              slice = slice.substring(0, lastPeriod + 1);
            }
          }

          chunks.push({
            chunkIndex: chunkIdx++,
            content: slice.trim(),
            tokenCount: estimateTokens(slice),
            pageNumber,
            sectionTitle: currentSection || undefined,
          });

          start += Math.max(1, slice.length - chunkOverlapChars);
        }
        currentChunk = "";
      }
    }
  }

  // Push remaining buffer
  if (currentChunk.trim()) {
    chunks.push({
      chunkIndex: chunkIdx++,
      content: currentChunk.trim(),
      tokenCount: estimateTokens(currentChunk),
      pageNumber,
      sectionTitle: currentSection || undefined,
    });
  }

  return chunks;
}
