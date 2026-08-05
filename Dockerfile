# Dockerfile for GROOVE4U FastAPI Backend on Railway (Root Directory: /)
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install Python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend codebase
COPY backend ./backend

EXPOSE 8000

WORKDIR /app/backend

# Launch FastAPI web application server (binds to $PORT provided by Railway)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
