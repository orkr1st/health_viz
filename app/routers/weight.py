from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.auth import get_current_user
from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/v1/weight", tags=["weight"])


@router.get("", response_model=List[schemas.WeightRead])
def list_weight(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Weight)
        .filter(models.Weight.user_id == current_user.id)
        .order_by(models.Weight.measured_at.desc())
        .all()
    )


@router.post("", response_model=schemas.WeightRead, status_code=201)
def create_weight(
    body: schemas.WeightCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    record = models.Weight(**body.model_dump(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/{record_id}", response_model=schemas.WeightRead)
def get_weight(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    record = (
        db.query(models.Weight)
        .filter(models.Weight.id == record_id, models.Weight.user_id == current_user.id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.put("/{record_id}", response_model=schemas.WeightRead)
def update_weight(
    record_id: int,
    body: schemas.WeightUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    record = (
        db.query(models.Weight)
        .filter(models.Weight.id == record_id, models.Weight.user_id == current_user.id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{record_id}", status_code=204)
def delete_weight(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    record = (
        db.query(models.Weight)
        .filter(models.Weight.id == record_id, models.Weight.user_id == current_user.id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
