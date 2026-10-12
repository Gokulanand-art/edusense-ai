from contextlib import contextmanager


class NoticeCursor:
    def __init__(self):
        self.executed = []

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def fetchall(self):
        return [
            (
                1,
                "Placement Drive",
                "Profiles due Friday.",
                "Student",
                None,
                "Dr. Sarah Smith",
                "Faculty",
            )
        ]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


class NoticeConnection:
    def __init__(self, cursor):
        self.cursor_obj = cursor

    def cursor(self):
        return self.cursor_obj


@contextmanager
def notice_connection(cursor):
    yield NoticeConnection(cursor)


def test_get_notices_joins_roles_table(monkeypatch):
    import services.notice_board_service as notice_service

    cursor = NoticeCursor()
    monkeypatch.setattr(
        notice_service,
        "get_db_connection",
        lambda: notice_connection(cursor),
    )

    notices = notice_service.NoticeBoardService.get_notices(target_roles=["Student", "All"])

    query = cursor.executed[0][0]
    assert "LEFT JOIN roles r ON u.role_id = r.id" in query
    assert "u.role," not in query
    assert notices[0]["author_role"] == "Faculty"
