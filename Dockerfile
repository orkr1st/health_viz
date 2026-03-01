FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY static/ ./static/

RUN mkdir -p logs

EXPOSE 8443

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8443"]
