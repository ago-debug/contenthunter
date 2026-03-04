import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    
    # Paths
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    PUBLIC_DIR: str = os.path.join(os.path.dirname(BASE_DIR), "public")
    UPLOAD_DIR: str = os.path.join(PUBLIC_DIR, "uploads")
    CROPS_DIR: str = os.path.join(PUBLIC_DIR, "static_crops")
    
    class Config:
        env_file = ".env"

settings = Settings()

# Ensure dirs exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.CROPS_DIR, exist_ok=True)
