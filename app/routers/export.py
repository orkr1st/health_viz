import csv
import io
import zipfile
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app import models

router = APIRouter(prefix="/api/export", tags=["export"])


def _bp_csv(records) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["measured_at", "systolic", "diastolic", "pulse", "notes"])
    for r in records:
        w.writerow([r.measured_at, r.systolic, r.diastolic, r.pulse or "", r.notes or ""])
    return buf.getvalue()


def _weight_csv(records) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["measured_at", "value_kg", "notes"])
    for r in records:
        w.writerow([r.measured_at, r.value_kg, r.notes or ""])
    return buf.getvalue()


def _steps_csv(records) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["step_date", "step_count", "distance_m"])
    for r in records:
        w.writerow([r.step_date, r.step_count,
                    r.distance_m if r.distance_m is not None else ""])
    return buf.getvalue()


@router.get("")
def export_data(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    bp     = db.query(models.BloodPressure).filter_by(user_id=current_user.id)\
               .order_by(models.BloodPressure.measured_at).all()
    weight = db.query(models.Weight).filter_by(user_id=current_user.id)\
               .order_by(models.Weight.measured_at).all()
    steps  = db.query(models.Steps).filter_by(user_id=current_user.id)\
               .order_by(models.Steps.step_date).all()

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("blood_pressure.csv", _bp_csv(bp))
        zf.writestr("weight.csv",         _weight_csv(weight))
        zf.writestr("steps.csv",          _steps_csv(steps))
    zip_buf.seek(0)

    filename = f"health_export_{date.today()}.zip"
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
