FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# NiceGUI corre sulla 3001 di default nel nostro script
EXPOSE 3001

CMD ["python", "main.py"]
