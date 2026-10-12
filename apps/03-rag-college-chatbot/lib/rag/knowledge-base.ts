import { generateLocalEmbedding } from "../embeddings/local";

export interface KnowledgeChunk {
  id: string;
  documentTitle: string;
  fileName: string;
  category: string;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  content: string;
  embedding: number[];
}

const RAW_COLLEGE_KNOWLEDGE: {
  documentTitle: string;
  fileName: string;
  category: string;
  sections: {
    pageNumber: number;
    sectionTitle: string;
    content: string;
  }[];
}[] = [
  {
    documentTitle: "Academic Regulations 2026",
    fileName: "academic_regulations_2026.txt",
    category: "Academics",
    sections: [
      {
        pageNumber: 1,
        sectionTitle: "Section 1: Attendance Policy and Minimum Requirement",
        content: `1.1 Minimum Attendance Requirement: All registered students must maintain a minimum attendance of 75% in each individual theory and laboratory course to be eligible to appear for the Semester End Examinations (SEE).
1.2 Condonation for Medical Emergencies: A condonation of attendance up to 10% (allowing a minimum threshold of 65%) may be granted exclusively on grounds of serious illness, hospitalization, or representing the college in national university competitions. Condonation requires a verified medical certificate submitted to the Dean of Academic Affairs within 7 calendar days of returning to campus.
1.3 Detention Policy: Students with attendance below 65% in any course will be detained from the examination and must re-register for the course in subsequent academic semesters.`,
      },
      {
        pageNumber: 2,
        sectionTitle: "Section 2: 10-Point Relative Grading System & Honours Degree",
        content: `2.1 10-Point Relative Grading Scale: Academic evaluation is conducted on a 10-point scale:
- Grade O (Outstanding): Grade Point 10.0 (Marks 90-100)
- Grade A+ (Excellent): Grade Point 9.0 (Marks 80-89)
- Grade A (Very Good): Grade Point 8.0 (Marks 70-79)
- Grade B+ (Good): Grade Point 7.0 (Marks 60-69)
- Grade B (Above Average): Grade Point 6.0 (Marks 50-59)
- Grade C (Pass): Grade Point 5.0 (Marks 40-49)
- Grade F (Fail): Grade Point 0.0 (Marks < 40)
2.2 Degree with Honours: An undergraduate student who secures a cumulative grade point average (CGPA) of 8.50 or above, with no standing or cleared backlogs throughout the degree program, will be awarded a Degree with Honours.
2.3 Minimum CGPA for Graduation: Students must achieve a minimum cumulative CGPA of 5.00 to qualify for the award of degree.`,
      },
      {
        pageNumber: 3,
        sectionTitle: "Section 3: Examination, CIA Weightage & Re-evaluation",
        content: `3.1 Evaluation Weightage: Continuous Internal Assessment (CIA) accounts for 40% of the total course grade, while the Semester End Examination (SEE) accounts for 60%.
3.2 Answer Script Re-evaluation: Students may apply for answer script verification and re-evaluation within 10 days of results declaration by submitting an application along with a non-refundable fee of $25 per course.`,
      },
    ],
  },
  {
    documentTitle: "Hostel Rules and Code of Conduct",
    fileName: "hostel_rules_handbook.txt",
    category: "Hostel",
    sections: [
      {
        pageNumber: 1,
        sectionTitle: "Section 1: Daily Curfew Timings & Biometric Verification",
        content: `1.1 Daily Curfew: All residential students must return to the hostel premises by 9:30 PM on weekdays (Monday through Friday) and by 10:00 PM on weekends and public holidays.
1.2 Biometric Verification: Biometric attendance verification takes place between 9:00 PM and 9:30 PM nightly in the respective hostel warden block. Failure to record biometric attendance without prior leave sanction leads to disciplinary notices.
1.3 Night Out Pass: Students seeking to leave campus overnight must submit a formal Night Out Pass endorsed by parents or local guardians at least 24 hours in advance via the student portal.`,
      },
      {
        pageNumber: 2,
        sectionTitle: "Section 2: Visitor Policy & Room Regulations",
        content: `2.1 Visiting Hours: Parents and authorized guardians may visit residents between 4:00 PM and 7:00 PM in the designated Central Visitor Lounge only.
2.2 Room Access: No day scholars, outside visitors, or unauthorized guests are permitted inside student residential rooms under any circumstances. Violation results in a fine of $100 and potential room forfeiture.`,
      },
      {
        pageNumber: 3,
        sectionTitle: "Section 3: Quiet Hours & Anti-Ragging Mandate",
        content: `3.1 Quiet Hours: Mandatory quiet study hours are observed from 11:00 PM to 6:00 AM daily. Loud music, noise, or group gatherings during quiet hours are prohibited.
3.2 Zero Tolerance for Ragging: Ragging, bullying, physical harassment, or verbal abuse is strictly prohibited under the National Anti-Ragging Mandate. Any involvement will result in immediate expulsion and filing of a police FIR.`,
      },
    ],
  },
  {
    documentTitle: "Fee Structure and Scholarship Guidelines",
    fileName: "fee_scholarship_policy.txt",
    category: "Fees & Scholarships",
    sections: [
      {
        pageNumber: 1,
        sectionTitle: "Section 1: Tuition Fee Payment Schedules & Late Surcharge",
        content: `1.1 Annual Tuition Fee: The standard annual undergraduate tuition fee is $6,500, payable in two equal installments:
- Fall Semester Installment ($3,250): Due on or before August 15th.
- Spring Semester Installment ($3,250): Due on or before January 10th.
1.2 Late Fee Surcharge: Payments made after the official deadline incur a late fine of $10 per calendar day up to a maximum period of 30 days. Beyond 30 days, registration is temporarily put on hold.`,
      },
      {
        pageNumber: 2,
        sectionTitle: "Section 2: Merit Scholarships (Presidential Award & Dean's Fellowship)",
        content: `2.1 Presidential Scholar Award: Awarded to the top 5% ranked students in each engineering and science department based on annual SGPA. The award grants a 50% tuition fee waiver for the subsequent academic year.
2.2 Dean's Fellowship: Students achieving a CGPA of 9.00 or higher without backlogs receive a 25% tuition fee waiver.`,
      },
      {
        pageNumber: 3,
        sectionTitle: "Section 3: Need-Based Financial Aid",
        content: `3.1 Need-Based Assistance: Students from families with a verified annual gross household income of under $25,000 are eligible for up to 75% tuition fee assistance upon submission of the official Tax Assessment and Income Certificate to the Financial Aid Committee.`,
      },
    ],
  },
  {
    documentTitle: "Placement and Internship Guidelines",
    fileName: "placement_internship_handbook.txt",
    category: "Placements",
    sections: [
      {
        pageNumber: 1,
        sectionTitle: "Section 1: Campus Placement Eligibility & Training Requirements",
        content: `1.1 Academic Cutoff: Students must have a minimum CGPA of 6.50 with zero active/standing backlogs at the start of the final year to register for on-campus placement drives.
1.2 Training Program Attendance: Mandatory 80% attendance is required in the Soft Skills, Aptitude, and Technical Interview Training Modules conducted by the Training & Placement Cell.`,
      },
      {
        pageNumber: 2,
        sectionTitle: "Section 2: Job Offers & Dream Slot Exemption",
        content: `2.1 One Student One Job Policy: Once a student receives a job offer from an on-campus recruiter, they are deemed placed and become ineligible for other regular drives.
2.2 Dream Slot Exemption: If a visiting company offers a compensation package (CTC) exceeding $15,000 per annum, any previously placed student may participate for this single 'Dream Offer'.`,
      },
      {
        pageNumber: 3,
        sectionTitle: "Section 3: Mandatory Industrial Internship",
        content: `3.1 Degree Requirement: All undergraduate students must complete an 8-week accredited industrial internship during the summer recess following their 6th semester. This internship carries 4 mandatory academic credits.`,
      },
    ],
  },
];

export const BUILTIN_KNOWLEDGE_CHUNKS: KnowledgeChunk[] = [];

let idCounter = 1;
for (const doc of RAW_COLLEGE_KNOWLEDGE) {
  for (const sec of doc.sections) {
    const fullText = `${sec.sectionTitle}\n${sec.content}`;
    const embedding = generateLocalEmbedding(fullText);
    const hexId = idCounter.toString(16).padStart(24, "0");
    idCounter++;

    BUILTIN_KNOWLEDGE_CHUNKS.push({
      id: hexId,
      documentTitle: doc.documentTitle,
      fileName: doc.fileName,
      category: doc.category,
      pageNumber: sec.pageNumber,
      sectionTitle: sec.sectionTitle,
      content: sec.content,
      embedding,
    });
  }
}
