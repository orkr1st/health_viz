from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.auth import get_current_user
from app.database import get_db
from app.schemas import ImportBatchRead

router = APIRouter(prefix="/api/v1/imports", tags=["imports"])


@router.get("", response_model=List[ImportBatchRead])
def list_imports(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.ImportBatch)
        .filter(models.ImportBatch.user_id == current_user.id)
        .order_by(models.ImportBatch.imported_at.desc())
        .all()
    )


@router.delete("/{batch_id}")
def delete_import(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    batch = (
        db.query(models.ImportBatch)
        .filter(
            models.ImportBatch.id == batch_id,
            models.ImportBatch.user_id == current_user.id,
        )
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    deleted_bp = (
        db.query(models.BloodPressure)
        .filter(
            models.BloodPressure.import_batch_id == batch_id,
            models.BloodPressure.user_id == current_user.id,
        )
        .delete()
    )
    deleted_weight = (
        db.query(models.Weight)
        .filter(
            models.Weight.import_batch_id == batch_id,
            models.Weight.user_id == current_user.id,
        )
        .delete()
    )
    deleted_steps = (
        db.query(models.Steps)
        .filter(
            models.Steps.import_batch_id == batch_id,
            models.Steps.user_id == current_user.id,
        )
        .delete()
    )

    db.delete(batch)
    db.commit()

    return {
        "deleted_bp": deleted_bp,
        "deleted_weight": deleted_weight,
        "deleted_steps": deleted_steps,
    }
