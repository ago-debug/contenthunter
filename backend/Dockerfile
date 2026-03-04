FROM python:3.11-slim

# Install system dependencies for PyMuPDF and MySQL
RUN apt-get update && apt-get install -y \
    build-essential \
    python3-dev \
    libmupdf-dev \
    libfreetype6-dev \
    pkg-config \
    default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Start Gunicorn with Uvicorn workers for production stability
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "main:app", "--bind", "0.0.0.0:8000"]
