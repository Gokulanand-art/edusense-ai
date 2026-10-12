from flask import Blueprint, jsonify, request, g
from auth.auth_middleware import role_required, token_required
from services.realtime_notification_service import RealtimeNotificationService
from database import get_db_connection
import logging

notification_bp = Blueprint("notification_bp", __name__)
logger = logging.getLogger(__name__)


@notification_bp.route("/api/notifications", methods=["GET"])
@token_required
def get_notifications():
    """
    Get user notifications with pagination and filtering
    
    Query params:
        - limit: Number of notifications (default 50)
        - offset: Pagination offset (default 0)
        - unread_only: Boolean to get only unread (default false)
        - type: Filter by notification type (optional)
    
    Returns:
        List of notifications with metadata
    """
    try:
        user_id = g.user_id
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        unread_only = request.args.get('unread_only', 'false').lower() == 'true'
        notification_type = request.args.get('type')

        limit = min(limit, 100)  # Max 100 per request

        notifications = RealtimeNotificationService.get_user_notifications(
            user_id,
            limit=limit,
            offset=offset,
            unread_only=unread_only,
            notification_type=notification_type
        )

        return jsonify({
            "status": "success",
            "notifications": notifications,
            "count": len(notifications),
            "limit": limit,
            "offset": offset
        }), 200

    except Exception as e:
        logger.error(f"Error getting notifications: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500


@notification_bp.route("/api/notifications/unread-count", methods=["GET"])
@token_required
def get_unread_count():
    """Get count of unread notifications"""
    try:
        user_id = g.user_id
        count = RealtimeNotificationService.get_unread_count(user_id)

        return jsonify({
            "status": "success",
            "unread_count": count
        }), 200

    except Exception as e:
        logger.error(f"Error getting unread count: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500


@notification_bp.route("/api/notifications/statistics", methods=["GET"])
@token_required
def get_notification_statistics():
    """Get notification statistics for user"""
    try:
        user_id = g.user_id
        stats = RealtimeNotificationService.get_notification_statistics(user_id)

        return jsonify({
            "status": "success",
            "statistics": stats
        }), 200

    except Exception as e:
        logger.error(f"Error getting notification statistics: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500


@notification_bp.route("/api/notifications/preferences", methods=["GET"])
@token_required
def get_notification_preferences():
    try:
        user_id = g.user_id
        preferences = RealtimeNotificationService.get_user_preferences(user_id)

        return jsonify({
            "status": "success",
            "preferences": preferences,
        }), 200

    except Exception as e:
        logger.error(f"Error getting notification preferences: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500


@notification_bp.route("/api/notifications/preferences", methods=["PUT"])
@token_required
def update_notification_preferences():
    try:
        user_id = g.user_id
        preferences = request.get_json() or {}
        saved = RealtimeNotificationService.save_user_preferences(user_id, preferences)

        return jsonify({
            "status": "success",
            "message": "Notification preferences updated",
            "preferences": saved,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Error updating notification preferences: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500


@notification_bp.route("/api/notifications/<int:notification_id>/read", methods=["PUT"])
@token_required
def mark_as_read(notification_id):
    """Mark a notification as read"""
    try:
        user_id = g.user_id

        success = RealtimeNotificationService.mark_as_read(notification_id, user_id)

        if success:
            return jsonify({
                "status": "success",
                "message": "Notification marked as read"
            }), 200
        else:
            return jsonify({
                "status": "error",
                "message": "Notification not found"
            }), 404

    except Exception as e:
        logger.error(f"Error marking notification as read: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500


@notification_bp.route("/api/notifications/mark-all-read", methods=["PUT"])
@token_required
def mark_all_as_read():
    """Mark all user notifications as read"""
    try:
        user_id = g.user_id

        count = RealtimeNotificationService.mark_all_as_read(user_id)

        return jsonify({
            "status": "success",
            "message": f"Marked {count} notifications as read",
            "count": count
        }), 200

    except Exception as e:
        logger.error(f"Error marking all as read: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500


@notification_bp.route("/api/notifications/<int:notification_id>", methods=["DELETE"])
@token_required
def delete_notification(notification_id):
    """Delete a notification"""
    try:
        user_id = g.user_id

        success = RealtimeNotificationService.delete_notification(notification_id, user_id)

        if success:
            return jsonify({
                "status": "success",
                "message": "Notification deleted"
            }), 200
        else:
            return jsonify({
                "status": "error",
                "message": "Notification not found"
            }), 404

    except Exception as e:
        logger.error(f"Error deleting notification: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500


@notification_bp.route("/api/notifications/clear-expired", methods=["DELETE"])
@token_required
@role_required("Admin")
def clear_expired():
    """Clear expired notifications (admin action, but available for cleanup)"""
    try:
        count = RealtimeNotificationService.clear_expired_notifications()

        return jsonify({
            "status": "success",
            "message": f"Cleared {count} expired notifications",
            "count": count
        }), 200

    except Exception as e:
        logger.error(f"Error clearing expired notifications: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500


@notification_bp.route("/api/notifications/poll", methods=["GET"])
@token_required
def poll_notifications():
    """
    Poll for new notifications (for real-time updates without WebSocket)
    
    Returns latest notifications only (created in last few minutes)
    """
    try:
        user_id = g.user_id
        minutes = request.args.get('minutes', 5, type=int)

        # Get recent unread notifications
        notifications = RealtimeNotificationService.get_user_notifications(
            user_id,
            limit=20,
            unread_only=True
        )

        unread_count = RealtimeNotificationService.get_unread_count(user_id)

        return jsonify({
            "status": "success",
            "notifications": notifications,
            "unread_count": unread_count,
            "new_count": len([n for n in notifications if not n['is_read']])
        }), 200

    except Exception as e:
        logger.error(f"Error polling notifications: {str(e)}")
        return jsonify({"error": "An internal error occurred"}), 500

