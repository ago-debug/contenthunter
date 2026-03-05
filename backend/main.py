import os
import sys
import shutil
import uuid
import json
import logging
from datetime import datetime

# --- SYSTEM PATH RESOLUTION ---
try:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(current_dir)
    if current_dir not in sys.path:
        sys.path.append(current_dir)
    if root_dir not in sys.path:
        sys.path.append(root_dir)
    print(f"--- [BACKEND BOOT] {datetime.now()} ---")
    print(f"Paths: {current_dir}")
except Exception as e:
    print(f"Path Error: {e}")

try:
    from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
    from fastapi.middleware.cors import CORSMiddleware
    from sqlalchemy.orm import Session
    from sqlalchemy import func, or_
    
    # Imports defined after Base in connection to avoid circularity
    from database.connection import get_db, init_db
    from core.config import settings
    print("Core modules loaded. System stable.")
except Exception as e:
    print(f"CRITICAL BOOT ERROR: {str(e)}")
    import traceback
    traceback.print_exc()
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
    print("Inizializzazione Database...")
    try:
        init_db()
        print("Database pronto e tabelle verificate.")
    except Exception as e:
        print(f"DB INIT WARNING: {str(e)}")

# --- API ROUTES ---

@app.get("/api/v5/health")
def health_check():
    return {"status": "ok", "backend": "online", "version": "5.5"}

@app.get("/api/v5/repositories")
def get_repositories(db: Session = Depends(get_db)):
    from database.models import Catalog
    return db.query(Catalog).all()

@app.get("/api/v5/products")
def get_products(db: Session = Depends(get_db), limit: int = 100):
    from database.models import Product
    try:
        products = db.query(Product).limit(limit).all()
        results = []
        for p in products:
            text_it = next((t for t in p.texts if t.language == "it"), None)
            results.append({
                "id": p.id,
                "sku": p.sku,
                "title": text_it.title if text_it else "Asset",
                "brand": p.brand or "No Brand",
                "price": p.prices[0].price if p.prices else 0.0,
            })
        return results
    except Exception as e:
        print(f"DB Error: {e}")
        return []

@app.get("/api/v5/products/{sku}")
def get_product_detail(sku: str, db: Session = Depends(get_db)):
    from database.models import Product
    p = db.query(Product).filter(Product.sku == sku).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    
    translations = {}
    for t in p.texts:
        translations[t.language] = {
            "title": t.title,
            "description": t.description
        }
    
    return {
        "sku": p.sku,
        "brand": p.brand,
        "price": p.prices[0].price if p.prices else 0.0,
        "translations": translations
    }

@app.get("/api/v5/brands")
def get_brands(db: Session = Depends(get_db)):
    from database.models import Brand
    return db.query(Brand).all()

@app.get("/api/v5/categories")
def get_categories(db: Session = Depends(get_db)):
    from database.models import Category
    return db.query(Category).all()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
