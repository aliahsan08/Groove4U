# Multi-stage Dockerfile for GROOVE4U Music Discovery Web Application

# Stage 1: Build React + Vite Frontend Production Bundle
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy package files and install dependencies (supports root & subdirectory context)
COPY package.json* package-lock.json* ./
RUN if [ -f package.json ]; then npm ci || npm install; else mkdir -p dist; fi

# Copy project source code and run production build if package.json exists
COPY . .
RUN if [ -f package.json ]; then npm run build; else mkdir -p dist; fi

# Stage 2: Python 3.11 FastAPI Backend Container
FROM python:3.11-slim AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy requirements from root or backend directory using wildcard pattern
COPY backend/requirements.txt* requirements.txt* ./backend_reqs/
RUN if [ -f ./backend_reqs/requirements.txt ]; then pip install --no-cache-dir -r ./backend_reqs/requirements.txt; elif [ -f ./backend_reqs/backend/requirements.txt ]; then pip install --no-cache-dir -r ./backend_reqs/backend/requirements.txt; fi

# Copy backend codebase cleanly regardless of build context root
COPY . ./app_source
RUN mkdir -p ./backend && \
    if [ -d ./app_source/backend ]; then cp -r ./app_source/backend/* ./backend/; else cp -r ./app_source/* ./backend/; fi

# Copy compiled frontend production bundle from build stage
COPY --from=frontend-builder /app/dist ./backend/static

EXPOSE 8000

WORKDIR /app/backend

# Launch FastAPI web application server (binds to $PORT provided by Railway)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
