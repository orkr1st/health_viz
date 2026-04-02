import io
import uuid
import zipfile
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app import models
from app.auth import get_current_user
from app.database import SessionLocal, get_db
from app.models import ImportBatch
from app.logging_config import get_import_logger
from app.parsers import (
    generic_csv,
    samsung_blood_pressure,
    samsung_steps,
    samsung_weight,
)
from app.schemas import ImportJobStatus, ImportResult

router = APIRouter(prefix="/api/v1/import", tags=["import"])

MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB
ASYNC_THRESHOLD  = 5 * 1024 * 1024          # 5 MB — files above this are processed async

# In-process job store: {job_id: {"status": str, "results": list|None, "error": str|None, "user_id": int}}
_jobs: dict = {}

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


def _process_content(content: bytes, filename: str, db: Session, user_id: int) -> List[ImportResult]:
    """Core import logic shared by synchronous and background paths."""
    log = get_import_logger()
    results: List[ImportResult] = []
    log.info("=== Import started: %s (%d bytes) ===", filename, len(content))

    if filename.lower().endswith(".zip"):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                for entry in zf.namelist():
                    if entry.endswith(".csv"):
                        file_bytes = zf.read(entry)
                        result = _dispatch(entry, file_bytes, db, user_id)
                        if result:
                            _log_result(result)
                            results.append(result)
        except zipfile.BadZipFile:
            log.error("Invalid ZIP file: %s", filename)
            raise HTTPException(status_code=400, detail="Invalid ZIP file")
    elif filename.lower().endswith(".csv"):
        result = _dispatch(filename, content, db, user_id)
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
        raise HTTPException(status_code=400, detail="Only .zip or .csv files are accepted")

    if not results:
        msg = "No recognisable CSV files found in upload (Samsung Health or plain CSV format)"
        log.warning(msg)
        results = [ImportResult(filename=filename, metric="none",
                                inserted=0, skipped=0, errors=0, error_messages=[msg])]

    log.info("=== Import finished: %d file(s) processed ===", len(results))
    return results


def _run_import_job(job_id: str, content: bytes, filename: str, user_id: int) -> None:
    """Background task: runs the import and updates the job store."""
    _jobs[job_id]["status"] = "running"
    db = SessionLocal()
    try:
        results = _process_content(content, filename, db, user_id)
        _jobs[job_id]["status"]  = "done"
        _jobs[job_id]["results"] = [r.model_dump() for r in results]
    except Exception as exc:
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"]  = str(exc)
    finally:
        db.close()


@router.post("", response_model=List[ImportResult], status_code=200)
async def import_data(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from fastapi.responses import JSONResponse

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload exceeds 2 GB limit")
    filename = file.filename or "upload"

    if len(content) > ASYNC_THRESHOLD:
        job_id = str(uuid.uuid4())
        _jobs[job_id] = {"status": "pending", "results": None, "error": None, "user_id": current_user.id}
        background_tasks.add_task(_run_import_job, job_id, content, filename, current_user.id)
        return JSONResponse(status_code=202, content={"job_id": job_id})

    return _process_content(content, filename, db, current_user.id)


@router.get("/status/{job_id}", response_model=ImportJobStatus)
def get_import_status(
    job_id: str,
    current_user: models.User = Depends(get_current_user),
):
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your job")
    results = None
    if job["results"] is not None:
        results = [ImportResult(**r) for r in job["results"]]
    return ImportJobStatus(
        job_id=job_id,
        status=job["status"],
        results=results,
        error=job.get("error"),
    )


@router.get("/log", response_class=PlainTextResponse)
def get_import_log(
    lines: int = 200,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return the last N import batches for the current user as plain text."""
    batches = (
        db.query(models.ImportBatch)
        .filter_by(user_id=current_user.id)
        .order_by(models.ImportBatch.imported_at.desc())
        .limit(lines)
        .all()
    )
    if not batches:
        return "No imports yet."
    rows = [
        f"{b.imported_at} | {b.filename} | bp={b.bp_count} weight={b.weight_count} steps={b.steps_count}"
        for b in batches
    ]
    return "\n".join(rows)
