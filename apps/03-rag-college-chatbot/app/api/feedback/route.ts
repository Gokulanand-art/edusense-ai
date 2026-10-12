import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId, rating, comment } = await req.json();

    if (!messageId || !["UP", "DOWN"].includes(rating)) {
      return NextResponse.json(
        { error: "messageId and valid rating ('UP' | 'DOWN') are required" },
        { status: 400 }
      );
    }

    // Verify message exists
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Upsert feedback
    const feedback = await prisma.feedback.upsert({
      where: { messageId },
      update: {
        rating,
        comment: comment || null,
      },
      create: {
        messageId,
        userId: user.id,
        rating,
        comment: comment || null,
      },
    });

    return NextResponse.json({ message: "Feedback saved", feedback });
  } catch (error: any) {
    console.error("Feedback error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to submit feedback" },
      { status: 500 }
    );
  }
}
