import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { executeRAGQuery } from "@/lib/rag/engine";
import { prisma } from "@/lib/db/prisma";

function isValidObjectId(id?: string | null): boolean {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

export async function POST(req: NextRequest) {
  try {
    let user: any = null;
    try {
      user = await getCurrentUser();
    } catch {
      user = null;
    }

    const { question, conversationId, category } = await req.json().catch(() => ({}));

    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Question cannot be empty" }, { status: 400 });
    }

    let activeConversationId: string | null = isValidObjectId(conversationId) ? conversationId : null;

    // If user is authenticated, attempt to find or create conversation in active DB
    if (user && isValidObjectId(user.id)) {
      if (activeConversationId) {
        try {
          const conv = await prisma.conversation.findUnique({
            where: { id: activeConversationId },
          });
          if (!conv || conv.userId !== user.id) {
            activeConversationId = null;
          }
        } catch {
          activeConversationId = null;
        }
      }

      if (!activeConversationId) {
        try {
          const newConv = await prisma.conversation.create({
            data: {
              userId: user.id,
              title: question.trim().substring(0, 40) + (question.length > 40 ? "..." : ""),
            },
          });
          activeConversationId = newConv.id;
        } catch (err) {
          console.warn("Could not persist conversation in DB:", (err as any)?.message);
          activeConversationId = null;
        }
      }
    }

    // Fetch previous conversation history if available
    let history: { role: "user" | "assistant"; content: string }[] = [];
    if (activeConversationId) {
      try {
        const pastMessages = await prisma.message.findMany({
          where: { conversationId: activeConversationId },
          orderBy: { createdAt: "asc" },
          take: 6,
        });

        history = pastMessages.map((m) => ({
          role: m.role === "USER" ? "user" : "assistant",
          content: m.content,
        }));
      } catch {
        history = [];
      }
    }

    // Save user's question if conversation is active
    let userMessageRecord: any = null;
    if (activeConversationId) {
      try {
        userMessageRecord = await prisma.message.create({
          data: {
            conversationId: activeConversationId,
            role: "USER",
            content: question.trim(),
          },
        });
      } catch (err) {
        console.warn("Could not save user message record:", (err as any)?.message);
      }
    }

    // Execute RAG query (guaranteed safe execution)
    const ragResult = await executeRAGQuery(question, {
      category,
      history,
    });

    // Save assistant's answer and sources
    let assistantMessageRecord: any = null;
    if (activeConversationId) {
      try {
        assistantMessageRecord = await prisma.message.create({
          data: {
            conversationId: activeConversationId,
            role: "ASSISTANT",
            content: ragResult.answer,
          },
        });

        // Attach sources if any
        if (ragResult.sources.length > 0) {
          for (const src of ragResult.sources) {
            if (isValidObjectId(src.chunkId)) {
              await prisma.messageSource.create({
                data: {
                  messageId: assistantMessageRecord.id,
                  documentChunkId: src.chunkId,
                  relevanceScore: src.relevanceScore,
                  snippet: src.snippet,
                },
              });
            }
          }
        }
      } catch (err) {
        console.warn("Could not save assistant message record:", (err as any)?.message);
      }
    }

    return NextResponse.json({
      answer: ragResult.answer,
      sources: ragResult.sources,
      usedFallback: ragResult.usedFallback,
      conversationId: activeConversationId,
      messageId: assistantMessageRecord?.id || null,
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        answer: "I apologize, but I encountered an error processing your query. Please ask again or select one of the suggested topics.",
        sources: [],
        usedFallback: true,
        conversationId: null,
        messageId: null,
      },
      { status: 200 }
    );
  }
}
