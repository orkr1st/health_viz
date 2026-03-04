from typing import Any, Callable, List
import pandas as pd
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.schemas import ImportResult


def read_samsung_csv(f) -> pd.DataFrame:
    """Read a Samsung Health CSV, skipping the comment row and stripping package prefixes."""
    df = pd.read_csv(f, skiprows=1)
    df.columns = [col.rsplit(".", 1)[-1] for col in df.columns]
    from app.logging_config import get_import_logger
    get_import_logger().debug("  columns: %s", list(df.columns))
    return df


def save_records(
    db: Session,
    df: pd.DataFrame,
    filename: str,
    metric: str,
    row_to_record: Callable[[pd.Series, int], Any],
    exists_check: Callable[[Session, pd.Series, int], bool],
    user_id: int,
    import_batch_id: int | None = None,
) -> ImportResult:
    """
    Iterate df rows, skip duplicates, insert new records.

    Args:
        row_to_record: converts a row and user_id to an ORM model instance (or raises)
        exists_check:  returns True if the record already exists in DB for this user
        user_id:       the authenticated user's id
    """
    inserted = 0
    skipped = 0
    errors = 0
    error_messages: List[str] = []

    for idx, row in df.iterrows():
        try:
            if exists_check(db, row, user_id):
                skipped += 1
                continue
            record = row_to_record(row, user_id)
            if import_batch_id is not None:
                record.import_batch_id = import_batch_id
            db.add(record)
            db.commit()
            inserted += 1
        except IntegrityError:
            db.rollback()
            skipped += 1
        except Exception as exc:
            db.rollback()
            errors += 1
            error_messages.append(f"Row {idx}: {exc}")

    return ImportResult(
        filename=filename,
        metric=metric,
        inserted=inserted,
        skipped=skipped,
        errors=errors,
        error_messages=error_messages,
    )
