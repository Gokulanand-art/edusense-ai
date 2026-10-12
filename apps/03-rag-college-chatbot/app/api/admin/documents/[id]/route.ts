import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { deleteUploadedFile } from "@/lib/storage/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const document = await prisma.document.findUnique({
      where: { id: params.id },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
          select: {
            id: true,
            chunkIndex: true,
            pageNumber: true,
            sectionTitle: true,
            tokenCount: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ document });
  } catch (error: any) {
    const isAuth = error.message?.includes("Unauthorized") || error.message?.includes("Forbidden");
    return NextResponse.json(
      { error: error.message || "Failed to fetch document" },
      { status: isAuth ? 403 : 500 }
    );
  }
}

export async function DELETE(
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

    // Delete physical file
    if (document.filePath) {
      await deleteUploadedFile(document.filePath);
    }

    // Cascading delete in database removes chunks and message sources
    await prisma.document.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: "Document and all associated chunks deleted successfully" });
  } catch (error: any) {
    const isAuth = error.message?.includes("Unauthorized") || error.message?.includes("Forbidden");
    return NextResponse.json(
      { error: error.message || "Failed to delete document" },
      { status: isAuth ? 403 : 500 }
    );
  }
}
