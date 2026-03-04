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

# Set API URL for production export
ENV API_URL=https://contenthunter.abreve.it

# Initialize Reflex and export frontend for production
RUN reflex init
RUN reflex export --frontend-only

# Expose ports
EXPOSE 3000
EXPOSE 8000

CMD ["reflex", "run", "--env", "prod", "--frontend-port", "3000", "--backend-port", "8000"]
