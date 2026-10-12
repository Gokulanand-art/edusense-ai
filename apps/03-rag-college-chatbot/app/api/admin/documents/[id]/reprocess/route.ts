import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { readUploadedFile } from "@/lib/storage/storage";
import { extractAndProcessDocument } from "@/lib/documents/extractor";
import { generateEmbedding } from "@/lib/embeddings/provider";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const document = await prisma.document.findUnique({
      where: { id: params.id },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (!document.filePath) {
      return NextResponse.json(
        { error: "Document has no associated file path to reprocess" },
        { status: 400 }
      );
    }

    // Set document status to PROCESSING
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "PROCESSING", errorMessage: null },
    });

    // Remove existing chunks
    await prisma.documentChunk.deleteMany({
      where: { documentId: document.id },
    });

    try {
      const buffer = await readUploadedFile(document.filePath);
      const extraction = await extractAndProcessDocument(buffer, document.fileName);

      for (const chunk of extraction.chunks) {
        const embedding = await generateEmbedding(chunk.content);
        const vectorJson = JSON.stringify(embedding);

        const createdChunk = await prisma.documentChunk.create({
          data: {
            documentId: document.id,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber,
            sectionTitle: chunk.sectionTitle,
            tokenCount: chunk.tokenCount,
            vectorJson,
          },
        });


      }

      const updatedDoc = await prisma.document.update({
        where: { id: document.id },
        data: {
          status: "READY",
          metadata: JSON.stringify({
            pageCount: extraction.pageCount,
            chunkCount: extraction.chunks.length,
            reprocessedAt: new Date().toISOString(),
          }),
        },
      });

      return NextResponse.json({
        message: "Document reprocessed successfully",
        document: updatedDoc,
        chunksProcessed: extraction.chunks.length,
      });
    } catch (processErr: any) {
      await prisma.document.update({
        where: { id: document.id },
        data: {
          status: "FAILED",
          errorMessage: processErr.message || "Reprocessing failed",
        },
      });

      return NextResponse.json(
        { error: `Reprocessing failed: ${processErr.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    const isAuth = error.message?.includes("Unauthorized") || error.message?.includes("Forbidden");
    return NextResponse.json(
      { error: error.message || "Failed to reprocess document" },
      { status: isAuth ? 403 : 500 }
    );
  }
}
