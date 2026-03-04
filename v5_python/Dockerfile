FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Reflex and dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Initialize Reflex and export frontend for production
RUN reflex init
RUN reflex export --frontend-only

# Reflex production usually runs a backend and a frontend
# For simplicity in this container, we run in production mode
# Port 3000 is the default Reflex frontend port
EXPOSE 3000

CMD ["reflex", "run", "--env", "prod", "--frontend-port", "3000"]
