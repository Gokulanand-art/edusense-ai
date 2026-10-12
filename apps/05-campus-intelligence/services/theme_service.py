"""
Theme Service - Manage user theme preferences
Supports light and dark mode with persistence
"""

import logging
from typing import Any, Dict

from database import get_db_connection


logger = logging.getLogger(__name__)


class ThemeService:
    """Service for managing user theme preferences"""
    
    VALID_THEMES = ['light', 'dark']
    DEFAULT_THEME = 'light'
    
    @staticmethod
    def ensure_theme_table():
        """Create theme_preferences table if it doesn't exist"""
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS theme_preferences (
                            id SERIAL PRIMARY KEY,
                            user_id INTEGER UNIQUE NOT NULL,
                            theme VARCHAR(20) NOT NULL DEFAULT 'light',
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            CONSTRAINT fk_user_id FOREIGN KEY (user_id)
                                REFERENCES users(id) ON DELETE CASCADE
                        )
                    """)

                    # Create index on user_id for faster lookups
                    cursor.execute("""
                        CREATE INDEX IF NOT EXISTS idx_theme_user_id
                        ON theme_preferences(user_id)
                    """)
            return True
        except Exception as e:
            logger.exception("Theme table creation error")
            return False
    
    @staticmethod
    def get_user_theme(user_id: int) -> str:
        """
        Get user's theme preference
        
        Args:
            user_id: User ID
            
        Returns:
            Theme name ('light' or 'dark')
        """
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "SELECT theme FROM theme_preferences WHERE user_id = %s",
                        (user_id,)
                    )
                    result = cursor.fetchone()
            
            if result:
                return result[0]
            return ThemeService.DEFAULT_THEME
        except Exception as e:
            logger.exception("Error fetching user theme")
            return ThemeService.DEFAULT_THEME
    
    @staticmethod
    def set_user_theme(user_id: int, theme: str) -> bool:
        """
        Set user's theme preference
        
        Args:
            user_id: User ID
            theme: Theme name ('light' or 'dark')
            
        Returns:
            Success status
        """
        if theme not in ThemeService.VALID_THEMES:
            return False
        
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cursor:
                    # Use INSERT ... ON CONFLICT approach (PostgreSQL specific)
                    # If user exists, update; if not, insert
                    cursor.execute("""
                        INSERT INTO theme_preferences (user_id, theme, updated_at)
                        VALUES (%s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (user_id) DO UPDATE
                        SET theme = %s, updated_at = CURRENT_TIMESTAMP
                    """, (user_id, theme, theme))
            return True
        except Exception as e:
            logger.exception("Error setting user theme")
            return False
    
    @staticmethod
    def toggle_user_theme(user_id: int) -> Dict[str, Any]:
        """
        Toggle user's theme between light and dark
        
        Args:
            user_id: User ID
            
        Returns:
            Dict with new theme and success status
        """
        current_theme = ThemeService.get_user_theme(user_id)
        new_theme = 'dark' if current_theme == 'light' else 'light'
        
        success = ThemeService.set_user_theme(user_id, new_theme)
        
        return {
            'success': success,
            'theme': new_theme if success else current_theme,
            'previous_theme': current_theme
        }
    
    @staticmethod
    def initialize_user_theme(user_id: int, theme: str = DEFAULT_THEME) -> bool:
        """
        Initialize theme for new user
        
        Args:
            user_id: User ID
            theme: Initial theme (default: 'light')
            
        Returns:
            Success status
        """
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO theme_preferences (user_id, theme)
                        VALUES (%s, %s)
                        ON CONFLICT (user_id) DO NOTHING
                    """, (user_id, theme))
            return True
        except Exception as e:
            logger.exception("Error initializing user theme")
            return False
    
    @staticmethod
    def get_theme_stats() -> Dict[str, int]:
        """
        Get statistics on theme usage across users
        
        Returns:
            Dict with counts of light/dark theme users
        """
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT theme, COUNT(*) as count
                        FROM theme_preferences
                        GROUP BY theme
                    """)

                    results = cursor.fetchall()
            
            stats = {'light': 0, 'dark': 0}
            for theme, count in results:
                if theme in stats:
                    stats[theme] = count
            
            return stats
        except Exception as e:
            logger.exception("Error fetching theme stats")
            return {'light': 0, 'dark': 0}
