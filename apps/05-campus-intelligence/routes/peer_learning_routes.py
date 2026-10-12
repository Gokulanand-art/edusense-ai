from flask import Blueprint, jsonify, g, request
from auth.auth_middleware import token_required, role_required
from services.peer_learning_service import (
    get_peer_mentorship_suggestions, 
    get_mentor_dashboard_stats,
    get_peer_feed_for_student,
    get_peer_achievements_summary,
    update_peer_preferences,
    get_peer_preferences,
    add_peer_skill,
    get_trending_skills,
    create_study_group,
    join_study_group,
    get_student_study_groups,
    record_peer_achievement
)
from services.student_service import get_student_record_by_user_id
from utils.pagination import PaginationHelper
from utils.schemas import create_error_response

peer_learning_bp = Blueprint('peer_learning', __name__)

@peer_learning_bp.route('/peer-learning/suggestions', methods=['GET'])
@token_required
def suggestions():
    """
    Get mentorship suggestions for the logged-in student.
    """
    # Assuming g.user_id is set by token_required and refers to the USER record.
    # We need the STUDENT id.
    from services.student_service import get_student_record_by_user_id
    student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
    
    if not student:
        return jsonify({"error": "Student profile not found"}), 404
        
    suggestions = get_peer_mentorship_suggestions(student['id'], institution_id=g.institution_id)
    return jsonify(suggestions)

@peer_learning_bp.route('/peer-learning/mentor-status', methods=['GET'])
@token_required
def mentor_status():
    """
    Check if the logged-in student is a mentor for any subjects.
    """
    from services.student_service import get_student_record_by_user_id
    student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
    
    if not student:
        return jsonify({"error": "Student profile not found"}), 404
        
    mentor_for = get_mentor_dashboard_stats(student['id'])
    return jsonify({
        "is_mentor": len(mentor_for) > 0,
        "subjects": mentor_for
    })


# ===================================================================
# SPRINT 3: PEER LEARNING FEED ENDPOINTS
# ===================================================================

@peer_learning_bp.route('/student/peer-feed', methods=['GET'])
@token_required
def get_peer_feed():
    """
    Get personalized peer feed (with privacy controls).
    
    Query Parameters:
        - page: Page number (default 1)
        - per_page: Items per page (default 20, max 100)
        - types: Filter by achievement types (placement,skill,badge,goal)
        
    Example:
        GET /student/peer-feed?page=1&per_page=20&types=placement,skill
    """
    try:
        # Get pagination parameters
        params, errors = PaginationHelper.get_pagination_params()
        if errors:
            error_resp, status_code = create_error_response("INVALID_PARAMS", "Invalid pagination parameters", 400, errors)
            return jsonify(error_resp), status_code

        student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
        if not student:
            return jsonify({"error": "Student profile not found"}), 404
        
        # Convert page-based to offset-based for service call
        page = params['page']
        per_page = min(params['per_page'], 100)  # Max 100 items per request
        offset = (page - 1) * per_page
        
        types_str = request.args.get('types', '')
        achievement_types = [t.strip() for t in types_str.split(',')] if types_str else None
        
        feed_items, total_count = get_peer_feed_for_student(
            student_id=student['id'],
            limit=per_page,
            offset=offset,
            achievement_types=achievement_types,
            institution_id=g.institution_id,
        )
        
        response = PaginationHelper.paginate(feed_items, total_count, page, per_page)
        return jsonify(response), 200
        
    except Exception as e:
        error_resp, status_code = create_error_response("SERVER_ERROR", str(e), 500)
        return jsonify(error_resp), status_code


@peer_learning_bp.route('/student/peer-achievements', methods=['GET'])
@token_required
def get_peer_achievements():
    """
    Get summary statistics of peer achievements (dashboard).
    
    Returns:
        {
            'total_achievements': 45,
            'placements': {'count': 8, 'companies': [...], 'avg_package': 4.2},
            'skills': {'count': 23, 'trending': [...]},
            'study_groups': {'active_count': 3, 'completed_count': 1}
        }
    """
    try:
        summary = get_peer_achievements_summary(0, institution_id=g.institution_id)
        return jsonify(summary), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@peer_learning_bp.route('/student/peer-skills', methods=['GET'])
@token_required
def get_trending_skills_endpoint():
    """
    Get trending skills across campus.
    
    Returns:
        [
            {
                'skill_name': 'Python',
                'student_count': 28,
                'avg_proficiency': 3.2,
                'recommendation_count': 12
            },
            ...
        ]
    """
    try:
        limit = request.args.get('limit', 5, type=int)
        skills = get_trending_skills(limit, institution_id=g.institution_id)
        return jsonify({'success': True, 'trending_skills': skills}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@peer_learning_bp.route('/student/peer-preferences', methods=['GET'])
@token_required
def get_prefs():
    """
    Get student's peer feed privacy preferences.
    """
    try:
        student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
        if not student:
            return jsonify({"error": "Student profile not found"}), 404
        
        prefs = get_peer_preferences(student['id'])
        if not prefs:
            return jsonify({'error': 'Preferences not found'}), 404
        
        return jsonify(prefs), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@peer_learning_bp.route('/student/peer-preferences', methods=['POST'])
@token_required
def update_prefs():
    """
    Update student's peer feed privacy preferences.
    
    Request Body:
        {
            'show_placements': bool,
            'show_skills': bool,
            'show_study_groups': bool,
            'anonymous_mode': bool,
            'email_on_peer_achievement': bool,
            'email_on_study_group_invite': bool
        }
    """
    try:
        student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
        if not student:
            return jsonify({"error": "Student profile not found"}), 404
        
        data = request.get_json() or {}
        
        success = update_peer_preferences(
            student_id=student['id'],
            show_placements=data.get('show_placements'),
            show_skills=data.get('show_skills'),
            show_study_groups=data.get('show_study_groups'),
            anonymous_mode=data.get('anonymous_mode'),
            email_on_peer_achievement=data.get('email_on_peer_achievement'),
            email_on_study_group_invite=data.get('email_on_study_group_invite')
        )
        
        if success:
            return jsonify({'success': True, 'message': 'Preferences updated'}), 200
        else:
            return jsonify({'error': 'Failed to update preferences'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@peer_learning_bp.route('/student/peer-skills/add', methods=['POST'])
@token_required
def add_skill():
    """
    Add/update a skill for the student.
    
    Request Body:
        {
            'skill_name': 'Python',
            'proficiency_level': 3,
            'shared': true,
            'resource_link': 'https://...'
        }
    """
    try:
        student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
        if not student:
            return jsonify({"error": "Student profile not found"}), 404
        
        data = request.get_json() or {}
        
        if not data.get('skill_name'):
            return jsonify({'error': 'skill_name is required'}), 400
        
        skill_id = add_peer_skill(
            student_id=student['id'],
            skill_name=data['skill_name'],
            proficiency_level=data.get('proficiency_level', 1),
            shared=data.get('shared', False),
            resource_link=data.get('resource_link')
        )
        
        if skill_id:
            return jsonify({
                'success': True,
                'skill_id': skill_id,
                'message': 'Skill added/updated'
            }), 201
        else:
            return jsonify({'error': 'Failed to add skill'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@peer_learning_bp.route('/student/study-groups', methods=['GET'])
@token_required
def get_my_study_groups():
    """
    Get all study groups the student is member of.
    """
    try:
        student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
        if not student:
            return jsonify({"error": "Student profile not found"}), 404
        
        groups = get_student_study_groups(student['id'])
        return jsonify({
            'success': True,
            'study_groups': groups,
            'count': len(groups)
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@peer_learning_bp.route('/student/study-groups/create', methods=['POST'])
@token_required
def create_group():
    """
    Create a new study group.
    
    Request Body:
        {
            'name': 'AWS Certification Squad',
            'description': 'Preparing for AWS Solutions Architect exam',
            'goal': 'AWS Certification by Sept 30',
            'target_date': '2024-09-30',
            'max_members': 4
        }
    """
    try:
        student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
        if not student:
            return jsonify({"error": "Student profile not found"}), 404
        
        data = request.get_json() or {}
        
        required_fields = ['name', 'description', 'goal']
        if not all(data.get(field) for field in required_fields):
            return jsonify({'error': f'Required fields: {", ".join(required_fields)}'}), 400
        
        group_id = create_study_group(
            created_by=student['id'],
            name=data['name'],
            description=data['description'],
            goal=data['goal'],
            target_date=data.get('target_date'),
            max_members=data.get('max_members', 4)
        )
        
        if group_id:
            return jsonify({
                'success': True,
                'group_id': group_id,
                'message': 'Study group created'
            }), 201
        else:
            return jsonify({'error': 'Failed to create study group'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@peer_learning_bp.route('/student/study-groups/<int:group_id>/join', methods=['POST'])
@token_required
def join_group(group_id):
    """
    Join an existing study group.
    
    Path Parameter:
        - group_id: ID of the study group
    """
    try:
        student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
        if not student:
            return jsonify({"error": "Student profile not found"}), 404
        
        success = join_study_group(group_id, student['id'], institution_id=g.institution_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Joined study group'
            }), 200
        else:
            return jsonify({'error': 'Failed to join study group (full or not found)'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
