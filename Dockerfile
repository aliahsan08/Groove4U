# Context-agnostic Dockerfile for Railway (Works for any Root Directory setting)
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy the entire build context into a temporary staging folder
COPY . /tmp_build/

# Move the backend files to /app regardless of whether the context was '/' or '/backend'
RUN if [ -d "/tmp_build/backend" ]; then \
        mv /tmp_build/backend/* /app/; \
    else \
        mv /tmp_build/* /app/; \
    fi && \
    rm -rf /tmp_build

# Now /app is guaranteed to contain requirements.txt and main.py
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

# Launch FastAPI
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
