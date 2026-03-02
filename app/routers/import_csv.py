import io
import zipfile
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app import models
from app.auth import get_current_user
from app.database import get_db
from app.logging_config import get_import_logger
from app.parsers import (
    generic_csv,
    samsung_blood_pressure,
    samsung_steps,
    samsung_weight,
)
from app.schemas import ImportResult

router = APIRouter(prefix="/api/import", tags=["import"])

# Map filename prefix → parser module
# Prefixes confirmed against real Samsung Health ZIP export (2026-02)
PARSER_MAP = {
    "com.samsung.shealth.blood_pressure": samsung_blood_pressure,
    "com.samsung.health.weight": samsung_weight,
    "com.samsung.shealth.step_daily_trend": samsung_steps,
}


def _dispatch(filename: str, file_bytes: bytes, db: Session, user_id: int) -> ImportResult | None:
    """Try Samsung parsers first (by filename prefix), then generic CSV (by column detection)."""
    base = filename.rsplit("/", 1)[-1]  # strip directory path from ZIP entries
    for prefix, parser in PARSER_MAP.items():
        if base.startswith(prefix):
            return parser.parse(io.BytesIO(file_bytes), base, db, user_id)
    return generic_csv.detect_and_parse(io.BytesIO(file_bytes), base, db, user_id)


def _log_result(result: ImportResult) -> None:
    log = get_import_logger()
    log.info(
        "[IMPORT] file=%s metric=%s inserted=%d skipped=%d errors=%d",
        result.filename, result.metric, result.inserted, result.skipped, result.errors,
    )
    for msg in result.error_messages:
        log.warning("  %s", msg)


@router.post("", response_model=List[ImportResult])
async def import_data(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    log = get_import_logger()
    content = await file.read()
    filename = file.filename or "upload"
    results: List[ImportResult] = []

    log.info("=== Import started: %s (%d bytes) ===", filename, len(content))

    if filename.lower().endswith(".zip"):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                for entry in zf.namelist():
                    if entry.endswith(".csv"):
                        file_bytes = zf.read(entry)
                        result = _dispatch(entry, file_bytes, db, current_user.id)
                        if result:
                            _log_result(result)
                            results.append(result)
        except zipfile.BadZipFile:
            log.error("Invalid ZIP file: %s", filename)
            raise HTTPException(status_code=400, detail="Invalid ZIP file")
    elif filename.lower().endswith(".csv"):
        result = _dispatch(filename, content, db, current_user.id)
        if result:
            _log_result(result)
            results.append(result)
        else:
            log.error("No parser found for: %s", filename)
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Could not detect metric in '{filename}'. "
                    "For Samsung exports the filename must start with one of: "
                    + ", ".join(PARSER_MAP.keys())
                    + ". For plain CSV files the header must contain "
                    "'systolic'+'diastolic' (blood pressure), "
                    "'value_kg' (weight), or 'step_count'+'step_date' (steps)."
                ),
            )
    else:
        raise HTTPException(
            status_code=400, detail="Only .zip or .csv files are accepted"
        )

    if not results:
        msg = "No recognisable CSV files found in upload (Samsung Health or plain CSV format)"
        log.warning(msg)
        return [
            ImportResult(
                filename=filename,
                metric="none",
                inserted=0,
                skipped=0,
                errors=0,
                error_messages=[msg],
            )
        ]

    log.info("=== Import finished: %d file(s) processed ===", len(results))
    return results


@router.get("/log", response_class=PlainTextResponse)
def get_import_log(
    lines: int = 200,
    current_user: models.User = Depends(get_current_user),
):
    """Return the last N lines of the import log file."""
    from app.logging_config import LOG_FILE
    log_path = Path(LOG_FILE)
    if not log_path.exists():
        return "No log file yet."
    text = log_path.read_text(encoding="utf-8")
    all_lines = text.splitlines()
    tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
    return "\n".join(tail)
