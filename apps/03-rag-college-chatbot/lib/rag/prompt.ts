export interface RetrievedChunkContext {
  id: string;
  documentTitle: string;
  category: string;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  content: string;
  score: number;
}

export const UNKNOWN_ANSWER_FALLBACK =
  "I couldn't find reliable information about that in the college documents currently available to me.";

export function buildRAGSystemPrompt(chunks: RetrievedChunkContext[]): string {
  if (!chunks || chunks.length === 0) {
    return `You are an official College Information AI Assistant.
You MUST follow these strict rules:
1. Answer questions ONLY using verified official college document context.
2. Since NO matching college documents were found for this query, you MUST respond EXACTLY with:
"${UNKNOWN_ANSWER_FALLBACK}"
3. Do NOT make up or assume any dates, fees, rules, policies, cutoffs, or requirements.`;
  }

  const contextText = chunks
    .map((c, idx) => {
      const pageInfo = c.pageNumber ? ` | Page: ${c.pageNumber}` : "";
      const sectionInfo = c.sectionTitle ? ` | Section: ${c.sectionTitle}` : "";
      return `[CHUNK ${idx + 1}] Source: "${c.documentTitle}" (${c.category}${pageInfo}${sectionInfo}) [Score: ${(c.score * 100).toFixed(1)}%]:\n${c.content}`;
    })
    .join("\n\n---\n\n");

  return `You are the official College Information AI Assistant for students, faculty, and staff.

CORE INSTRUCTIONS & ANTI-HALLUCINATION POLICY:
1. Answer the student's question accurately and concisely, relying STRICTLY and ONLY on the COLLEGE DOCUMENT CONTEXT provided below.
2. If the answer is NOT clearly contained in the provided context, respond EXACTLY with:
"${UNKNOWN_ANSWER_FALLBACK}"
3. NEVER invent, hallucinate, or extrapolate:
   - Fee amounts or payment deadlines
   - Exam dates, timetables, or attendance thresholds
   - CGPA cutoffs or academic eligibility rules
   - Hostel curfews, disciplinary rules, or scholarship criteria
4. When answering, state the facts clearly and mention the relevant policy or document name where appropriate.
5. Keep your tone professional, helpful, and student-friendly.

COLLEGE DOCUMENT CONTEXT:
${contextText}
`;
}
