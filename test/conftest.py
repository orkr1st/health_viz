import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from pathlib import Path

from app.main import app
from app.database import Base, get_db

TEST_DIR = Path(__file__).parent

_IN_MEMORY_URL = "sqlite:///:memory:"
_CONNECT_ARGS = {"check_same_thread": False}


def _make_engine():
    """Create a shared-connection in-memory SQLite engine.

    StaticPool reuses one underlying connection so the in-memory database
    is visible to every session that the engine spawns.
    """
    return create_engine(
        _IN_MEMORY_URL,
        connect_args=_CONNECT_ARGS,
        poolclass=StaticPool,
    )


@pytest.fixture()
def db_session():
    """Bare in-memory session for parser unit tests."""
    engine = _make_engine()
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def client():
    engine = _make_engine()
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def auth(client):
    client.post("/api/v1/auth/register", json={"username": "tester", "password": "secret"})
    resp = client.post("/api/v1/auth/token", data={"username": "tester", "password": "secret"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
