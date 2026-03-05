import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv

# Path detection for .env
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
# SQLAlchemy 2.0 requires mysql+pymysql for MySQL
if DATABASE_URL and DATABASE_URL.startswith("mysql://"):
    DATABASE_URL = DATABASE_URL.replace("mysql://", "mysql+pymysql://")

# Default to sqlite if no DB_URL is found to prevent crash
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# DEFINIAMO QUI IL BASE PER EVITARE IMPORT CIRCOLARI
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    try:
        print("Sincronizzazione modelli...")
        import database.models
        tables = list(Base.metadata.tables.keys())
        print(f"Tabelle registrate in Metadata: {tables}")
        
        if not tables:
            print("WARNING: Nessuna tabella trovata nei modelli. Verifica l'ereditarietà da Base.")
            
        print("Esecuzione create_all...")
        Base.metadata.create_all(bind=engine)
        print("create_all completato senza errori.")
    except Exception as e:
        print(f"CRITICAL ERROR in init_db: {str(e)}")
        import traceback
        traceback.print_exc()
