from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/v1/deduplicate", tags=["deduplicate"])


class DeduplicatePreview(BaseModel):
    blood_pressure: List[schemas.BloodPressureRead]
    weight: List[schemas.WeightRead]
    steps: List[schemas.StepsRead]


class DeduplicateResult(BaseModel):
    blood_pressure: int
    weight: int
    steps: int


def _bp_keep(uid):
    return (
        select(func.min(models.BloodPressure.id))
        .where(models.BloodPressure.user_id == uid)
        .group_by(
            models.BloodPressure.systolic,
            models.BloodPressure.diastolic,
            models.BloodPressure.pulse,
            func.date(models.BloodPressure.measured_at),
        )
    )


def _w_keep(uid):
    return (
        select(func.min(models.Weight.id))
        .where(models.Weight.user_id == uid)
        .group_by(
            models.Weight.value_kg,
            func.date(models.Weight.measured_at),
        )
    )


def _s_keep(uid):
    return (
        select(func.min(models.Steps.id))
        .where(models.Steps.user_id == uid)
        .group_by(models.Steps.step_date)
    )


@router.get("", response_model=DeduplicatePreview)
def preview_duplicates(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the records that would be deleted without making any changes."""
    uid = current_user.id
    bp_dups = (
        db.query(models.BloodPressure)
        .filter(
            models.BloodPressure.user_id == uid,
            models.BloodPressure.id.notin_(_bp_keep(uid)),
        )
        .all()
    )
    w_dups = (
        db.query(models.Weight)
        .filter(
            models.Weight.user_id == uid,
            models.Weight.id.notin_(_w_keep(uid)),
        )
        .all()
    )
    s_dups = (
        db.query(models.Steps)
        .filter(
            models.Steps.user_id == uid,
            models.Steps.id.notin_(_s_keep(uid)),
        )
        .all()
    )
    return DeduplicatePreview(blood_pressure=bp_dups, weight=w_dups, steps=s_dups)


@router.post("", response_model=DeduplicateResult)
def deduplicate(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete duplicate records, keeping the earliest entry per group."""
    uid = current_user.id

    bp_deleted = (
        db.query(models.BloodPressure)
        .filter(
            models.BloodPressure.user_id == uid,
            models.BloodPressure.id.notin_(_bp_keep(uid)),
        )
        .delete(synchronize_session=False)
    )
    db.commit()

    w_deleted = (
        db.query(models.Weight)
        .filter(
            models.Weight.user_id == uid,
            models.Weight.id.notin_(_w_keep(uid)),
        )
        .delete(synchronize_session=False)
    )
    db.commit()

    s_deleted = (
        db.query(models.Steps)
        .filter(
            models.Steps.user_id == uid,
            models.Steps.id.notin_(_s_keep(uid)),
        )
        .delete(synchronize_session=False)
    )
    db.commit()

    return DeduplicateResult(
        blood_pressure=bp_deleted,
        weight=w_deleted,
        steps=s_deleted,
    )
