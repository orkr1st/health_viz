from datetime import datetime, timezone
import pandas as pd
from sqlalchemy.orm import Session
from app import models
from app.parsers.base import save_records
from app.schemas import ImportResult

# Samsung shealth.step_daily_trend CSV column mapping (confirmed against real export).
# Each data row ends with a trailing comma, giving N+1 fields vs N header columns.
# Reading with index_col=False prevents pandas from consuming the first field as
# a row index (which would shift all column assignments by one).
# With index_col=False the natural header names apply directly:
#   count    → actual step count  (e.g. 7625)
#   distance → actual distance in metres  (e.g. 5601.97)
#   day_time → epoch milliseconds UTC date  (e.g. 1480723200000)


def _epoch_ms_to_date(value) -> str:
    """Convert epoch milliseconds to YYYY-MM-DD (UTC)."""
    ms = int(float(value))
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d")


def parse(f, filename: str, db: Session, user_id: int) -> ImportResult:
    # index_col=False keeps natural column alignment (no implicit index inference)
    df = pd.read_csv(f, skiprows=1, index_col=False)
    df.columns = [col.rsplit(".", 1)[-1] for col in df.columns]
    from app.logging_config import get_import_logger
    get_import_logger().debug("  columns: %s", list(df.columns))

    df["_steps"]    = pd.to_numeric(df["count"],    errors="coerce")
    df["_distance"] = pd.to_numeric(df["distance"], errors="coerce")
    df["_epoch"]    = pd.to_numeric(df["day_time"], errors="coerce")

    # Keep only rows with both a valid step count and a valid epoch timestamp
    df = df.dropna(subset=["_steps", "_epoch"]).copy()
    df["_steps"] = df["_steps"].astype(int)
    df["_date"]  = df["_epoch"].apply(_epoch_ms_to_date)

    def row_to_record(row: pd.Series, uid: int) -> models.Steps:
        distance = float(row["_distance"]) if pd.notna(row.get("_distance")) else None
        return models.Steps(
            user_id=uid,
            step_date=row["_date"],
            step_count=int(row["_steps"]),
            distance_m=distance,
        )

    def exists_check(db: Session, row: pd.Series, uid: int) -> bool:
        return (
            db.query(models.Steps)
            .filter(
                models.Steps.user_id == uid,
                models.Steps.step_date == row["_date"],
            )
            .first()
            is not None
        )

    return save_records(db, df, filename, "steps", row_to_record, exists_check, user_id)
