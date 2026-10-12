import logging
from datetime import datetime
from contextlib import nullcontext
from database import get_db_connection

logger = logging.getLogger(__name__)

class NoticeBoardService:
    @staticmethod
    def ensure_notices_table(connection=None):
        try:
            context = nullcontext(connection) if connection is not None else get_db_connection()
            with context as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS notices (
                            id SERIAL PRIMARY KEY,
                            title VARCHAR(255) NOT NULL,
                            content TEXT NOT NULL,
                            target_role VARCHAR(50) NOT NULL,
                            author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                            institution_id INTEGER,
                            is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
                            publish_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            expires_at TIMESTAMP NULL,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    cur.execute("ALTER TABLE notices ADD COLUMN IF NOT EXISTS institution_id INTEGER")
                    cur.execute("ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE")
                    cur.execute("ALTER TABLE notices ADD COLUMN IF NOT EXISTS publish_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
                    cur.execute("ALTER TABLE notices ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL")
            logger.info("Notices table ensured")
        except Exception as e:
            logger.error(f"Error ensuring notices table: {e}")
            raise

    @staticmethod
    def create_notice(
        title: str,
        content: str,
        target_role: str,
        author_id: int,
        institution_id: int | None,
        *,
        is_pinned: bool = False,
        publish_at=None,
        expires_at=None,
    ):
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO notices (
                            title, content, target_role, author_id, institution_id, is_pinned, publish_at, expires_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s, CURRENT_TIMESTAMP), %s)
                        RETURNING id
                    """, (title, content, target_role, author_id, institution_id, is_pinned, publish_at, expires_at))
                    notice_id = cur.fetchone()[0]
            return notice_id
        except Exception as e:
            logger.error(f"Error creating notice: {e}")
            return None

    @staticmethod
    def get_notices(target_roles=None, author_id=None, institution_id=None):
        try:
            query = """
                SELECT n.id, n.title, n.content, n.target_role, n.created_at, u.name, r.role_name
                    , COALESCE(n.is_pinned, FALSE), n.publish_at, n.expires_at
                FROM notices n
                JOIN users u ON n.author_id = u.id
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE 1=1
            """
            params = []

            if institution_id is not None:
                query += " AND n.institution_id = %s"
                params.append(institution_id)

            query += " AND COALESCE(n.publish_at, n.created_at) <= CURRENT_TIMESTAMP"
            query += " AND (n.expires_at IS NULL OR n.expires_at > CURRENT_TIMESTAMP)"
            
            if target_roles:
                query += " AND (n.target_role = ANY(%s)"
                params.append(target_roles)
                if author_id:
                    query += " OR n.author_id = %s)"
                    params.append(author_id)
                else:
                    query += ")"
            elif author_id:
                query += " AND n.author_id = %s"
                params.append(author_id)
                
            query += " ORDER BY COALESCE(n.is_pinned, FALSE) DESC, COALESCE(n.publish_at, n.created_at) DESC, n.created_at DESC"
            
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    rows = cur.fetchall()
            
            notices = []
            for row in rows:
                is_pinned = row[7] if len(row) > 7 else False
                publish_at = row[8] if len(row) > 8 else None
                expires_at = row[9] if len(row) > 9 else None
                notices.append({
                    "id": row[0],
                    "title": row[1],
                    "content": row[2],
                    "target_role": row[3],
                    "created_at": row[4].strftime("%Y-%m-%d %H:%M:%S") if row[4] else "",
                    "author_name": row[5],
                    "author_role": row[6],
                    "is_pinned": is_pinned,
                    "publish_at": publish_at.strftime("%Y-%m-%d %H:%M:%S") if publish_at else "",
                    "expires_at": expires_at.strftime("%Y-%m-%d %H:%M:%S") if expires_at else "",
                })
            return notices
        except Exception as e:
            logger.error(f"Error getting notices: {e}")
            return []

    @staticmethod
    def delete_notice(notice_id: int, institution_id=None):
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    if institution_id is None:
                        cur.execute("DELETE FROM notices WHERE id = %s", (notice_id,))
                    else:
                        cur.execute("DELETE FROM notices WHERE id = %s AND institution_id = %s", (notice_id, institution_id))
            return True
        except Exception as e:
            logger.error(f"Error deleting notice: {e}")
            return False
