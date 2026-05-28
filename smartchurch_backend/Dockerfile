# ── Stage 1: build wheels ────────────────────────────────────────────
# Using slim (Debian-based) instead of Alpine because onnxruntime, insightface,
# and opencv have no musl/Alpine wheels — they require glibc.
FROM python:3.12-slim AS builder

# Install system build dependencies needed to compile C-extension packages:
# gcc/g++     — compile C/C++ extensions (psycopg2, regex, etc.)
# libpq-dev   — PostgreSQL headers for psycopg2
# libffi-dev  — required by cffi / cryptography
# libglib2.0  — GLib headers for opencv and gstreamer bindings
# cmake       — build system used by insightface / onnxruntime
# libjpeg-dev — JPEG support for Pillow / opencv
# zlib1g-dev  — zlib compression for Pillow / numpy
# libopenblas — BLAS math library for numpy / insightface
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    libffi-dev \
    libglib2.0-dev \
    cmake \
    libjpeg-dev \
    zlib1g-dev \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY requirements.txt .

# opencv-python requires a physical display (X11) which doesn't exist in a container.
# Swapping to opencv-python-headless removes that dependency while keeping cv2 fully functional.
# pip prefix=/install keeps wheels isolated so only this layer is copied to the runtime stage.
RUN sed -i 's/^opencv-python$/opencv-python-headless/' requirements.txt \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: runtime ─────────────────────────────────────────────────
# Fresh slim image — build tools (gcc, cmake, headers) are NOT copied over,
# keeping the final image significantly smaller.
FROM python:3.12-slim

# Install only runtime shared libraries (no -dev headers needed at runtime):
# libpq5          — PostgreSQL client library for psycopg2
# libglib2.0-0    — GLib runtime for opencv
# libjpeg62-turbo — JPEG decoding for Pillow / opencv
# zlib1g          — zlib decompression
# libopenblas0    — BLAS math at runtime for numpy
# postgresql-client — psql CLI used in start.sh to run temp.sql
# libxcb1         — X11 xcb binding required by opencv-python-headless
# libgl1          — OpenGL runtime required by opencv
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libglib2.0-0 \
    libjpeg62-turbo \
    zlib1g \
    libopenblas0 \
    postgresql-client \
    libxcb1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Prevent Python from writing .pyc files and buffer stdout/stderr
# so logs appear immediately in docker compose logs.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Copy installed packages from builder stage into system site-packages
COPY --from=builder /install /usr/local

# Copy the entire backend source (respects .dockerignore to exclude .venv, .env, etc.)
COPY . .

RUN chmod +x /app/start.sh

EXPOSE 8000

CMD ["/app/start.sh"]
