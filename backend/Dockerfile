FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PROJECTS_DIR=/app/projects

# texlive-full + latexmk in one layer so the user never has to install packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-full \
    latexmk \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Isolate Python deps from the system Python installation.
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source into the image.
# The projects/ directory is NOT copied — it is always provided by a host volume.
COPY . /app/src

RUN mkdir -p /app/projects

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
