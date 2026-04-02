from datetime import datetime
from sqlalchemy import Integer, Float, String, DateTime, Text, UniqueConstraint, ForeignKey, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    weight_goal: Mapped[float | None] = mapped_column(Float, nullable=True)


class ImportBatch(Base):
    __tablename__ = "import_batch"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    bp_count: Mapped[int] = mapped_column(Integer, default=0)
    weight_count: Mapped[int] = mapped_column(Integer, default=0)
    steps_count: Mapped[int] = mapped_column(Integer, default=0)


class BloodPressure(Base):
    __tablename__ = "blood_pressure"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("user.id"), nullable=True, index=True)
    systolic: Mapped[int] = mapped_column(Integer, nullable=False)
    diastolic: Mapped[int] = mapped_column(Integer, nullable=False)
    pulse: Mapped[int | None] = mapped_column(Integer, nullable=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    import_batch_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("import_batch.id"), nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "measured_at", name="uq_bp_user_time"),)


class Weight(Base):
    __tablename__ = "weight"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("user.id"), nullable=True, index=True)
    value_kg: Mapped[float] = mapped_column(Float, nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    import_batch_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("import_batch.id"), nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "measured_at", name="uq_weight_user_time"),)


class Steps(Base):
    __tablename__ = "steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("user.id"), nullable=True, index=True)
    step_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    step_count: Mapped[int] = mapped_column(Integer, nullable=False)
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    import_batch_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("import_batch.id"), nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "step_date", name="uq_steps_user_date"),)
