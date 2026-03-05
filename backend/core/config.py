import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Caricamento .env più robusto
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

class Settings(BaseSettings):
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "NO_KEY")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./test.db")
    
    # Percorsi assoluti calcolati in modo dinamico
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # La cartella public è allo stesso livello della cartella backend
    PUBLIC_DIR: str = os.path.join(os.path.dirname(BASE_DIR), "public")
    UPLOAD_DIR: str = os.path.join(PUBLIC_DIR, "uploads")
    CROPS_DIR: str = os.path.join(PUBLIC_DIR, "static_crops")
    
    class Config:
        case_sensitive = True
        extra = "allow" # Evita errori se ci sono altre variabili nel .env

settings = Settings()

# Creazione cartelle solo se possiamo scriverci
try:
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.CROPS_DIR, exist_ok=True)
except Exception as e:
    print(f"WARNING: Impossibile creare cartelle di storage: {e}")
