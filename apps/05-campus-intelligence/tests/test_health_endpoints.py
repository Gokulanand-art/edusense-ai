from contextlib import contextmanager


@contextmanager
def _fake_db_connection():
    yield object()


def test_health_ready_includes_runtime_metadata(client, monkeypatch):
    import app as app_module
    import database

    monkeypatch.setattr(database, "get_db_connection", _fake_db_connection)
    monkeypatch.setattr(app_module, "get_db_connection", _fake_db_connection)

    response = client.get("/health/ready")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "healthy"
    assert payload["database"] == "connected"
    assert "runtime" in payload
    assert "python" in payload["runtime"]
    assert response.headers["X-Request-Id"]
    assert response.headers["X-App-Name"] == "Smart Campus Intelligence System"


def test_health_startup_exposes_release_metadata(client):
    response = client.get("/health/startup")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ready"
    assert "release_version" in payload
