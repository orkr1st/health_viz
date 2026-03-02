"""
Parser for plain CSV files (no Samsung prefix required).

Metric is detected from the header row:
  - 'systolic' + 'diastolic'  → blood_pressure
  - 'value_kg'                → weight
  - 'step_count' + 'step_date'→ steps

Expected columns:
  Blood pressure : measured_at, systolic, diastolic, [pulse], [notes]
  Weight         : measured_at, value_kg, [notes]
  Steps          : step_date, step_count, [distance_m]
"""

from datetime import datetime

import pandas as pd
from sqlalchemy.orm import Session

from app import models
from app.parsers.base import save_records
from app.schemas import ImportResult


def _parse_dt(value: str) -> datetime:
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(str(value).strip(), fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse datetime: {value!r}")


def _parse_blood_pressure(df: pd.DataFrame, filename: str, db: Session, user_id: int) -> ImportResult:
    df["_systolic"]  = pd.to_numeric(df["systolic"],  errors="coerce")
    df["_diastolic"] = pd.to_numeric(df["diastolic"], errors="coerce")
    df["_pulse"]     = pd.to_numeric(df["pulse"],     errors="coerce") if "pulse" in df.columns else pd.NA
    has_notes = "notes" in df.columns
    df = df.dropna(subset=["_systolic", "_diastolic", "measured_at"]).copy()

    def row_to_record(row: pd.Series, uid: int) -> models.BloodPressure:
        return models.BloodPressure(
            user_id=uid,
            systolic=int(row["_systolic"]),
            diastolic=int(row["_diastolic"]),
            pulse=int(row["_pulse"]) if pd.notna(row.get("_pulse")) else None,
            measured_at=_parse_dt(row["measured_at"]),
            notes=row["notes"] if has_notes and pd.notna(row.get("notes")) else None,
        )

    def exists_check(db: Session, row: pd.Series, uid: int) -> bool:
        measured_at = _parse_dt(row["measured_at"])
        return (
            db.query(models.BloodPressure)
            .filter(
                models.BloodPressure.user_id == uid,
                models.BloodPressure.measured_at == measured_at,
                models.BloodPressure.systolic == int(row["_systolic"]),
                models.BloodPressure.diastolic == int(row["_diastolic"]),
            )
            .first() is not None
        )

    return save_records(db, df, filename, "blood_pressure", row_to_record, exists_check, user_id)


def _parse_weight(df: pd.DataFrame, filename: str, db: Session, user_id: int) -> ImportResult:
    df["_value_kg"] = pd.to_numeric(df["value_kg"], errors="coerce")
    has_notes = "notes" in df.columns
    df = df.dropna(subset=["_value_kg", "measured_at"]).copy()

    def row_to_record(row: pd.Series, uid: int) -> models.Weight:
        return models.Weight(
            user_id=uid,
            value_kg=float(row["_value_kg"]),
            measured_at=_parse_dt(row["measured_at"]),
            notes=row["notes"] if has_notes and pd.notna(row.get("notes")) else None,
        )

    def exists_check(db: Session, row: pd.Series, uid: int) -> bool:
        measured_at = _parse_dt(row["measured_at"])
        return (
            db.query(models.Weight)
            .filter(
                models.Weight.user_id == uid,
                models.Weight.measured_at == measured_at,
            )
            .first() is not None
        )

    return save_records(db, df, filename, "weight", row_to_record, exists_check, user_id)


def _parse_steps(df: pd.DataFrame, filename: str, db: Session, user_id: int) -> ImportResult:
    df["_step_count"] = pd.to_numeric(df["step_count"], errors="coerce")
    df["_distance_m"] = pd.to_numeric(df["distance_m"], errors="coerce") if "distance_m" in df.columns else pd.NA
    df = df.dropna(subset=["_step_count", "step_date"]).copy()
    df["_step_count"] = df["_step_count"].astype(int)

    def row_to_record(row: pd.Series, uid: int) -> models.Steps:
        return models.Steps(
            user_id=uid,
            step_date=str(row["step_date"]).strip(),
            step_count=int(row["_step_count"]),
            distance_m=float(row["_distance_m"]) if pd.notna(row.get("_distance_m")) else None,
        )

    def exists_check(db: Session, row: pd.Series, uid: int) -> bool:
        return (
            db.query(models.Steps)
            .filter(
                models.Steps.user_id == uid,
                models.Steps.step_date == str(row["step_date"]).strip(),
            )
            .first() is not None
        )

    return save_records(db, df, filename, "steps", row_to_record, exists_check, user_id)


def detect_and_parse(f, filename: str, db: Session, user_id: int) -> ImportResult | None:
    """
    Read the CSV header and route to the appropriate metric parser.
    Returns None if no metric can be detected from the columns.
    """
    df = pd.read_csv(f, index_col=False)
    from app.logging_config import get_import_logger
    get_import_logger().debug("  generic CSV columns: %s", list(df.columns))

    cols = set(df.columns)
    if "systolic" in cols and "diastolic" in cols:
        return _parse_blood_pressure(df, filename, db, user_id)
    if "value_kg" in cols:
        return _parse_weight(df, filename, db, user_id)
    if "step_count" in cols and "step_date" in cols:
        return _parse_steps(df, filename, db, user_id)
    return None
