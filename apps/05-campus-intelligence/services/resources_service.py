import logging
from datetime import datetime
from contextlib import nullcontext
from database import get_db_connection

logger = logging.getLogger(__name__)

class ResourcesService:
    @staticmethod
    def ensure_resources_table(connection=None):
        try:
            context = nullcontext(connection) if connection is not None else get_db_connection()
            with context as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS study_resources (
                            id SERIAL PRIMARY KEY,
                            title VARCHAR(255) NOT NULL,
                            description TEXT,
                            resource_link VARCHAR(1000) NOT NULL,
                            subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
                            uploaded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
            logger.info("Resources table ensured")
        except Exception as e:
            logger.error(f"Error ensuring resources table: {e}")
            raise

    @staticmethod
    def add_resource(title: str, description: str, resource_link: str, subject_id: int, uploaded_by: int):
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO study_resources (title, description, resource_link, subject_id, uploaded_by)
                        VALUES (%s, %s, %s, %s, %s)
                        RETURNING id
                    """, (title, description, resource_link, subject_id, uploaded_by))
                    resource_id = cur.fetchone()[0]
            return resource_id
        except Exception as e:
            logger.error(f"Error adding resource: {e}")
            return None

    @staticmethod
    def get_resources(subject_id=None):
        try:
            query = """
                SELECT r.id, r.title, r.description, r.resource_link, r.created_at, 
                       s.name as subject_name, u.name as uploader_name
                FROM study_resources r
                LEFT JOIN subjects s ON r.subject_id = s.id
                JOIN users u ON r.uploaded_by = u.id
            """
            params = []
            
            if subject_id:
                query += " WHERE r.subject_id = %s"
                params.append(subject_id)
                
            query += " ORDER BY r.created_at DESC"
            
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    rows = cur.fetchall()
            
            resources = []
            for row in rows:
                resources.append({
                    "id": row[0],
                    "title": row[1],
                    "description": row[2],
                    "resource_link": row[3],
                    "created_at": row[4].strftime("%Y-%m-%d %H:%M:%S") if row[4] else "",
                    "subject_name": row[5] or "General",
                    "uploader_name": row[6]
                })
            return resources
        except Exception as e:
            logger.error(f"Error getting resources: {e}")
            return []

    @staticmethod
    def delete_resource(resource_id: int):
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM study_resources WHERE id = %s", (resource_id,))
            return True
        except Exception as e:
            logger.error(f"Error deleting resource: {e}")
            return False
