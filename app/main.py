from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.database import Base, engine
from app.logging_config import setup_logging
from app.routers import blood_pressure, weight, steps, import_csv
from app.routers import auth as auth_router

# Create all tables and set up logging on startup
Base.metadata.create_all(bind=engine)
setup_logging()

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

    # ── Drop old single-column unique indices (conflict with user-scoped ones) ──
    for idx_name in ("uq_bp_measured_at", "uq_weight_measured_at", "uq_steps_step_date"):
        try:
            conn.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))
        except Exception:
            pass
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

app = FastAPI(title="Health Tracker", version="1.0.0")

# API routers
app.include_router(auth_router.router)
app.include_router(blood_pressure.router)
app.include_router(weight.router)
app.include_router(steps.router)
app.include_router(import_csv.router)

# Serve static files (SPA) — must come last so API routes take priority
app.mount("/", StaticFiles(directory="static", html=True), name="static")
