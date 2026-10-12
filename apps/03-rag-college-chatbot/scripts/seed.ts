import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateEmbedding } from "../lib/embeddings/provider";
import { chunkText } from "../lib/documents/chunker";

const prisma = new PrismaClient();

const SAMPLE_DOCUMENTS = [
  {
    title: "Academic Regulations 2026",
    fileName: "academic_regulations_2026.txt",
    fileType: "TXT",
    category: "Academics",
    content: `# Academic Regulations 2026 - Apex Institute of Technology

## Section 1: Attendance Policy and Eligibility
1.1 Minimum Attendance Requirement: All registered students must maintain a minimum attendance of 75% in each individual theory and laboratory course in order to be eligible to appear for the Semester End Examinations (SEE).
1.2 Condonation for Medical Emergencies: A condonation of attendance up to 10% (allowing a minimum threshold of 65%) may be granted exclusively on grounds of serious illness, hospitalization, or representing the college in national university competitions. Condonation requires a verified medical certificate submitted to the Dean of Academic Affairs within 7 calendar days of returning to campus.
1.3 Detention Policy: Students with attendance below 65% in any course will be detained from the examination and must re-register for the course in subsequent academic semesters.

## Section 2: Grading System and Academic Performance
2.1 10-Point Relative Grading Scale: Academic evaluation is conducted on a 10-point scale:
- Grade O (Outstanding): Grade Point 10.0 (Marks 90-100)
- Grade A+ (Excellent): Grade Point 9.0 (Marks 80-89)
- Grade A (Very Good): Grade Point 8.0 (Marks 70-79)
- Grade B+ (Good): Grade Point 7.0 (Marks 60-69)
- Grade B (Above Average): Grade Point 6.0 (Marks 50-59)
- Grade C (Pass): Grade Point 5.0 (Marks 40-49)
- Grade F (Fail): Grade Point 0.0 (Marks < 40)
2.2 Degree with Honours: An undergraduate student who secures a cumulative grade point average (CGPA) of 8.50 or above, with no standing or cleared backlogs throughout the degree program, will be awarded a Degree with Honours.
2.3 Minimum CGPA for Graduation: Students must achieve a minimum cumulative CGPA of 5.00 to qualify for the award of degree.

## Section 3: Examination and Re-evaluation
3.1 Evaluation Weightage: Continuous Internal Assessment (CIA) accounts for 40% of the total course grade, while the Semester End Examination (SEE) accounts for 60%.
3.2 Answer Script Re-evaluation: Students may apply for answer script verification and re-evaluation within 10 days of results declaration by submitting an application along with a non-refundable fee of $25 per course.`,
  },
  {
    title: "Hostel Rules and Code of Conduct",
    fileName: "hostel_rules_handbook.txt",
    fileType: "TXT",
    category: "Hostel",
    content: `# Campus Residence and Hostel Handbook

## Section 1: Curfew and Entry Timings
1.1 Daily Curfew: All residential students must return to the hostel premises by 9:30 PM on weekdays (Monday through Friday) and by 10:00 PM on weekends and public holidays.
1.2 Biometric Verification: Biometric attendance verification takes place between 9:00 PM and 9:30 PM nightly in the respective hostel warden block. Failure to record biometric attendance without prior leave sanction leads to disciplinary notices.
1.3 Night Out Pass: Students seeking to leave campus overnight must submit a formal Night Out Pass endorsed by parents or local guardians at least 24 hours in advance via the student portal.

## Section 2: Visitor and Guest Policy
2.1 Visiting Hours: Parents and authorized guardians may visit residents between 4:00 PM and 7:00 PM in the designated Central Visitor Lounge only.
2.2 Room Access: No day scholars, outside visitors, or unauthorized guests are permitted inside student residential rooms under any circumstances. Violation results in a fine of $100 and potential room forfeiture.

## Section 3: Quiet Hours and Disciplinary Standards
3.1 Quiet Hours: Mandatory quiet study hours are observed from 11:00 PM to 6:00 AM daily. Loud music, noise, or group gatherings during quiet hours are prohibited.
3.2 Zero Tolerance for Ragging: Ragging, bullying, physical harassment, or verbal abuse is strictly prohibited under the National Anti-Ragging Mandate. Any involvement will result in immediate expulsion and filing of a police FIR.`,
  },
  {
    title: "Fee Structure and Scholarship Guidelines",
    fileName: "fee_scholarship_policy.txt",
    fileType: "TXT",
    category: "Fees & Scholarships",
    content: `# Fee Structure and Scholarship Policy

## Section 1: Tuition Fee Payment Schedules
1.1 Annual Tuition Fee: The standard annual undergraduate tuition fee is $6,500, payable in two equal installments:
- Fall Semester Installment ($3,250): Due on or before August 15th.
- Spring Semester Installment ($3,250): Due on or before January 10th.
1.2 Late Fee Surcharge: Payments made after the official deadline incur a late fine of $10 per calendar day up to a maximum period of 30 days. Beyond 30 days, registration is temporarily put on hold.

## Section 2: Merit Scholarships
2.1 Presidential Scholar Award: Awarded to the top 5% ranked students in each engineering and science department based on annual SGPA. The award grants a 50% tuition fee waiver for the subsequent academic year.
2.2 Dean's Fellowship: Students achieving a CGPA of 9.00 or higher without backlogs receive a 25% tuition fee waiver.

## Section 3: Need-Based Financial Aid and Concessions
3.1 Need-Based Assistance: Students from families with a verified annual gross household income of under $25,000 are eligible for up to 75% tuition fee assistance upon submission of the official Tax Assessment and Income Certificate to the Financial Aid Committee.`,
  },
  {
    title: "Placement and Internship Guidelines",
    fileName: "placement_internship_handbook.txt",
    fileType: "TXT",
    category: "Placements",
    content: `# Training and Placement Cell Guidelines

## Section 1: Campus Placement Eligibility
1.1 Academic Cutoff: Students must have a minimum CGPA of 6.50 with zero active/standing backlogs at the start of the final year to register for on-campus placement drives.
1.2 Training Program Attendance: Mandatory 80% attendance is required in the Soft Skills, Aptitude, and Technical Interview Training Modules conducted by the Training & Placement Cell.

## Section 2: Job Offers and Dream Slot Policy
2.1 One Student One Job Policy: Once a student receives a job offer from an on-campus recruiter, they are deemed placed and become ineligible for other regular drives.
2.2 Dream Slot Exemption: If a visiting company offers a compensation package (CTC) exceeding $15,000 per annum, any previously placed student may participate for this single 'Dream Offer'.

## Section 3: Mandatory Industrial Internship
3.1 Degree Requirement: All undergraduate students must complete an 8-week accredited industrial internship during the summer recess following their 6th semester. This internship carries 4 mandatory academic credits.`,
  },
];

async function main() {
  console.log("🌱 Starting database seed...");

  // 1. Seed Users (Admin & Student)
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash("Admin@123", salt);
  const studentPasswordHash = await bcrypt.hash("Student@123", salt);

  const admin = await prisma.user.upsert({
    where: { email: "admin@college.edu" },
    update: { passwordHash: adminPasswordHash, role: "ADMIN" },
    create: {
      name: "College Administrator",
      email: "admin@college.edu",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
  });
  console.log(`✅ Admin user seeded: ${admin.email} (Role: ${admin.role})`);

  const student = await prisma.user.upsert({
    where: { email: "student@college.edu" },
    update: { passwordHash: studentPasswordHash, role: "STUDENT" },
    create: {
      name: "Alex Johnson",
      email: "student@college.edu",
      passwordHash: studentPasswordHash,
      role: "STUDENT",
    },
  });
  console.log(`✅ Student user seeded: ${student.email} (Role: ${student.role})`);

  // 2. Seed Official College Documents with Chunks and Vectors
  for (const docData of SAMPLE_DOCUMENTS) {
    // Check if document already exists
    let doc = await prisma.document.findFirst({
      where: { title: docData.title },
    });

    if (!doc) {
      doc = await prisma.document.create({
        data: {
          title: docData.title,
          fileName: docData.fileName,
          fileType: docData.fileType,
          fileSize: Buffer.byteLength(docData.content),
          category: docData.category,
          status: "READY",
        },
      });
    }

    // Clean existing chunks to prevent duplication on re-seed
    await prisma.documentChunk.deleteMany({
      where: { documentId: doc.id },
    });

    // Chunk the text
    const chunks = chunkText(docData.content, { chunkSize: 700, chunkOverlap: 100 });

    console.log(`Indexing ${chunks.length} chunks for "${doc.title}"...`);

    for (const c of chunks) {
      const embedding = await generateEmbedding(c.content);
      const vectorJson = JSON.stringify(embedding);

      const chunkRecord = await prisma.documentChunk.create({
        data: {
          documentId: doc.id,
          content: c.content,
          chunkIndex: c.chunkIndex,
          pageNumber: c.pageNumber || 1,
          sectionTitle: c.sectionTitle,
          tokenCount: c.tokenCount,
          vectorJson,
        },
      });


    }

    // Update document metadata
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        status: "READY",
        metadata: JSON.stringify({
          chunkCount: chunks.length,
          seeded: true,
          seededAt: new Date().toISOString(),
        }),
      },
    });

    console.log(`✅ Document "${doc.title}" successfully ingested and indexed!`);
  }

  console.log("🚀 Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
