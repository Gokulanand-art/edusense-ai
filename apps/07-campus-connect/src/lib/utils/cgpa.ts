/**
 * CGPA & Marks Calculator
 * Handles semester-wise SGPA, cumulative CGPA, grade conversions
 */

export interface GradePoint {
  letter: string
  points: number
  range: { min: number; max: number }
}

export const GRADE_SCALE: GradePoint[] = [
  { letter: 'O', points: 10, range: { min: 90, max: 100 } },
  { letter: 'A+', points: 9, range: { min: 80, max: 89 } },
  { letter: 'A', points: 8, range: { min: 70, max: 79 } },
  { letter: 'B+', points: 7, range: { min: 60, max: 69 } },
  { letter: 'B', points: 6, range: { min: 50, max: 59 } },
  { letter: 'C', points: 5, range: { min: 40, max: 49 } },
  { letter: 'P', points: 4, range: { min: 35, max: 39 } },
  { letter: 'F', points: 0, range: { min: 0, max: 34 } },
  { letter: 'Ab', points: 0, range: { min: 0, max: 0 } },
]

export interface SubjectMarks {
  subjectId: string
  subjectName: string
  subjectCode: string
  credits: number
  internalMarks: number
  externalMarks: number
  totalMarks: number
  maxMarks: number
}

export interface SemesterResult {
  semester: number
  subjects: SubjectResult[]
  sgpa: number
  totalCredits: number
  earnedCredits: number
  cgpa: number
  status: 'PASS' | 'FAIL' | 'PROMOTED' | 'WITHHELD'
}

export interface SubjectResult {
  subjectId: string
  subjectName: string
  subjectCode: string
  credits: number
  internalMarks: number
  externalMarks: number
  totalMarks: number
  maxMarks: number
  percentage: number
  grade: string
  gradePoints: number
  earnedGradePoints: number
  status: 'PASS' | 'FAIL'
}

export interface CGPAProjection {
  currentCGPA: number
  currentCredits: number
  targetCGPA: number
  requiredSGPA: number
  remainingSemesters: number
  isAchievable: boolean
  message: string
}

/**
 * Calculate grade from percentage
 */
export function getGradeFromPercentage(percentage: number): GradePoint {
  for (const grade of GRADE_SCALE) {
    if (percentage >= grade.range.min && percentage <= grade.range.max) {
      return grade
    }
  }
  return GRADE_SCALE[GRADE_SCALE.length - 1] // F
}

/**
 * Calculate grade points from marks
 */
export function calculateGradePoints(marks: number, maxMarks: number): number {
  const percentage = (marks / maxMarks) * 100
  const grade = getGradeFromPercentage(percentage)
  return grade.points
}

/**
 * Calculate SGPA for a semester
 */
export function calculateSGPA(subjectResults: SubjectResult[]): number {
  const totalCredits = subjectResults.reduce((sum, s) => sum + s.credits, 0)
  const totalGradePoints = subjectResults.reduce((sum, s) => sum + s.earnedGradePoints, 0)
  
  if (totalCredits === 0) return 0
  return Math.round((totalGradePoints / totalCredits) * 100) / 100
}

/**
 * Calculate CGPA from all semesters
 */
export function calculateCGPA(semesterResults: SemesterResult[]): number {
  let totalCredits = 0
  let totalGradePoints = 0
  
  for (const sem of semesterResults) {
    totalCredits += sem.totalCredits
    totalGradePoints += sem.sgpa * sem.totalCredits
  }
  
  if (totalCredits === 0) return 0
  return Math.round((totalGradePoints / totalCredits) * 100) / 100
}

/**
 * Process subject marks into result
 */
export function processSubjectMarks(
  subject: SubjectMarks,
  passThreshold: number = 40
): SubjectResult {
  const totalMarks = subject.internalMarks + subject.externalMarks
  const percentage = (totalMarks / subject.maxMarks) * 100
  const grade = getGradeFromPercentage(percentage)
  const earnedGradePoints = grade.points * subject.credits
  
  return {
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    subjectCode: subject.subjectCode,
    credits: subject.credits,
    internalMarks: subject.internalMarks,
    externalMarks: subject.externalMarks,
    totalMarks,
    maxMarks: subject.maxMarks,
    percentage: Math.round(percentage * 100) / 100,
    grade: grade.letter,
    gradePoints: grade.points,
    earnedGradePoints,
    status: totalMarks >= (subject.maxMarks * passThreshold / 100) ? 'PASS' : 'FAIL'
  }
}

/**
 * Calculate semester result
 */
export function calculateSemesterResult(
  semester: number,
  subjectResults: SubjectResult[],
  previousSemesters: SemesterResult[] = []
): SemesterResult {
  const sgpa = calculateSGPA(subjectResults)
  const totalCredits = subjectResults.reduce((sum, s) => sum + s.credits, 0)
  const earnedCredits = subjectResults
    .filter(s => s.status === 'PASS')
    .reduce((sum, s) => sum + s.credits, 0)
  
  // Calculate CGPA including previous semesters
  let allCredits = totalCredits
  let allGradePoints = sgpa * totalCredits
  
  for (const prev of previousSemesters) {
    allCredits += prev.totalCredits
    allGradePoints += prev.sgpa * prev.totalCredits
  }
  
  const cgpa = allCredits > 0 ? Math.round((allGradePoints / allCredits) * 100) / 100 : 0
  
  const hasFail = subjectResults.some(s => s.status === 'FAIL')
  const status = hasFail ? 'FAIL' : 'PASS'
  
  return {
    semester,
    subjects: subjectResults,
    sgpa,
    totalCredits,
    earnedCredits,
    cgpa,
    status
  }
}

/**
 * Project CGPA based on target
 */
export function projectCGPA(
  currentCGPA: number,
  currentCredits: number,
  targetCGPA: number,
  remainingSemesters: number,
  avgCreditsPerSemester: number = 20
): CGPAProjection {
  const totalFutureCredits = remainingSemesters * avgCreditsPerSemester
  const totalCredits = currentCredits + totalFutureCredits
  const requiredTotalPoints = targetCGPA * totalCredits
  const currentPoints = currentCGPA * currentCredits
  const requiredFuturePoints = requiredTotalPoints - currentPoints
  const requiredSGPA = totalFutureCredits > 0 ? requiredFuturePoints / totalFutureCredits : 0
  
  const isAchievable = requiredSGPA <= 10
  let message = ''
  
  if (!isAchievable) {
    message = `Target CGPA of ${targetCGPA} requires SGPA of ${requiredSGPA.toFixed(2)} in remaining ${remainingSemesters} semesters, which exceeds maximum of 10.0`
  } else if (requiredSGPA > 9) {
    message = `Achievable but challenging: requires consistent ${requiredSGPA.toFixed(2)} SGPA`
  } else if (requiredSGPA > 8) {
    message = `Achievable with good performance: requires ${requiredSGPA.toFixed(2)} SGPA`
  } else {
    message = `Easily achievable: requires ${requiredSGPA.toFixed(2)} SGPA`
  }
  
  return {
    currentCGPA,
    currentCredits,
    targetCGPA,
    requiredSGPA: Math.round(requiredSGPA * 100) / 100,
    remainingSemesters,
    isAchievable,
    message
  }
}

/**
 * Calculate marks needed in upcoming exam to reach target
 */
export function marksNeededForTarget(
  currentInternal: number,
  maxInternal: number,
  maxExternal: number,
  targetPercentage: number,
  internalWeight: number = 0.3
): { needed: number; possible: boolean; message: string } {
  const currentContribution = (currentInternal / maxInternal) * internalWeight * 100
  const externalWeight = 1 - internalWeight
  const requiredExternalContribution = targetPercentage - currentContribution
  const neededExternalPercentage = requiredExternalContribution / externalWeight
  const neededExternalMarks = Math.ceil((neededExternalPercentage / 100) * maxExternal)
  
  const possible = neededExternalMarks <= maxExternal && neededExternalMarks >= 0
  
  let message = ''
  if (!possible && neededExternalMarks > maxExternal) {
    message = `Need ${neededExternalMarks}/${maxExternal} in external exam - not possible. Maximum achievable: ${Math.round((currentContribution + externalWeight * 100) * 100) / 100}%`
  } else if (!possible && neededExternalMarks < 0) {
    message = 'Target already secured with current internal marks'
  } else {
    message = `Need ${neededExternalMarks}/${maxExternal} in external exam`
  }
  
  return {
    needed: Math.max(0, neededExternalMarks),
    possible,
    message
  }
}

/**
 * Format CGPA for display
 */
export function formatCGPA(cgpa: number): string {
  return cgpa.toFixed(2)
}

/**
 * Get CGPA color class
 */
export function getCGPACcolorClass(cgpa: number): string {
  if (cgpa >= 9) return 'text-green-600'
  if (cgpa >= 8) return 'text-blue-600'
  if (cgpa >= 7) return 'text-yellow-600'
  if (cgpa >= 6) return 'text-orange-600'
  return 'text-red-600'
}

/**
 * Convert CGPA to percentage (common Indian formula)
 */
export function cgpaToPercentage(cgpa: number): number {
  return Math.round(cgpa * 9.5 * 100) / 100
}

/**
 * Convert percentage to CGPA
 */
export function percentageToCGPA(percentage: number): number {
  return Math.round((percentage / 9.5) * 100) / 100
}

/**
 * Calculate rank from CGPA array
 */
export function calculateRank(cgpa: number, allCGPAs: number[]): number {
  const sorted = [...allCGPAs].sort((a, b) => b - a)
  return sorted.findIndex(c => c <= cgpa) + 1
}

/**
 * Generate marksheet data for PDF
 */
export interface MarksheetData {
  student: {
    name: string
    rollNumber: string
    registrationNumber: string
    program: string
    batch: string
    semester: number
  }
  subjects: SubjectResult[]
  sgpa: number
  cgpa: number
  totalCredits: number
  earnedCredits: number
  status: string
  academicYear: string
  issueDate: string
}