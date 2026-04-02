# Health Tracker

A self-hosted personal health tracking web application. Track blood pressure, body weight, and daily steps. Import historical data directly from a Samsung Health export.

## Requirements

- Python 3.11+

## Installation

```bash
# Clone or download the project, then install dependencies
pip install -r requirements.txt
```

## Starting the Server

```bash
uvicorn app.main:app --reload
```

Open `http://localhost:8443` in your browser.

On first start the SQLite database (`health.db`) and the `logs/` directory are created automatically.

## Importing Samsung Health Data

1. In the Samsung Health app: **More → Settings → Download personal data**
2. Wait for the ZIP to be prepared and download it to your device
3. Transfer the ZIP to your computer
4. In the web app, use the **Import** button in the header and upload the ZIP

Supported data types imported from the ZIP:

| Metric | Samsung CSV prefix |
|---|---|
| Blood pressure | `com.samsung.shealth.blood_pressure` / `com.samsung.health.blood_pressure` |
| Body weight | `com.samsung.health.weight` / `com.samsung.shealth.weight` |
| Daily steps | `com.samsung.shealth.step_daily_trend` / `com.samsung.health.step_daily_trend` |

Plain CSV files are also accepted if the header contains the right column names (`systolic`+`diastolic`, `value_kg`, or `step_count`+`step_date`).

After import, a detailed result modal shows inserted/skipped/error counts per file. The **View Log** button in the modal shows the last 200 imports for your account.

## Data Storage

All data is stored locally in `health.db` (SQLite). No external services or accounts required.

## API

The REST API is available at `http://localhost:8443/api/v1/` and auto-documented at `http://localhost:8443/docs`.
