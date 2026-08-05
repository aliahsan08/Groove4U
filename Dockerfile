# Multi-stage Dockerfile for GROOVE4U Music Discovery Web Application

# Stage 1: Build React + Vite Frontend Production Bundle
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci || npm install

# Copy all project source code and run production build
COPY . .
RUN npm run build

# Stage 2: Python 3.11 FastAPI Backend Container
FROM python:3.11-slim AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install Python requirements
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy Backend codebase
COPY backend ./backend

# Copy compiled frontend production bundle from build stage
COPY --from=frontend-builder /app/dist ./backend/static

EXPOSE 8000

WORKDIR /app/backend

# Launch FastAPI web application server (binds to $PORT provided by Railway)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
