/**
 * Attendance Calculator - Core differentiator feature
 * Calculates real-time attendance impact of leave requests
 * Shows students exactly how their attendance % will change
 */

export interface AttendanceRecord {
  totalClasses: number
  attendedClasses: number
  subjectId?: string
}

export interface LeaveImpactResult {
  currentPercentage: number
  predictedPercentage: number
  decrease: number
  willFallBelowThreshold: boolean
  threshold: number
  classesMissed: number
  recommendation: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

export interface SubjectAttendance {
  subjectId: string
  subjectName: string
  subjectCode: string
  totalClasses: number
  attendedClasses: number
  percentage: number
  threshold: number
  isBelowThreshold: boolean
  classesToAttend: number // classes needed to reach threshold
}

export interface OverallAttendance {
  overall: number
  subjects: SubjectAttendance[]
  threshold: number
  isEligibleForExam: boolean
  riskSubjects: SubjectAttendance[]
}

// UGC/AICTE standard thresholds
export const ATTENDANCE_THRESHOLDS = {
  UGC_MINIMUM: 75,
  AICTE_MINIMUM: 75,
  AICTE_CONDONABLE: 10, // medical condonation up to 10%
  INSTITUTION_DEFAULT: 75,
} as const

/**
 * Calculate attendance percentage
 */
export function calculatePercentage(attended: number, total: number): number {
  if (total === 0) return 100
  return Math.round((attended / total) * 10000) / 100 // 2 decimal places
}

/**
 * Calculate predicted attendance after leave
 */
export function calculateLeaveImpact(
  currentAttendance: AttendanceRecord,
  leaveDays: number,
  classesPerDay: number = 1,
  threshold: number = ATTENDANCE_THRESHOLDS.INSTITUTION_DEFAULT
): LeaveImpactResult {
  const { totalClasses, attendedClasses } = currentAttendance
  const classesMissed = leaveDays * classesPerDay
  const newTotalClasses = totalClasses + classesMissed
  const newAttendedClasses = attendedClasses // leave days are not attended

  const currentPercentage = calculatePercentage(attendedClasses, totalClasses)
  const predictedPercentage = calculatePercentage(newAttendedClasses, newTotalClasses)
  const decrease = Math.round((currentPercentage - predictedPercentage) * 100) / 100

  const willFallBelowThreshold = predictedPercentage < threshold
  const riskLevel = getRiskLevel(predictedPercentage, threshold)

  return {
    currentPercentage,
    predictedPercentage,
    decrease,
    willFallBelowThreshold,
    threshold,
    classesMissed,
    recommendation: generateRecommendation(currentPercentage, predictedPercentage, threshold, riskLevel),
    riskLevel
  }
}

function getRiskLevel(percentage: number, threshold: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const buffer = percentage - threshold
  if (buffer >= 10) return 'LOW'
  if (buffer >= 5) return 'MEDIUM'
  if (buffer >= 0) return 'HIGH'
  return 'CRITICAL'
}

function generateRecommendation(
  current: number,
  predicted: number,
  threshold: number,
  riskLevel: string
): string {
  if (riskLevel === 'CRITICAL') {
    return `⚠️ CRITICAL: This leave will drop you below the ${threshold}% threshold. You will become ineligible for exams. Consider medical leave with documentation for condonation.`
  }
  if (riskLevel === 'HIGH') {
    return `⚠️ HIGH RISK: You'll be at ${predicted}%, only ${Math.round(predicted - threshold)}% above the ${threshold}% threshold. Any further absence risks exam eligibility.`
  }
  if (riskLevel === 'MEDIUM') {
    return `⚠️ MEDIUM RISK: You'll have ${Math.round(predicted - threshold)}% buffer above the ${threshold}% threshold. Avoid additional leaves.`
  }
  return `✅ LOW RISK: You'll maintain ${predicted}% attendance with a healthy ${Math.round(predicted - threshold)}% buffer above the ${threshold}% threshold.`
}

/**
 * Calculate subject-wise attendance with thresholds
 */
export function calculateSubjectAttendance(
  records: Array<{
    subjectId: string
    subjectName: string
    subjectCode: string
    totalClasses: number
    attendedClasses: number
  }>,
  threshold: number = ATTENDANCE_THRESHOLDS.INSTITUTION_DEFAULT
): SubjectAttendance[] {
  return records.map(r => {
    const percentage = calculatePercentage(r.attendedClasses, r.totalClasses)
    const isBelow = percentage < threshold
    const classesToAttend = isBelow
      ? Math.ceil((threshold * r.totalClasses - 100 * r.attendedClasses) / (100 - threshold))
      : 0

    return {
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      totalClasses: r.totalClasses,
      attendedClasses: r.attendedClasses,
      percentage,
      threshold,
      isBelowThreshold: isBelow,
      classesToAttend
    }
  })
}

/**
 * Calculate overall attendance with subject breakdown
 */
export function calculateOverallAttendance(
  subjectRecords: Array<{
    subjectId: string
    subjectName: string
    subjectCode: string
    totalClasses: number
    attendedClasses: number
  }>,
  threshold: number = ATTENDANCE_THRESHOLDS.INSTITUTION_DEFAULT
): OverallAttendance {
  const subjects = calculateSubjectAttendance(subjectRecords, threshold)
  const totalClasses = subjectRecords.reduce((sum, r) => sum + r.totalClasses, 0)
  const totalAttended = subjectRecords.reduce((sum, r) => sum + r.attendedClasses, 0)
  const overall = calculatePercentage(totalAttended, totalClasses)
  const riskSubjects = subjects.filter(s => s.isBelowThreshold)

  return {
    overall,
    subjects,
    threshold,
    isEligibleForExam: overall >= threshold && riskSubjects.length === 0,
    riskSubjects
  }
}

/**
 * Calculate classes needed to reach threshold
 */
export function classesNeededToReachThreshold(
  currentAttended: number,
  currentTotal: number,
  targetPercentage: number,
  futureTotalClasses: number = 0
): number {
  // Solve: (currentAttended + x) / (currentTotal + futureTotalClasses + x) >= targetPercentage / 100
  // x >= (targetPercentage * (currentTotal + futureTotalClasses) - 100 * currentAttended) / (100 - targetPercentage)
  const numerator = targetPercentage * (currentTotal + futureTotalClasses) - 100 * currentAttended
  const denominator = 100 - targetPercentage
  
  if (denominator <= 0) return 0
  const needed = Math.ceil(numerator / denominator)
  return Math.max(0, needed)
}

/**
 * Generate attendance timeline for visualization
 */
export function generateAttendanceTimeline(
  records: Array<{ date: Date; status: string }>,
  totalClasses: number
): Array<{ date: string; cumulativePercentage: number }> {
  let attended = 0
  let processed = 0
  
  return records
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(r => {
      processed++
      if (r.status === 'PRESENT' || r.status === 'LATE') attended++
      return {
        date: r.date.toISOString().split('T')[0],
        cumulativePercentage: calculatePercentage(attended, processed)
      }
    })
}

/**
 * Check if student is eligible for condonation
 */
export interface CondonationEligibility {
  isEligible: boolean
  reason: string
  requiredDocuments: string[]
  maxCondonablePercentage: number
}

export function checkCondonationEligibility(
  percentage: number,
  hasMedicalCertificate: boolean,
  threshold: number = ATTENDANCE_THRESHOLDS.INSTITUTION_DEFAULT
): CondonationEligibility {
  const shortage = threshold - percentage
  
  if (percentage >= threshold) {
    return {
      isEligible: true,
      reason: 'Attendance meets threshold - no condonation needed',
      requiredDocuments: [],
      maxCondonablePercentage: 0
    }
  }
  
  if (!hasMedicalCertificate) {
    return {
      isEligible: false,
      reason: 'Medical certificate required for condonation',
      requiredDocuments: ['Medical certificate from registered practitioner', 'Medical bills/prescription'],
      maxCondonablePercentage: 0
    }
  }
  
  const maxCondonable = ATTENDANCE_THRESHOLDS.AICTE_CONDONABLE
  
  if (shortage > maxCondonable) {
    return {
      isEligible: false,
      reason: `Shortage of ${shortage.toFixed(1)}% exceeds maximum condonable ${maxCondonable}%`,
      requiredDocuments: ['Medical certificate from registered practitioner', 'Medical bills/prescription', 'Hospital admission/discharge summary'],
      maxCondonablePercentage: maxCondonable
    }
  }
  
  return {
    isEligible: true,
    reason: `Eligible for ${shortage.toFixed(1)}% condonation with medical certificate`,
    requiredDocuments: ['Medical certificate from registered practitioner', 'Medical bills/prescription'],
    maxCondonablePercentage: shortage
  }
}

/**
 * Format attendance for display
 */
export function formatAttendance(percentage: number): string {
  return `${percentage.toFixed(2)}%`
}

/**
 * Get attendance color class based on percentage
 */
export function getAttendanceColorClass(percentage: number, threshold: number = 75): string {
  if (percentage < threshold) return 'text-red-500'
  if (percentage < threshold + 5) return 'text-yellow-500'
  if (percentage < threshold + 10) return 'text-blue-500'
  return 'text-green-500'
}

/**
 * Get attendance badge variant
 */
export function getAttendanceBadgeVariant(percentage: number, threshold: number = 75): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (percentage < threshold) return 'destructive'
  if (percentage < threshold + 5) return 'secondary'
  if (percentage < threshold + 10) return 'outline'
  return 'default'
}