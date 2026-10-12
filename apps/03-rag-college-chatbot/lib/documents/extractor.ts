import pdf from "pdf-parse";
import mammoth from "mammoth";
import { chunkText, ChunkMetadata, ChunkerOptions } from "./chunker";

export interface ExtractedDocument {
  title: string;
  rawText: string;
  pageCount: number;
  chunks: ChunkMetadata[];
}

/**
 * Extracts text and generates chunks from supported file formats (PDF, DOCX, TXT, MD).
 */
export async function extractAndProcessDocument(
  buffer: Buffer,
  fileName: string,
  options?: ChunkerOptions
): Promise<ExtractedDocument> {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  let rawText = "";
  let pageCount = 1;
  let allChunks: ChunkMetadata[] = [];

  switch (ext) {
    case "pdf": {
      try {
        const pdfData = await pdf(buffer);
        rawText = pdfData.text;
        pageCount = pdfData.numpages || 1;

        // Try page-wise chunking if text has form feed character \f
        const pages = rawText.split("\f");
        if (pages.length > 1) {
          let globalChunkIndex = 0;
          pages.forEach((pageText, idx) => {
            const pageNum = idx + 1;
            const pageChunks = chunkText(pageText, options, pageNum);
            pageChunks.forEach((c) => {
              c.chunkIndex = globalChunkIndex++;
              allChunks.push(c);
            });
          });
        } else {
          allChunks = chunkText(rawText, options);
        }
      } catch (err: any) {
        throw new Error(`Failed to parse PDF document (${fileName}): ${err.message}`);
      }
      break;
    }

    case "docx": {
      try {
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
        allChunks = chunkText(rawText, options);
      } catch (err: any) {
        throw new Error(`Failed to parse DOCX document (${fileName}): ${err.message}`);
      }
      break;
    }

    case "txt":
    case "md":
    case "markdown": {
      try {
        rawText = buffer.toString("utf-8");
        allChunks = chunkText(rawText, options);
      } catch (err: any) {
        throw new Error(`Failed to parse text document (${fileName}): ${err.message}`);
      }
      break;
    }

    default:
      throw new Error(
        `Unsupported document format '.${ext}'. Supported formats: PDF, DOCX, TXT, Markdown.`
      );
  }

  const title = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  return {
    title,
    rawText,
    pageCount,
    chunks: allChunks,
  };
}
