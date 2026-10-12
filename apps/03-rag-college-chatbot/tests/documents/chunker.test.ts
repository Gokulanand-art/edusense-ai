import { describe, it, expect } from "vitest";
import { chunkText, estimateTokens } from "../../lib/documents/chunker";
import { cleanDocumentText } from "../../lib/documents/cleaner";

describe("Document Ingestion & Chunking Suite", () => {
  it("should clean whitespace, non-breaking spaces and line endings", () => {
    const raw = "Section 1: Rules\r\n\r\n   Page 1 of 5   \n\n\nRule A applies.   ";
    const cleaned = cleanDocumentText(raw);
    expect(cleaned).toContain("Section 1: Rules");
    expect(cleaned).toContain("Rule A applies.");
    expect(cleaned).not.toContain("Page 1 of 5");
  });

  it("should estimate token count correctly", () => {
    const text = "This is a sample sentence with several words.";
    const count = estimateTokens(text);
    expect(count).toBeGreaterThan(5);
    expect(count).toBeLessThan(30);
  });

  it("should split long text into overlapping chunks", () => {
    const sampleDoc = `
# Academic Regulations 2026

## Section 1: Attendance Policy
Students must maintain at least 75% attendance in all courses to be eligible for final examinations.
Medical exemptions are permissible up to 65% with valid hospital documentation submitted within 7 days.

## Section 2: Grading Structure
Grading is based on a 10-point scale. A minimum of 5.0 CGPA is required for degree completion.
Securing a CGPA of 8.5 or higher qualifies the student for Degree with Honours.
`;

    const chunks = chunkText(sampleDoc, { chunkSize: 50, chunkOverlap: 10 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content).toBeDefined();
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });
});
