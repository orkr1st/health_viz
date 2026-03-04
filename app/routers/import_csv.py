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
from app.models import ImportBatch
from app.logging_config import get_import_logger
from app.parsers import (
    generic_csv,
    samsung_blood_pressure,
    samsung_steps,
    samsung_weight,
)
from app.schemas import ImportResult

router = APIRouter(prefix="/api/import", tags=["import"])

MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB

# Map filename prefix → parser module
# Both namespace variants (shealth / health) included for cross-version compatibility
PARSER_MAP = {
    # Blood pressure
    "com.samsung.shealth.blood_pressure":   samsung_blood_pressure,
    "com.samsung.health.blood_pressure":    samsung_blood_pressure,
    # Weight
    "com.samsung.health.weight":            samsung_weight,
    "com.samsung.shealth.weight":           samsung_weight,
    # Steps
    "com.samsung.shealth.step_daily_trend": samsung_steps,
    "com.samsung.health.step_daily_trend":  samsung_steps,
}


def _dispatch(filename: str, file_bytes: bytes, db: Session, user_id: int) -> ImportResult | None:
    """Try Samsung parsers first (by filename prefix), then generic CSV (by column detection)."""
    base = filename.rsplit("/", 1)[-1]  # strip directory path from ZIP entries

    # Resolve Samsung parser (if any) before touching the DB
    matched_parser = None
    for prefix, parser in PARSER_MAP.items():
        if base.startswith(prefix):
            matched_parser = parser
            break

    # Samsung file with no known parser → skip entirely, no batch row created
    if matched_parser is None and base.startswith("com.samsung."):
        log = get_import_logger()
        log.info("[IMPORT] skipped unrecognised Samsung file: %s", base)
        return None

    # Create an ImportBatch row so we can track which file each record came from
    batch = ImportBatch(user_id=user_id, filename=base)
    db.add(batch)
    db.commit()
    db.refresh(batch)

    if matched_parser is not None:
        result = matched_parser.parse(io.BytesIO(file_bytes), base, db, user_id, import_batch_id=batch.id)
    else:
        result = generic_csv.detect_and_parse(io.BytesIO(file_bytes), base, db, user_id, import_batch_id=batch.id)

    if result is None:
        # No parser matched — remove the batch row
        db.delete(batch)
        db.commit()
        return None

    # Update batch counts
    if result.metric == "blood_pressure":
        batch.bp_count = result.inserted
    elif result.metric == "weight":
        batch.weight_count = result.inserted
    elif result.metric == "steps":
        batch.steps_count = result.inserted

    # If nothing was inserted (all skipped/errors), remove the empty batch
    if result.inserted == 0:
        db.delete(batch)
    db.commit()

    return result


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
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload exceeds 2 GB limit")
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
