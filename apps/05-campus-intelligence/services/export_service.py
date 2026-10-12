"""
Data Export Service
Generates CSV, PDF, and Excel exports for reports and data analysis
"""

import logging
import csv
import io
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

class ExportService:
    """Service for exporting data in various formats."""
    
    @staticmethod
    def export_to_csv(data, columns, filename=None):
        """
        Export data to CSV format.
        
        Args:
            data: List of dictionaries or tuples
            columns: List of column names
            filename: Optional filename
            
        Returns:
            tuple: (csv_content, filename)
        """
        try:
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=columns)
            
            # Write header
            writer.writeheader()
            
            # Write data
            for row in data:
                if isinstance(row, dict):
                    writer.writerow(row)
                else:
                    # Convert tuple/list to dict
                    row_dict = {columns[i]: row[i] for i in range(len(columns))}
                    writer.writerow(row_dict)
            
            csv_content = output.getvalue()
            output.close()
            
            if not filename:
                filename = f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
            logger.info(f"CSV export created: {filename}")
            return csv_content, filename
        
        except Exception as e:
            logger.error(f"CSV export failed: {str(e)}")
            raise
    
    @staticmethod
    def export_to_json(data, filename=None):
        """Export data to JSON format."""
        import json
        
        try:
            json_content = json.dumps(data, indent=2, default=str)
            
            if not filename:
                filename = f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            
            logger.info(f"JSON export created: {filename}")
            return json_content, filename
        
        except Exception as e:
            logger.error(f"JSON export failed: {str(e)}")
            raise
    
    @staticmethod
    def export_students_to_csv(students):
        """Export student data to CSV."""
        columns = [
            'ID', 'Name', 'Email', 'Department', 'CGPA',
            'Attendance', 'Mock Score', 'Skills Count', 'Status'
        ]
        
        data = []
        for student in students:
            data.append({
                'ID': student.get('id', ''),
                'Name': student.get('name', ''),
                'Email': student.get('email', ''),
                'Department': student.get('department', ''),
                'CGPA': student.get('cgpa', 0),
                'Attendance': f"{student.get('attendance', 0)}%",
                'Mock Score': student.get('mock_score', 0),
                'Skills Count': student.get('skills_count', 0),
                'Status': student.get('status', 'Active')
            })
        
        return ExportService.export_to_csv(
            data, columns, 
            filename=f"students_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        )
    
    @staticmethod
    def export_marks_to_csv(marks_data):
        """Export marks data to CSV."""
        columns = [
            'Student ID', 'Student Name', 'Subject', 'Marks',
            'Percentage', 'Grade', 'Date'
        ]
        
        data = []
        for record in marks_data:
            data.append({
                'Student ID': record.get('student_id', ''),
                'Student Name': record.get('student_name', ''),
                'Subject': record.get('subject', ''),
                'Marks': record.get('marks', 0),
                'Percentage': f"{record.get('percentage', 0)}%",
                'Grade': record.get('grade', 'N/A'),
                'Date': record.get('date', '')
            })
        
        return ExportService.export_to_csv(
            data, columns,
            filename=f"marks_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        )
    
    @staticmethod
    def export_attendance_to_csv(attendance_data):
        """Export attendance data to CSV."""
        columns = [
            'Student ID', 'Student Name', 'Subject', 'Total Classes',
            'Present', 'Absent', 'Attendance %', 'Status'
        ]
        
        data = []
        for record in attendance_data:
            total = record.get('total_classes', 0)
            present = record.get('present', 0)
            percentage = (present / total * 100) if total > 0 else 0
            
            data.append({
                'Student ID': record.get('student_id', ''),
                'Student Name': record.get('student_name', ''),
                'Subject': record.get('subject', ''),
                'Total Classes': total,
                'Present': present,
                'Absent': total - present,
                'Attendance %': f"{percentage:.2f}%",
                'Status': 'Good' if percentage >= 75 else 'Warning'
            })
        
        return ExportService.export_to_csv(
            data, columns,
            filename=f"attendance_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        )
    
    @staticmethod
    def export_skills_to_csv(skills_data):
        """Export skills data to CSV."""
        columns = [
            'Student ID', 'Student Name', 'Skill', 'Level',
            'Added Date'
        ]
        
        data = []
        for record in skills_data:
            data.append({
                'Student ID': record.get('student_id', ''),
                'Student Name': record.get('student_name', ''),
                'Skill': record.get('skill_name', ''),
                'Level': record.get('skill_level', 'Intermediate'),
                'Added Date': record.get('created_at', '')
            })
        
        return ExportService.export_to_csv(
            data, columns,
            filename=f"skills_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        )
    
    @staticmethod
    def export_goals_to_csv(goals_data):
        """Export goals data to CSV."""
        columns = [
            'Student ID', 'Student Name', 'Goal', 'Status',
            'Priority', 'Target Date', 'Progress %', 'Created Date'
        ]
        
        data = []
        for record in goals_data:
            data.append({
                'Student ID': record.get('student_id', ''),
                'Student Name': record.get('student_name', ''),
                'Goal': record.get('goal_title', ''),
                'Status': record.get('status', 'Active'),
                'Priority': record.get('priority', 'Medium'),
                'Target Date': record.get('target_date', ''),
                'Progress %': record.get('progress', 0),
                'Created Date': record.get('created_at', '')
            })
        
        return ExportService.export_to_csv(
            data, columns,
            filename=f"goals_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        )
    
    @staticmethod
    def export_performance_report(student_data):
        """Generate comprehensive performance report."""
        report = f"""
SMART CAMPUS INTELLIGENCE SYSTEM
Performance Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

{'='*60}

STUDENT INFORMATION
{'='*60}
Name: {student_data.get('name', 'N/A')}
Student ID: {student_data.get('id', 'N/A')}
Email: {student_data.get('email', 'N/A')}
Department: {student_data.get('department', 'N/A')}

ACADEMIC METRICS
{'='*60}
CGPA: {student_data.get('cgpa', 'N/A')}
Average Marks: {student_data.get('avg_marks', 'N/A')}%
Attendance: {student_data.get('attendance', 'N/A')}%
Mock Score: {student_data.get('mock_score', 'N/A')}

SKILLS & COMPETENCIES
{'='*60}
Total Skills: {student_data.get('skills_count', 0)}
{_format_skills_list(student_data.get('skills', []))}

GOALS & MILESTONES
{'='*60}
Active Goals: {student_data.get('active_goals', 0)}
Completed Goals: {student_data.get('completed_goals', 0)}
Overall Progress: {student_data.get('goal_completion_rate', 0)}%

PLACEMENT READINESS
{'='*60}
Readiness Score: {student_data.get('readiness_score', 'N/A')}/100
Matched Companies: {student_data.get('matched_companies', 0)}
Package Range: {student_data.get('package_range', 'N/A')} LPA

RECOMMENDATIONS
{'='*60}
{_format_recommendations(student_data.get('recommendations', []))}

{'='*60}
End of Report
"""
        return report, f"performance_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    
    @staticmethod
    def generate_class_analytics(class_data):
        """Generate class-level analytics report."""
        columns = [
            'Metric', 'Value'
        ]
        
        data = [
            {'Metric': 'Total Students', 'Value': class_data.get('total_students', 0)},
            {'Metric': 'Average CGPA', 'Value': f"{class_data.get('avg_cgpa', 0):.2f}"},
            {'Metric': 'Average Attendance', 'Value': f"{class_data.get('avg_attendance', 0)}%"},
            {'Metric': 'Average Mock Score', 'Value': f"{class_data.get('avg_mock_score', 0)}"},
            {'Metric': 'Placement Eligible', 'Value': class_data.get('placement_eligible', 0)},
            {'Metric': 'Students at Risk', 'Value': class_data.get('at_risk', 0)},
        ]
        
        return ExportService.export_to_csv(
            data, columns,
            filename=f"class_analytics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        )

def _format_skills_list(skills):
    """Format skills list for report."""
    if not skills:
        return "No skills added"
    
    formatted = ""
    for skill in skills[:10]:  # Show first 10
        level = skill.get('skill_level', 'Intermediate')
        name = skill.get('skill_name', skill.get('name', 'Unknown'))
        formatted += f"  • {name} ({level})\n"
    
    if len(skills) > 10:
        formatted += f"  ... and {len(skills) - 10} more skills\n"
    
    return formatted

def _format_recommendations(recommendations):
    """Format recommendations for report."""
    if not recommendations:
        return "No specific recommendations at this time."
    
    formatted = ""
    for i, rec in enumerate(recommendations[:5], 1):
        priority = rec.get('priority', 'medium').upper()
        title = rec.get('title', 'Recommendation')
        message = rec.get('message', '')
        formatted += f"  {i}. [{priority}] {title}\n"
        if message:
            formatted += f"     {message}\n"
    
    return formatted
