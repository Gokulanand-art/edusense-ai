import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

function isValidObjectId(id?: string | null): boolean {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !isValidObjectId(user.id)) {
      return NextResponse.json({ conversations: [] });
    }

    const conversations = await prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    return NextResponse.json({ conversations });
  } catch (error: any) {
    console.warn("Fetch conversations warning:", error.message);
    return NextResponse.json({ conversations: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isValidObjectId(user.id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title } = await req.json().catch(() => ({}));

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: title || "New Conversation",
      },
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create conversation" },
      { status: 500 }
    );
  }
}
