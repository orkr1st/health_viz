"""Unit tests for Samsung Health CSV parsers."""
import io
from pathlib import Path

import pandas as pd
import pytest

from app.parsers.base import read_samsung_csv
from app.parsers import samsung_blood_pressure, samsung_steps, samsung_weight

TEST_DIR = Path(__file__).parent
BP_CSV = TEST_DIR / "com.samsung.shealth.blood_pressure.test.csv"
WEIGHT_CSV = TEST_DIR / "com.samsung.health.weight.test.csv"
STEPS_CSV = TEST_DIR / "com.samsung.shealth.step_daily_trend.test.csv"


# ── read_samsung_csv ───────────────────────────────────────────────────────────

class TestReadSamsungCsv:
    def test_blood_pressure_columns(self):
        df = read_samsung_csv(BP_CSV)
        assert isinstance(df, pd.DataFrame)
        assert len(df) >= 1
        assert "systolic" in df.columns
        assert "diastolic" in df.columns
        assert "pulse" in df.columns
        assert "update_time" in df.columns

    def test_weight_columns(self):
        df = read_samsung_csv(WEIGHT_CSV)
        assert isinstance(df, pd.DataFrame)
        assert len(df) >= 1
        assert "weight" in df.columns
        assert "update_time" in df.columns

    def test_steps_columns(self):
        df = read_samsung_csv(STEPS_CSV)
        assert isinstance(df, pd.DataFrame)
        assert len(df) >= 1
        assert "count" in df.columns
        assert "distance" in df.columns
        assert "day_time" in df.columns


# ── Blood pressure parser ──────────────────────────────────────────────────────

class TestBloodPressureParser:
    def test_parsed_values(self):
        with open(BP_CSV, "rb") as f:
            df = pd.read_csv(f, skiprows=1, index_col=False)
        df.columns = [col.rsplit(".", 1)[-1] for col in df.columns]
        row = df.iloc[0]
        assert int(row["systolic"]) == 100
        assert int(row["diastolic"]) == 70
        assert int(row["pulse"]) == 83
        assert str(row["update_time"]) == "2026-03-01 09:41:59.114"

    def test_import_inserts_one(self, db_session):
        with open(BP_CSV, "rb") as f:
            result = samsung_blood_pressure.parse(f, BP_CSV.name, db_session, user_id=1)
        assert result.inserted == 1
        assert result.skipped == 0
        assert result.errors == 0
        assert result.metric == "blood_pressure"

    def test_import_idempotent(self, db_session):
        with open(BP_CSV, "rb") as f:
            samsung_blood_pressure.parse(f, BP_CSV.name, db_session, user_id=1)
        with open(BP_CSV, "rb") as f:
            result = samsung_blood_pressure.parse(f, BP_CSV.name, db_session, user_id=1)
        assert result.inserted == 0
        assert result.skipped == 1


# ── Steps parser ───────────────────────────────────────────────────────────────

class TestStepsParser:
    def test_parsed_values(self):
        with open(STEPS_CSV, "rb") as f:
            df = pd.read_csv(f, skiprows=1, index_col=False)
        df.columns = [col.rsplit(".", 1)[-1] for col in df.columns]
        row = df.iloc[0]
        assert int(row["count"]) == 7625
        assert float(row["distance"]) == pytest.approx(5601.9736)
        assert int(row["day_time"]) == 1480723200000

    def test_epoch_to_date(self):
        from app.parsers.samsung_steps import _epoch_ms_to_date
        assert _epoch_ms_to_date(1480723200000) == "2016-12-03"

    def test_import_inserts_one(self, db_session):
        with open(STEPS_CSV, "rb") as f:
            result = samsung_steps.parse(f, STEPS_CSV.name, db_session, user_id=1)
        assert result.inserted == 1
        assert result.skipped == 0
        assert result.errors == 0
        assert result.metric == "steps"

    def test_import_idempotent(self, db_session):
        with open(STEPS_CSV, "rb") as f:
            samsung_steps.parse(f, STEPS_CSV.name, db_session, user_id=1)
        with open(STEPS_CSV, "rb") as f:
            result = samsung_steps.parse(f, STEPS_CSV.name, db_session, user_id=1)
        assert result.inserted == 0
        assert result.skipped == 1


# ── Weight parser ──────────────────────────────────────────────────────────────

class TestWeightParser:
    def test_parsed_values(self):
        with open(WEIGHT_CSV, "rb") as f:
            df = pd.read_csv(f, skiprows=1, index_col=False)
        df.columns = [col.rsplit(".", 1)[-1] for col in df.columns]
        row = df.iloc[0]
        assert float(row["weight"]) == pytest.approx(93.5)
        assert str(row["update_time"]) == "2024-10-09 18:16:42.556"

    def test_import_inserts_one(self, db_session):
        with open(WEIGHT_CSV, "rb") as f:
            result = samsung_weight.parse(f, WEIGHT_CSV.name, db_session, user_id=1)
        assert result.inserted == 1
        assert result.skipped == 0
        assert result.errors == 0
        assert result.metric == "weight"

    def test_import_idempotent(self, db_session):
        with open(WEIGHT_CSV, "rb") as f:
            samsung_weight.parse(f, WEIGHT_CSV.name, db_session, user_id=1)
        with open(WEIGHT_CSV, "rb") as f:
            result = samsung_weight.parse(f, WEIGHT_CSV.name, db_session, user_id=1)
        assert result.inserted == 0
        assert result.skipped == 1
