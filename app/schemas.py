from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator


# Auth
class UserCreate(BaseModel):
    username: str
    password: str


class UserRead(BaseModel):
    id: int
    username: str
    created_at: datetime
    avatar_url: Optional[str] = None
    weight_goal: Optional[float] = None

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class WeightGoalUpdate(BaseModel):
    value_kg: Optional[float] = None


# Blood Pressure
class BloodPressureCreate(BaseModel):
    systolic:    int           = Field(..., ge=40, le=300)
    diastolic:   int           = Field(..., ge=20, le=200)
    pulse:       Optional[int] = Field(None, ge=20, le=300)
    measured_at: datetime
    notes:       Optional[str] = None


class BloodPressureUpdate(BaseModel):
    systolic:    Optional[int]      = Field(None, ge=40, le=300)
    diastolic:   Optional[int]      = Field(None, ge=20, le=200)
    pulse:       Optional[int]      = Field(None, ge=20, le=300)
    measured_at: Optional[datetime] = None
    notes:       Optional[str]      = None


class BloodPressureRead(BloodPressureCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# Weight
class WeightCreate(BaseModel):
    value_kg:    float         = Field(..., gt=0, le=700)
    measured_at: datetime
    notes:       Optional[str] = None


class WeightUpdate(BaseModel):
    value_kg:    Optional[float]    = Field(None, gt=0, le=700)
    measured_at: Optional[datetime] = None
    notes:       Optional[str]      = None


class WeightRead(WeightCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# Steps
class StepsCreate(BaseModel):
    step_date:  str            # validated below
    step_count: int            = Field(..., ge=0, le=200_000)
    distance_m: Optional[float] = Field(None, ge=0, le=500_000)
    notes:      Optional[str]  = Field(None)

    @field_validator("step_date")
    @classmethod
    def validate_step_date(cls, v: str) -> str:
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("step_date must be YYYY-MM-DD")
        return v


class StepsUpdate(BaseModel):
    step_date:  Optional[str]   = None
    step_count: Optional[int]   = Field(None, ge=0, le=200_000)
    distance_m: Optional[float] = Field(None, ge=0, le=500_000)
    notes:      Optional[str]   = Field(None)

    @field_validator("step_date")
    @classmethod
    def validate_step_date(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("step_date must be YYYY-MM-DD")
        return v


class StepsRead(StepsCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# Import batch
class ImportBatchRead(BaseModel):
    id: int
    filename: str
    imported_at: datetime
    bp_count: int
    weight_count: int
    steps_count: int

    model_config = {"from_attributes": True}


# Import result
class ImportResult(BaseModel):
    filename: str
    metric: str
    inserted: int
    skipped: int
    errors: int
    error_messages: List[str] = []


# Background import job status
class ImportJobStatus(BaseModel):
    job_id: str
    status: str   # pending | running | done | error
    results: Optional[List[ImportResult]] = None
    error: Optional[str] = None

    model_config = {"from_attributes": True}
