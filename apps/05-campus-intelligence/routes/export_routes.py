"""
Data Export Routes
Handles data export to various formats (CSV, PDF, JSON)
"""

import logging
from flask import Blueprint, jsonify, g, send_file
from io import BytesIO
import io

from auth.auth_middleware import token_required
from services.export_service import ExportService
from database import get_db_connection

export_bp = Blueprint("export", __name__)
logger = logging.getLogger(__name__)

def _get_student_data(student_id, institution_id):
    """Helper to fetch complete student data."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get basic student info
                cur.execute("""
                    SELECT id, name, email, department, cgpa, status
                    FROM students
                    WHERE id = %s AND institution_id = %s
                """, (student_id, institution_id))
                
                student = cur.fetchone()
                if not student:
                    return None
                
                result = {
                    'id': student[0],
                    'name': student[1],
                    'email': student[2],
                    'department': student[3],
                    'cgpa': student[4],
                    'status': student[5]
                }
                
                # Get additional metrics
                cur.execute("""
                    SELECT COALESCE(AVG(marks), 0) as avg_marks
                    FROM marks
                    WHERE student_id = %s
                """, (student_id,))
                row = cur.fetchone()
                result['avg_marks'] = row[0] if row else 0
                
                # Get attendance
                cur.execute("""
                    SELECT COALESCE(ROUND(AVG(attendance_percentage), 2), 0)
                    FROM attendance
                    WHERE student_id = %s
                    GROUP BY student_id
                """, (student_id,))
                row = cur.fetchone()
                result['attendance'] = row[0] if row else 0
                
                # Get skills count
                cur.execute("""
                    SELECT COUNT(*) FROM student_skills WHERE student_id = %s
                """, (student_id,))
                row = cur.fetchone()
                result['skills_count'] = row[0] if row else 0
                
                return result
        
    except Exception as e:
        logger.error(f"Error fetching student data: {str(e)}")
        return None

@export_bp.route("/export/my-data/csv", methods=["GET"])
@token_required
def export_my_data_csv():
    """Export student's own data to CSV."""
    if g.user_role != "Student":
        return jsonify({"error": "Only students can export their data"}), 403
    
    try:
        # Get student info
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id FROM students WHERE user_id = %s AND institution_id = %s
                """, (g.user_id, g.institution_id))
                
                row = cur.fetchone()
                student_id = row[0] if row else None
                
                if not student_id:
                    return jsonify({"error": "Student profile not found"}), 404
                
                # Get marks
                cur.execute("""
                    SELECT student_id, subject, marks, marks_percentage, grade, exam_date
                    FROM marks
                    WHERE student_id = %s
                    ORDER BY exam_date DESC
                """, (student_id,))
                
                marks_data = []
                for row in cur.fetchall():
                    marks_data.append({
                        'student_id': row[0],
                        'subject': row[1],
                        'marks': row[2],
                        'percentage': row[3],
                        'grade': row[4],
                        'date': str(row[5]) if row[5] else ''
                    })
        
        # Export to CSV
        csv_content, filename = ExportService.export_marks_to_csv(marks_data)
        
        # Create response
        output = io.BytesIO()
        output.write(csv_content.encode('utf-8'))
        output.seek(0)
        
        return send_file(
            output,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    
    except Exception as e:
        logger.error(f"Export CSV failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@export_bp.route("/export/my-data/json", methods=["GET"])
@token_required
def export_my_data_json():
    """Export student's own data to JSON."""
    if g.user_role != "Student":
        return jsonify({"error": "Only students can export their data"}), 403
    
    try:
        # Get student info
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id FROM students WHERE user_id = %s AND institution_id = %s
                """, (g.user_id, g.institution_id))
                
                row = cur.fetchone()
                student_id = row[0] if row else None
                
                if not student_id:
                    return jsonify({"error": "Student profile not found"}), 404
                
                # Get comprehensive student data
                cur.execute("""
                    SELECT id, name, email, department, cgpa, status
                    FROM students
                    WHERE id = %s
                """, (student_id,))
                
                student_row = cur.fetchone()
                student_data = {
                    'id': student_row[0],
                    'name': student_row[1],
                    'email': student_row[2],
                    'department': student_row[3],
                    'cgpa': student_row[4],
                    'status': student_row[5]
                }
                
                # Get marks
                cur.execute("""
                    SELECT subject, marks, marks_percentage, grade, exam_date
                    FROM marks
                    WHERE student_id = %s
                    ORDER BY exam_date DESC
                """, (student_id,))
                
                student_data['marks'] = [
                    {
                        'subject': row[0],
                        'marks': row[1],
                        'percentage': row[2],
                        'grade': row[3],
                        'date': str(row[4]) if row[4] else ''
                    }
                    for row in cur.fetchall()
                ]
                
                # Get skills
                cur.execute("""
                    SELECT skill_name, skill_level, created_at
                    FROM student_skills
                    WHERE student_id = %s
                    ORDER BY created_at DESC
                """, (student_id,))
                
                student_data['skills'] = [
                    {
                        'skill': row[0],
                        'level': row[1],
                        'added_date': str(row[2]) if row[2] else ''
                    }
                    for row in cur.fetchall()
                ]
        
        # Export to JSON
        json_content, filename = ExportService.export_to_json(student_data)
        
        # Create response
        output = io.BytesIO()
        output.write(json_content.encode('utf-8'))
        output.seek(0)
        
        return send_file(
            output,
            mimetype='application/json',
            as_attachment=True,
            download_name=filename
        )
    
    except Exception as e:
        logger.error(f"Export JSON failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@export_bp.route("/export/performance-report", methods=["GET"])
@token_required
def export_performance_report():
    """Export performance report."""
    if g.user_role != "Student":
        return jsonify({"error": "Only students can export reports"}), 403
    
    try:
        # Get student info
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, name, email, department, cgpa
                    FROM students
                    WHERE user_id = %s AND institution_id = %s
                """, (g.user_id, g.institution_id))
                
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Student profile not found"}), 404
                
                student_data = {
                    'id': row[0],
                    'name': row[1],
                    'email': row[2],
                    'department': row[3],
                    'cgpa': row[4]
                }
        
        # Generate report
        report_content, filename = ExportService.export_performance_report(student_data)
        
        # Create response
        output = io.BytesIO()
        output.write(report_content.encode('utf-8'))
        output.seek(0)
        
        return send_file(
            output,
            mimetype='text/plain',
            as_attachment=True,
            download_name=filename
        )
    
    except Exception as e:
        logger.error(f"Report export failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@export_bp.route("/export/attendance/csv", methods=["GET"])
@token_required
def export_attendance_csv():
    """Export attendance data to CSV."""
    if g.user_role not in ["Faculty", "Admin"]:
        return jsonify({"error": "Access denied"}), 403
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get attendance data
                cur.execute("""
                    SELECT s.id, s.name, sub.name as subject,
                           COUNT(*) as total_classes,
                           SUM(CASE WHEN a.is_present THEN 1 ELSE 0 END) as present
                    FROM attendance a
                    JOIN students s ON a.student_id = s.id
                    JOIN subjects sub ON a.subject_id = sub.id
                    GROUP BY s.id, s.name, sub.name
                    ORDER BY s.name
                """)
                
                attendance_data = [
                    {
                        'student_id': row[0],
                        'student_name': row[1],
                        'subject': row[2],
                        'total_classes': row[3],
                        'present': row[4]
                    }
                    for row in cur.fetchall()
                ]
        
        # Export to CSV
        csv_content, filename = ExportService.export_attendance_to_csv(attendance_data)
        
        # Create response
        output = io.BytesIO()
        output.write(csv_content.encode('utf-8'))
        output.seek(0)
        
        return send_file(
            output,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    
    except Exception as e:
        logger.error(f"Attendance export failed: {str(e)}")
        return jsonify({"error": str(e)}), 500
