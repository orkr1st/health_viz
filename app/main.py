from dotenv import load_dotenv
load_dotenv()

import logging
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.database import Base, engine
from app.logging_config import setup_logging
from app.routers import blood_pressure, weight, steps, import_csv, deduplicate
from app.routers import auth as auth_router
from app.routers import imports as imports_router
from app.routers import export as export_router

# Create all tables and set up logging on startup
Base.metadata.create_all(bind=engine)
setup_logging()
_log = logging.getLogger(__name__)

# Migrations: add new columns and indices if not already present
with engine.connect() as conn:
    # ── user table ──────────────────────────────────────────────────────────────
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS "user" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(150) NOT NULL UNIQUE,
            hashed_password VARCHAR(255) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT (CURRENT_TIMESTAMP)
        )
    """))
    conn.commit()

    # ── user_id columns on data tables ──────────────────────────────────────────
    for table in ("blood_pressure", "weight", "steps"):
        cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()]
        if "user_id" not in cols:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES \"user\"(id)"))
            conn.commit()

    # ── distance_m column on steps (legacy migration) ───────────────────────────
    cols = [row[1] for row in conn.execute(text("PRAGMA table_info(steps)")).fetchall()]
    if "distance_m" not in cols:
        conn.execute(text("ALTER TABLE steps ADD COLUMN distance_m REAL"))
        conn.commit()

    # ── notes column on steps ────────────────────────────────────────────────────
    try:
        conn.execute(text("ALTER TABLE steps ADD COLUMN notes TEXT"))
        conn.commit()
    except Exception as e:
        if "duplicate column name" not in str(e).lower():
            _log.warning("Migration warning (notes on steps): %s", e)

    # ── avatar_url column on user ────────────────────────────────────────────────
    try:
        conn.execute(text("ALTER TABLE \"user\" ADD COLUMN avatar_url VARCHAR(500)"))
        conn.commit()
    except Exception as e:
        if "duplicate column name" not in str(e).lower():
            _log.warning("Migration warning (avatar_url): %s", e)

    # ── weight_goal column on user ───────────────────────────────────────────────
    try:
        conn.execute(text("ALTER TABLE \"user\" ADD COLUMN weight_goal REAL"))
        conn.commit()
    except Exception as e:
        if "duplicate column name" not in str(e).lower():
            _log.warning("Migration warning (weight_goal): %s", e)

    # ── Drop old single-column unique indices (conflict with user-scoped ones) ──
    for idx_name in ("uq_bp_measured_at", "uq_weight_measured_at", "uq_steps_step_date"):
        try:
            conn.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))
        except Exception as e:
            _log.warning("Migration warning (drop index %s): %s", idx_name, e)
    conn.commit()

    # ── Create user-scoped unique indices ────────────────────────────────────────
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_bp_user_time "
        "ON blood_pressure(user_id, measured_at)"
    ))
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_weight_user_time "
        "ON weight(user_id, measured_at)"
    ))
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_steps_user_date "
        "ON steps(user_id, step_date)"
    ))
    conn.commit()

    # ── import_batch table ───────────────────────────────────────────────────────
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS import_batch (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES "user"(id),
            filename     TEXT    NOT NULL,
            imported_at  DATETIME DEFAULT (CURRENT_TIMESTAMP),
            bp_count     INTEGER DEFAULT 0,
            weight_count INTEGER DEFAULT 0,
            steps_count  INTEGER DEFAULT 0
        )
    """))
    conn.commit()

    # ── import_batch_id columns on data tables ───────────────────────────────────
    for tbl in ("blood_pressure", "weight", "steps"):
        try:
            conn.execute(text(
                f'ALTER TABLE "{tbl}" ADD COLUMN import_batch_id INTEGER REFERENCES import_batch(id)'
            ))
            conn.commit()
        except Exception as e:
            if "duplicate column name" not in str(e).lower():
                _log.warning("Migration warning (import_batch_id on %s): %s", tbl, e)

os.makedirs("static/avatars", exist_ok=True)

app = FastAPI(title="Health Tracker", version="1.0.0")

# API routers
app.include_router(auth_router.router)
app.include_router(blood_pressure.router)
app.include_router(weight.router)
app.include_router(steps.router)
app.include_router(import_csv.router)
app.include_router(deduplicate.router)
app.include_router(imports_router.router)
app.include_router(export_router.router)

# Serve static files (SPA) — must come last so API routes take priority
app.mount("/", StaticFiles(directory="static", html=True), name="static")
