from flask import Blueprint, jsonify, request, g
from auth.auth_middleware import token_required
from services.wellbeing_service import save_wellbeing_entry, get_student_wellbeing_history

wellbeing_bp = Blueprint('wellbeing', __name__)

@wellbeing_bp.route('/wellbeing/entry', methods=['POST'])
@token_required
def report_wellbeing():
    data = request.get_json()
    stress_level = data.get('stress_level')
    mood = data.get('mood')
    note = data.get('note')
    
    if stress_level is None or not (1 <= int(stress_level) <= 5):
        return jsonify({"error": "Valid stress_level (1-5) is required"}), 400
        
    from services.student_service import get_student_record_by_user_id
    student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
    
    if not student:
        return jsonify({"error": "Student profile not found"}), 404
        
    entry_id = save_wellbeing_entry(student['id'], int(stress_level), mood, note)
    return jsonify({"message": "Wellbeing reported successfully", "id": entry_id}), 201

@wellbeing_bp.route('/wellbeing/history', methods=['GET'])
@token_required
def wellbeing_history():
    from services.student_service import get_student_record_by_user_id
    student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
    
    if not student:
        return jsonify({"error": "Student profile not found"}), 404
        
    history = get_student_wellbeing_history(student['id'])
    return jsonify(history)
