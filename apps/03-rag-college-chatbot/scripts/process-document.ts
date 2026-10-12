import fs from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { extractAndProcessDocument } from "../lib/documents/extractor";
import { generateEmbedding } from "../lib/embeddings/provider";

const prisma = new PrismaClient();

async function processFileCli() {
  const filePath = process.argv[2];
  const category = process.argv[3] || "General";

  if (!filePath) {
    console.error("Usage: npx tsx scripts/process-document.ts <path-to-file> [category]");
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), filePath);
  const fileName = path.basename(absolutePath);
  const ext = fileName.split(".").pop()?.toUpperCase() || "TXT";

  console.log(`📄 Reading file: ${absolutePath}`);
  const buffer = await fs.readFile(absolutePath);
  const docTitle = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  console.log(`⏳ Parsing & chunking document "${docTitle}"...`);
  const extraction = await extractAndProcessDocument(buffer, fileName);

  console.log(`Found ${extraction.chunks.length} chunks (Pages: ${extraction.pageCount}). Storing in database...`);

  const doc = await prisma.document.create({
    data: {
      title: docTitle,
      fileName,
      fileType: ext,
      fileSize: buffer.length,
      filePath: path.relative(process.cwd(), absolutePath).replace(/\\/g, "/"),
      category,
      status: "PROCESSING",
    },
  });

  for (const chunk of extraction.chunks) {
    const embedding = await generateEmbedding(chunk.content);
    const vectorJson = JSON.stringify(embedding);

    const chunkRecord = await prisma.documentChunk.create({
      data: {
        documentId: doc.id,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        sectionTitle: chunk.sectionTitle,
        tokenCount: chunk.tokenCount,
        vectorJson,
      },
    });


  }

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      status: "READY",
      metadata: JSON.stringify({
        pageCount: extraction.pageCount,
        chunkCount: extraction.chunks.length,
        processedViaCli: true,
      }),
    },
  });

  console.log(`🎉 Successfully indexed "${docTitle}" (${extraction.chunks.length} chunks) in category "${category}"!`);
}

processFileCli()
  .catch((e) => {
    console.error("❌ Process document error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
