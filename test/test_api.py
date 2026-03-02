"""Integration tests for all API endpoints."""
from pathlib import Path

import pytest

TEST_DIR = Path(__file__).parent
BP_CSV = TEST_DIR / "com.samsung.shealth.blood_pressure.test.csv"
WEIGHT_CSV = TEST_DIR / "com.samsung.health.weight.test.csv"
STEPS_CSV = TEST_DIR / "com.samsung.shealth.step_daily_trend.test.csv"


# ── Auth ───────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_register(self, client):
        resp = client.post("/api/auth/register", json={"username": "newuser", "password": "pass"})
        assert resp.status_code == 201
        assert resp.json()["username"] == "newuser"

    def test_register_duplicate(self, client):
        client.post("/api/auth/register", json={"username": "dup", "password": "pass"})
        resp = client.post("/api/auth/register", json={"username": "dup", "password": "pass"})
        assert resp.status_code == 400

    def test_login_success(self, client):
        client.post("/api/auth/register", json={"username": "loginuser", "password": "secret"})
        resp = client.post("/api/auth/token", data={"username": "loginuser", "password": "secret"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client):
        client.post("/api/auth/register", json={"username": "wrongpw", "password": "correct"})
        resp = client.post("/api/auth/token", data={"username": "wrongpw", "password": "wrong"})
        assert resp.status_code == 401

    def test_me_with_token(self, client, auth):
        resp = client.get("/api/auth/me", headers=auth)
        assert resp.status_code == 200
        assert resp.json()["username"] == "tester"

    def test_me_without_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401


# ── Blood pressure CRUD ────────────────────────────────────────────────────────

class TestBloodPressureCrud:
    def _create(self, client, auth):
        return client.post(
            "/api/blood-pressure",
            json={"systolic": 120, "diastolic": 80, "pulse": 70, "measured_at": "2024-01-01T10:00:00"},
            headers=auth,
        )

    def test_create(self, client, auth):
        resp = self._create(client, auth)
        assert resp.status_code == 201
        data = resp.json()
        assert data["systolic"] == 120
        assert data["diastolic"] == 80
        assert data["pulse"] == 70

    def test_list(self, client, auth):
        self._create(client, auth)
        resp = client.get("/api/blood-pressure", headers=auth)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_get_by_id(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        resp = client.get(f"/api/blood-pressure/{record_id}", headers=auth)
        assert resp.status_code == 200
        assert resp.json()["id"] == record_id

    def test_update(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        resp = client.put(f"/api/blood-pressure/{record_id}", json={"pulse": 65}, headers=auth)
        assert resp.status_code == 200
        assert resp.json()["pulse"] == 65

    def test_delete(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        resp = client.delete(f"/api/blood-pressure/{record_id}", headers=auth)
        assert resp.status_code == 204

    def test_get_deleted_returns_404(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        client.delete(f"/api/blood-pressure/{record_id}", headers=auth)
        resp = client.get(f"/api/blood-pressure/{record_id}", headers=auth)
        assert resp.status_code == 404

    def test_user_isolation(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        # Second user cannot access first user's record
        client.post("/api/auth/register", json={"username": "other_bp", "password": "pw"})
        r2 = client.post("/api/auth/token", data={"username": "other_bp", "password": "pw"})
        other_auth = {"Authorization": f"Bearer {r2.json()['access_token']}"}
        resp = client.get(f"/api/blood-pressure/{record_id}", headers=other_auth)
        assert resp.status_code == 404


# ── Weight CRUD ────────────────────────────────────────────────────────────────

class TestWeightCrud:
    def _create(self, client, auth):
        return client.post(
            "/api/weight",
            json={"value_kg": 75.5, "measured_at": "2024-01-01T08:00:00"},
            headers=auth,
        )

    def test_create(self, client, auth):
        resp = self._create(client, auth)
        assert resp.status_code == 201
        assert resp.json()["value_kg"] == pytest.approx(75.5)

    def test_list(self, client, auth):
        self._create(client, auth)
        resp = client.get("/api/weight", headers=auth)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_get_by_id(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        resp = client.get(f"/api/weight/{record_id}", headers=auth)
        assert resp.status_code == 200
        assert resp.json()["id"] == record_id

    def test_update(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        resp = client.put(f"/api/weight/{record_id}", json={"value_kg": 74.0}, headers=auth)
        assert resp.status_code == 200
        assert resp.json()["value_kg"] == pytest.approx(74.0)

    def test_delete(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        resp = client.delete(f"/api/weight/{record_id}", headers=auth)
        assert resp.status_code == 204

    def test_get_deleted_returns_404(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        client.delete(f"/api/weight/{record_id}", headers=auth)
        resp = client.get(f"/api/weight/{record_id}", headers=auth)
        assert resp.status_code == 404

    def test_user_isolation(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        client.post("/api/auth/register", json={"username": "other_w", "password": "pw"})
        r2 = client.post("/api/auth/token", data={"username": "other_w", "password": "pw"})
        other_auth = {"Authorization": f"Bearer {r2.json()['access_token']}"}
        resp = client.get(f"/api/weight/{record_id}", headers=other_auth)
        assert resp.status_code == 404


# ── Steps CRUD ─────────────────────────────────────────────────────────────────

class TestStepsCrud:
    def _create(self, client, auth):
        return client.post(
            "/api/steps",
            json={"step_date": "2024-01-01", "step_count": 8000, "distance_m": 6000.0},
            headers=auth,
        )

    def test_create(self, client, auth):
        resp = self._create(client, auth)
        assert resp.status_code == 201
        assert resp.json()["step_count"] == 8000

    def test_list(self, client, auth):
        self._create(client, auth)
        resp = client.get("/api/steps", headers=auth)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_get_by_id(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        resp = client.get(f"/api/steps/{record_id}", headers=auth)
        assert resp.status_code == 200
        assert resp.json()["id"] == record_id

    def test_update(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        resp = client.put(f"/api/steps/{record_id}", json={"step_count": 9000}, headers=auth)
        assert resp.status_code == 200
        assert resp.json()["step_count"] == 9000

    def test_delete(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        resp = client.delete(f"/api/steps/{record_id}", headers=auth)
        assert resp.status_code == 204

    def test_get_deleted_returns_404(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        client.delete(f"/api/steps/{record_id}", headers=auth)
        resp = client.get(f"/api/steps/{record_id}", headers=auth)
        assert resp.status_code == 404

    def test_user_isolation(self, client, auth):
        record_id = self._create(client, auth).json()["id"]
        client.post("/api/auth/register", json={"username": "other_s", "password": "pw"})
        r2 = client.post("/api/auth/token", data={"username": "other_s", "password": "pw"})
        other_auth = {"Authorization": f"Bearer {r2.json()['access_token']}"}
        resp = client.get(f"/api/steps/{record_id}", headers=other_auth)
        assert resp.status_code == 404


# ── Import endpoint ────────────────────────────────────────────────────────────

class TestImport:
    def test_upload_blood_pressure(self, client, auth):
        with open(BP_CSV, "rb") as f:
            resp = client.post(
                "/api/import",
                files={"file": (BP_CSV.name, f, "text/csv")},
                headers=auth,
            )
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 1
        assert results[0]["inserted"] == 1
        assert results[0]["metric"] == "blood_pressure"

    def test_upload_blood_pressure_idempotent(self, client, auth):
        for _ in range(2):
            with open(BP_CSV, "rb") as f:
                resp = client.post(
                    "/api/import",
                    files={"file": (BP_CSV.name, f, "text/csv")},
                    headers=auth,
                )
        assert resp.status_code == 200
        results = resp.json()
        assert results[0]["inserted"] == 0
        assert results[0]["skipped"] == 1

    def test_blood_pressure_values_via_get(self, client, auth):
        with open(BP_CSV, "rb") as f:
            client.post(
                "/api/import",
                files={"file": (BP_CSV.name, f, "text/csv")},
                headers=auth,
            )
        resp = client.get("/api/blood-pressure", headers=auth)
        assert resp.status_code == 200
        records = resp.json()
        assert len(records) >= 1
        record = records[0]
        assert record["systolic"] == 100
        assert record["diastolic"] == 70
        assert record["pulse"] == 83

    def test_upload_weight(self, client, auth):
        with open(WEIGHT_CSV, "rb") as f:
            resp = client.post(
                "/api/import",
                files={"file": (WEIGHT_CSV.name, f, "text/csv")},
                headers=auth,
            )
        assert resp.status_code == 200
        results = resp.json()
        assert results[0]["inserted"] == 1
        assert results[0]["metric"] == "weight"

    def test_weight_values_via_get(self, client, auth):
        with open(WEIGHT_CSV, "rb") as f:
            client.post(
                "/api/import",
                files={"file": (WEIGHT_CSV.name, f, "text/csv")},
                headers=auth,
            )
        resp = client.get("/api/weight", headers=auth)
        assert resp.status_code == 200
        records = resp.json()
        assert len(records) >= 1
        assert records[0]["value_kg"] == pytest.approx(93.5)

    def test_upload_steps(self, client, auth):
        with open(STEPS_CSV, "rb") as f:
            resp = client.post(
                "/api/import",
                files={"file": (STEPS_CSV.name, f, "text/csv")},
                headers=auth,
            )
        assert resp.status_code == 200
        results = resp.json()
        assert results[0]["inserted"] == 1
        assert results[0]["metric"] == "steps"

    def test_steps_values_via_get(self, client, auth):
        with open(STEPS_CSV, "rb") as f:
            client.post(
                "/api/import",
                files={"file": (STEPS_CSV.name, f, "text/csv")},
                headers=auth,
            )
        resp = client.get("/api/steps", headers=auth)
        assert resp.status_code == 200
        records = resp.json()
        assert len(records) >= 1
        record = records[0]
        assert record["step_count"] == 7625
        assert record["distance_m"] == pytest.approx(5601.9736)

    def test_upload_unsupported_file(self, client, auth):
        resp = client.post(
            "/api/import",
            files={"file": ("data.txt", b"hello", "text/plain")},
            headers=auth,
        )
        assert resp.status_code == 400

    def test_import_log(self, client, auth):
        resp = client.get("/api/import/log", headers=auth)
        assert resp.status_code == 200
        assert isinstance(resp.text, str)


# ── Change password ────────────────────────────────────────────────────────────

class TestChangePassword:
    def test_success(self, client, auth):
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": "secret", "new_password": "newpass"},
            headers=auth,
        )
        assert resp.status_code == 200
        # Old password no longer works
        assert client.post(
            "/api/auth/token", data={"username": "tester", "password": "secret"}
        ).status_code == 401
        # New password works
        assert client.post(
            "/api/auth/token", data={"username": "tester", "password": "newpass"}
        ).status_code == 200

    def test_wrong_current_password(self, client, auth):
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": "wrongpass", "new_password": "newpass"},
            headers=auth,
        )
        assert resp.status_code == 400

    def test_empty_new_password(self, client, auth):
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": "secret", "new_password": ""},
            headers=auth,
        )
        assert resp.status_code == 400

    def test_requires_auth(self, client):
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": "secret", "new_password": "newpass"},
        )
        assert resp.status_code == 401


# ── Deduplicate ────────────────────────────────────────────────────────────────

class TestDeduplicate:
    def _bp(self, client, auth, timestamp, systolic=120, diastolic=80, pulse=70):
        return client.post(
            "/api/blood-pressure",
            json={"systolic": systolic, "diastolic": diastolic, "pulse": pulse,
                  "measured_at": timestamp},
            headers=auth,
        )

    def _weight(self, client, auth, timestamp, value_kg=75.5):
        return client.post(
            "/api/weight",
            json={"value_kg": value_kg, "measured_at": timestamp},
            headers=auth,
        )

    # ── preview (GET) ──────────────────────────────────────────────────────────

    def test_preview_empty(self, client, auth):
        resp = client.get("/api/deduplicate", headers=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert data["blood_pressure"] == []
        assert data["weight"] == []
        assert data["steps"] == []

    def test_preview_finds_bp_duplicates(self, client, auth):
        # Same day, same values, different timestamps → duplicate
        self._bp(client, auth, "2024-01-01T10:00:00")
        self._bp(client, auth, "2024-01-01T11:00:00")
        data = client.get("/api/deduplicate", headers=auth).json()
        assert len(data["blood_pressure"]) == 1

    def test_preview_does_not_delete(self, client, auth):
        self._bp(client, auth, "2024-01-01T10:00:00")
        self._bp(client, auth, "2024-01-01T11:00:00")
        client.get("/api/deduplicate", headers=auth)
        # Both records still present after preview
        assert len(client.get("/api/blood-pressure", headers=auth).json()) == 2

    # ── remove (POST) ──────────────────────────────────────────────────────────

    def test_remove_no_dupes_returns_zeros(self, client, auth):
        self._bp(client, auth, "2024-01-01T10:00:00")
        data = client.post("/api/deduplicate", headers=auth).json()
        assert data == {"blood_pressure": 0, "weight": 0, "steps": 0}

    def test_remove_bp_duplicates(self, client, auth):
        self._bp(client, auth, "2024-01-01T10:00:00")
        self._bp(client, auth, "2024-01-01T11:00:00")  # duplicate
        data = client.post("/api/deduplicate", headers=auth).json()
        assert data["blood_pressure"] == 1
        assert len(client.get("/api/blood-pressure", headers=auth).json()) == 1

    def test_remove_keeps_earliest_record(self, client, auth):
        first_id = self._bp(client, auth, "2024-01-01T10:00:00").json()["id"]
        self._bp(client, auth, "2024-01-01T11:00:00")
        client.post("/api/deduplicate", headers=auth)
        remaining = client.get("/api/blood-pressure", headers=auth).json()
        assert remaining[0]["id"] == first_id

    def test_different_values_on_same_day_not_duplicates(self, client, auth):
        self._bp(client, auth, "2024-01-01T10:00:00", systolic=120, diastolic=80)
        self._bp(client, auth, "2024-01-01T11:00:00", systolic=130, diastolic=85)
        data = client.post("/api/deduplicate", headers=auth).json()
        assert data["blood_pressure"] == 0
        assert len(client.get("/api/blood-pressure", headers=auth).json()) == 2

    def test_same_values_different_days_not_duplicates(self, client, auth):
        self._bp(client, auth, "2024-01-01T10:00:00")
        self._bp(client, auth, "2024-01-02T10:00:00")
        data = client.post("/api/deduplicate", headers=auth).json()
        assert data["blood_pressure"] == 0

    def test_remove_weight_duplicates(self, client, auth):
        self._weight(client, auth, "2024-01-01T08:00:00")
        self._weight(client, auth, "2024-01-01T09:00:00")  # duplicate
        data = client.post("/api/deduplicate", headers=auth).json()
        assert data["weight"] == 1
        assert len(client.get("/api/weight", headers=auth).json()) == 1

    def test_user_isolation(self, client, auth):
        # Tester has a duplicate
        self._bp(client, auth, "2024-01-01T10:00:00")
        self._bp(client, auth, "2024-01-01T11:00:00")
        # Second user has a clean record
        client.post("/api/auth/register", json={"username": "other_dedup", "password": "pw"})
        r2 = client.post("/api/auth/token", data={"username": "other_dedup", "password": "pw"})
        other_auth = {"Authorization": f"Bearer {r2.json()['access_token']}"}
        self._bp(client, other_auth, "2024-01-01T10:00:00")
        # Deduplicate as tester
        assert client.post("/api/deduplicate", headers=auth).json()["blood_pressure"] == 1
        # Other user's record is untouched
        assert len(client.get("/api/blood-pressure", headers=other_auth).json()) == 1

    def test_requires_auth(self, client):
        assert client.get("/api/deduplicate").status_code == 401
        assert client.post("/api/deduplicate").status_code == 401


# ── Generic CSV import ─────────────────────────────────────────────────────────

class TestGenericCsvImport:
    def _upload(self, client, auth, filename, content):
        return client.post(
            "/api/import",
            files={"file": (filename, content, "text/csv")},
            headers=auth,
        )

    # ── blood pressure ─────────────────────────────────────────────────────────

    def test_bp_insert(self, client, auth):
        csv = b"measured_at,systolic,diastolic,pulse,notes\n2024-01-01 10:00:00,120,80,70,rest\n"
        resp = self._upload(client, auth, "bp.csv", csv)
        assert resp.status_code == 200
        result = resp.json()[0]
        assert result["metric"] == "blood_pressure"
        assert result["inserted"] == 1
        assert result["skipped"] == 0

    def test_bp_values_stored_correctly(self, client, auth):
        csv = b"measured_at,systolic,diastolic,pulse,notes\n2024-01-01 10:00:00,120,80,70,rest\n"
        self._upload(client, auth, "bp.csv", csv)
        records = client.get("/api/blood-pressure", headers=auth).json()
        assert len(records) == 1
        assert records[0]["systolic"] == 120
        assert records[0]["diastolic"] == 80
        assert records[0]["pulse"] == 70
        assert records[0]["notes"] == "rest"

    def test_bp_idempotent(self, client, auth):
        csv = b"measured_at,systolic,diastolic,pulse,notes\n2024-01-01 10:00:00,120,80,70,\n"
        self._upload(client, auth, "bp.csv", csv)
        resp = self._upload(client, auth, "bp.csv", csv)
        result = resp.json()[0]
        assert result["inserted"] == 0
        assert result["skipped"] == 1

    def test_bp_optional_columns(self, client, auth):
        # pulse and notes are optional
        csv = b"measured_at,systolic,diastolic\n2024-01-01 10:00:00,120,80\n"
        resp = self._upload(client, auth, "bp.csv", csv)
        assert resp.json()[0]["inserted"] == 1
        record = client.get("/api/blood-pressure", headers=auth).json()[0]
        assert record["pulse"] is None
        assert record["notes"] is None

    # ── weight ─────────────────────────────────────────────────────────────────

    def test_weight_insert(self, client, auth):
        csv = b"measured_at,value_kg,notes\n2024-01-01 08:00:00,75.5,morning\n"
        resp = self._upload(client, auth, "weight.csv", csv)
        result = resp.json()[0]
        assert result["metric"] == "weight"
        assert result["inserted"] == 1

    def test_weight_values_stored_correctly(self, client, auth):
        csv = b"measured_at,value_kg,notes\n2024-01-01 08:00:00,75.5,morning\n"
        self._upload(client, auth, "weight.csv", csv)
        records = client.get("/api/weight", headers=auth).json()
        assert records[0]["value_kg"] == pytest.approx(75.5)
        assert records[0]["notes"] == "morning"

    def test_weight_idempotent(self, client, auth):
        csv = b"measured_at,value_kg\n2024-01-01 08:00:00,75.5\n"
        self._upload(client, auth, "weight.csv", csv)
        resp = self._upload(client, auth, "weight.csv", csv)
        result = resp.json()[0]
        assert result["inserted"] == 0
        assert result["skipped"] == 1

    # ── steps ──────────────────────────────────────────────────────────────────

    def test_steps_insert(self, client, auth):
        csv = b"step_date,step_count,distance_m\n2024-01-01,8000,6000.0\n"
        resp = self._upload(client, auth, "steps.csv", csv)
        result = resp.json()[0]
        assert result["metric"] == "steps"
        assert result["inserted"] == 1

    def test_steps_values_stored_correctly(self, client, auth):
        csv = b"step_date,step_count,distance_m\n2024-01-01,8000,6000.0\n"
        self._upload(client, auth, "steps.csv", csv)
        records = client.get("/api/steps", headers=auth).json()
        assert records[0]["step_count"] == 8000
        assert records[0]["distance_m"] == pytest.approx(6000.0)

    def test_steps_idempotent(self, client, auth):
        csv = b"step_date,step_count\n2024-01-01,8000\n"
        self._upload(client, auth, "steps.csv", csv)
        resp = self._upload(client, auth, "steps.csv", csv)
        result = resp.json()[0]
        assert result["inserted"] == 0
        assert result["skipped"] == 1

    def test_steps_optional_distance(self, client, auth):
        csv = b"step_date,step_count\n2024-01-01,8000\n"
        resp = self._upload(client, auth, "steps.csv", csv)
        assert resp.json()[0]["inserted"] == 1
        assert client.get("/api/steps", headers=auth).json()[0]["distance_m"] is None

    # ── error cases ────────────────────────────────────────────────────────────

    def test_unrecognised_columns_returns_400(self, client, auth):
        csv = b"foo,bar\n1,2\n"
        resp = self._upload(client, auth, "unknown.csv", csv)
        assert resp.status_code == 400

    def test_multiple_rows(self, client, auth):
        csv = (
            b"measured_at,systolic,diastolic\n"
            b"2024-01-01 10:00:00,120,80\n"
            b"2024-01-02 10:00:00,125,82\n"
        )
        resp = self._upload(client, auth, "bp.csv", csv)
        assert resp.json()[0]["inserted"] == 2
        assert len(client.get("/api/blood-pressure", headers=auth).json()) == 2
