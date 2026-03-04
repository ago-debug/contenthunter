import os
from sqlalchemy import create_all, create_engine
from sqlalchemy.orm import sessionmaker, Session
from .models import Base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
# Convert mysql:// to mysql+pymysql:// if needed for SQLAlchemy
if DATABASE_URL and DATABASE_URL.startswith("mysql://"):
    DATABASE_URL = DATABASE_URL.replace("mysql://", "mysql+pymysql://")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    # Only if we want SQLAlchemy to manage tables directly
    # Base.metadata.create_all(bind=engine)
    pass
