import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

function isValidObjectId(id?: string | null): boolean {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isValidObjectId(user.id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isValidObjectId(params.id)) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sources: {
              include: {
                documentChunk: {
                  include: {
                    document: {
                      select: { title: true, category: true },
                    },
                  },
                },
              },
            },
            feedback: true,
          },
        },
      },
    });

    if (!conversation || conversation.userId !== user.id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ conversation });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isValidObjectId(user.id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isValidObjectId(params.id)) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
    });

    if (!conversation || conversation.userId !== user.id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    await prisma.conversation.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: "Conversation deleted successfully" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete conversation" },
      { status: 500 }
    );
  }
}
