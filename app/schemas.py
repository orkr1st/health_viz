from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


# Auth
class UserCreate(BaseModel):
    username: str
    password: str


class UserRead(BaseModel):
    id: int
    username: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


# Blood Pressure
class BloodPressureCreate(BaseModel):
    systolic: int
    diastolic: int
    pulse: Optional[int] = None
    measured_at: datetime
    notes: Optional[str] = None


class BloodPressureUpdate(BaseModel):
    systolic: Optional[int] = None
    diastolic: Optional[int] = None
    pulse: Optional[int] = None
    measured_at: Optional[datetime] = None
    notes: Optional[str] = None


class BloodPressureRead(BloodPressureCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# Weight
class WeightCreate(BaseModel):
    value_kg: float
    measured_at: datetime
    notes: Optional[str] = None


class WeightUpdate(BaseModel):
    value_kg: Optional[float] = None
    measured_at: Optional[datetime] = None
    notes: Optional[str] = None


class WeightRead(WeightCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# Steps
class StepsCreate(BaseModel):
    step_date: str  # YYYY-MM-DD
    step_count: int
    distance_m: Optional[float] = None


class StepsUpdate(BaseModel):
    step_date: Optional[str] = None
    step_count: Optional[int] = None
    distance_m: Optional[float] = None


class StepsRead(StepsCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# Import result
class ImportResult(BaseModel):
    filename: str
    metric: str
    inserted: int
    skipped: int
    errors: int
    error_messages: List[str] = []
