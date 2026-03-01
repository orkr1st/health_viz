from datetime import datetime
import pandas as pd
from sqlalchemy.orm import Session
from app import models
from app.parsers.base import save_records
from app.schemas import ImportResult

# Samsung health.weight CSV column mapping (confirmed against real export).
# Data rows have one extra trailing field (trailing comma) causing N+1 fields vs N
# header columns. Reading with index_col=False gives the natural alignment:
#   weight      → actual body weight (kg)
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

    df["weight"] = pd.to_numeric(df["weight"], errors="coerce")
    df = df.dropna(subset=["weight", "update_time"]).copy()

    def row_to_record(row: pd.Series, uid: int) -> models.Weight:
        return models.Weight(
            user_id=uid,
            value_kg=float(row["weight"]),  # actual body weight is in the "weight" column
            measured_at=_parse_dt(row["update_time"]),
        )

    def exists_check(db: Session, row: pd.Series, uid: int) -> bool:
        measured_at = _parse_dt(row["update_time"])
        return (
            db.query(models.Weight)
            .filter(
                models.Weight.user_id == uid,
                models.Weight.measured_at == measured_at,
            )
            .first()
            is not None
        )

    return save_records(db, df, filename, "weight", row_to_record, exists_check, user_id)
