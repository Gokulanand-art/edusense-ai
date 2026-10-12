"""
Theme Routes - API endpoints for theme management
"""

from flask import Blueprint, jsonify, request
from auth.auth_middleware import token_required
from auth.current_user import current_user
from services.theme_service import ThemeService

theme_bp = Blueprint('theme', __name__, url_prefix='/api/theme')


@theme_bp.route('/get-theme', methods=['GET'])
@token_required
def get_user_theme():
    """
    Get current user's theme preference
    
    Returns:
        JSON with theme name
    """
    try:
        user = current_user()
        user_id = user.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'User not found'}), 401
        
        theme = ThemeService.get_user_theme(user_id)
        
        return jsonify({
            'success': True,
            'theme': theme
        }), 200
    
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500


@theme_bp.route('/set-theme', methods=['POST'])
@token_required
def set_user_theme():
    """
    Set user's theme preference
    
    JSON payload:
        {
            "theme": "dark" | "light"
        }
    
    Returns:
        JSON with success status and new theme
    """
    try:
        user = current_user()
        user_id = user.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'User not found'}), 401
        
        data = request.get_json() or {}
        theme = data.get('theme', '').lower()
        
        if theme not in ['light', 'dark']:
            return jsonify({
                'error': 'Invalid theme. Must be "light" or "dark"'
            }), 400
        
        success = ThemeService.set_user_theme(user_id, theme)
        
        if success:
            return jsonify({
                'success': True,
                'theme': theme,
                'message': f'Theme changed to {theme}'
            }), 200
        else:
            return jsonify({
                'error': 'Failed to update theme'
            }), 500
    
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500


@theme_bp.route('/toggle-theme', methods=['POST'])
@token_required
def toggle_user_theme():
    """
    Toggle user's theme between light and dark
    
    Returns:
        JSON with new theme and previous theme
    """
    try:
        user = current_user()
        user_id = user.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'User not found'}), 401
        
        result = ThemeService.toggle_user_theme(user_id)
        
        return jsonify({
            'success': result['success'],
            'theme': result['theme'],
            'previous_theme': result['previous_theme'],
            'message': f'Theme toggled to {result["theme"]}'
        }), 200 if result['success'] else 500
    
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500


@theme_bp.route('/stats', methods=['GET'])
@token_required
def get_theme_stats():
    """
    Get theme usage statistics (admin only)
    
    Returns:
        JSON with light/dark theme user counts
    """
    try:
        user = current_user()
        role_id = user.get('role_id')
        
        # Only admins can view stats
        if role_id != 1:  # 1 = Admin role
            return jsonify({
                'error': 'Permission denied. Admin access required'
            }), 403
        
        stats = ThemeService.get_theme_stats()
        
        return jsonify({
            'success': True,
            'stats': stats,
            'total': stats['light'] + stats['dark']
        }), 200
    
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500
