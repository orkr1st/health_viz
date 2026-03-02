import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import create_access_token, get_current_user, get_password_hash, verify_password
from app.database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserRead, status_code=201)
def register(body: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    user = models.User(
        username=body.username,
        hashed_password=get_password_hash(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/token", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserRead)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", response_model=schemas.UserRead)
def change_password(
    body: schemas.PasswordChange,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if len(body.new_password) < 1:
        raise HTTPException(status_code=400, detail="New password must not be empty.")
    current_user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/weight-goal", response_model=schemas.UserRead)
def update_weight_goal(
    body: schemas.WeightGoalUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.weight_goal = body.value_kg
    db.commit()
    db.refresh(current_user)
    return current_user


AVATAR_DIR = "static/avatars"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("/avatar", response_model=schemas.UserRead)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type.")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{current_user.id}.{ext}"
    path = os.path.join(AVATAR_DIR, filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    current_user.avatar_url = f"/avatars/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user
