from datetime import datetime
import pandas as pd
from sqlalchemy.orm import Session
from app import models
from app.parsers.base import save_records
from app.schemas import ImportResult

# Samsung shealth.blood_pressure CSV column mapping (confirmed against real export).
# Data rows have one extra trailing field (trailing comma) causing N+1 fields vs N
# header columns. Reading with index_col=False gives the natural alignment:
#   systolic        → systolic (mmHg)
#   diastolic       → diastolic (mmHg)
#   pulse           → pulse (bpm, optional)
#   update_time → measurement timestamp


def _parse_dt(value: str) -> datetime:
    for fmt in ("%Y-%m-%d %H:%M:%S.%f%z", "%Y-%m-%d %H:%M:%S%z",
                "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.strptime(str(value).strip(), fmt)
            return dt.replace(tzinfo=None)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse datetime: {value!r}")


def parse(f, filename: str, db: Session, user_id: int) -> ImportResult:
    # index_col=False keeps natural column alignment (no implicit index inference)
    df = pd.read_csv(f, skiprows=1, index_col=False)
    df.columns = [col.rsplit(".", 1)[-1] for col in df.columns]
    from app.logging_config import get_import_logger
    get_import_logger().debug("  columns: %s", list(df.columns))

    df["_systolic"]    = pd.to_numeric(df["systolic"],        errors="coerce")
    df["_diastolic"]   = pd.to_numeric(df["diastolic"],        errors="coerce")
    df["_pulse"]       = pd.to_numeric(df["pulse"], errors="coerce")
    df["_measured_at"] = df["update_time"]

    # Keep only rows that have all required fields
    df = df.dropna(subset=["_systolic", "_diastolic", "_measured_at"]).copy()

    def row_to_record(row: pd.Series, uid: int) -> models.BloodPressure:
        return models.BloodPressure(
            user_id=uid,
            systolic=int(row["_systolic"]),
            diastolic=int(row["_diastolic"]),
            pulse=int(row["_pulse"]) if pd.notna(row["_pulse"]) else None,
            measured_at=_parse_dt(row["_measured_at"]),
        )

    def exists_check(db: Session, row: pd.Series, uid: int) -> bool:
        measured_at = _parse_dt(row["_measured_at"])
        return (
            db.query(models.BloodPressure)
            .filter(
                models.BloodPressure.user_id == uid,
                models.BloodPressure.measured_at == measured_at,
                models.BloodPressure.systolic == int(row["_systolic"]),
                models.BloodPressure.diastolic == int(row["_diastolic"]),
            )
            .first()
            is not None
        )

    return save_records(db, df, filename, "blood_pressure", row_to_record, exists_check, user_id)
