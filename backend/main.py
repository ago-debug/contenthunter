import os
import sys
import shutil
import uuid
import json
import logging
from datetime import datetime

# AGGIUNTA DINAMICA DEL PATH PER EVITARE ERRORI DI IMPORTAZIONE SU VPS
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

print(f"--- BACKEND STARTING AT {datetime.now()} ---")
print(f"Current Directory: {current_dir}")
print(f"Python Sys Path: {sys.path}")

try:
    from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from sqlalchemy.orm import Session
    from sqlalchemy import func, or_
    from typing import List, Optional, Dict, Any
    
    # Import locali protetti
    from database.connection import get_db, init_db
    from database.models import Product, Brand, Category, Catalog
    from core.config import settings
    print("Dependencies imported successfully")
except Exception as e:
    print(f"CRITICAL IMPORT ERROR: {str(e)}")
    sys.exit(1)

app = FastAPI(title="ContentHunter V5 - Master PIM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    print("Database initialization...")
    try:
        init_db()
        print("Database READY")
    except Exception as e:
        print(f"DATABASE ERROR: {str(e)}")

@app.get("/api/v5/health")
def health_check():
    return {"status": "ok", "engine": "active"}

@app.get("/api/v5/repositories")
def get_repositories(db: Session = Depends(get_db)):
    try:
        return db.query(Catalog).all()
    except Exception as e:
        print(f"API ERROR (Repos): {str(e)}")
        return []

@app.get("/api/v5/products")
def get_products(db: Session = Depends(get_db), limit: int = 50):
    try:
        products = db.query(Product).limit(limit).all()
        results = []
        for p in products:
            text_it = next((t for t in p.texts if t.language == "it"), None)
            results.append({
                "id": p.id,
                "sku": p.sku,
                "title": text_it.title if text_it else "Prodotto senza titolo",
                "brand": p.brand,
                "price": p.prices[0].price if p.prices else 0.0,
            })
        return results
    except Exception as e:
        print(f"API ERROR (Products): {str(e)}")
        return []

@app.get("/api/v5/brands")
def get_brands(db: Session = Depends(get_db)):
    return db.query(Brand).all()

@app.get("/api/v5/categories")
def get_categories(db: Session = Depends(get_db)):
    return db.query(Category).all()

if __name__ == "__main__":
    import uvicorn
    print("Starting uvicorn on 0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
