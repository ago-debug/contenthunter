import os
import sys
import shutil
import uuid
import json
import logging
from datetime import datetime

# --- EMERGENCY LOGGING ---
print(f"--- [BACKEND BOOT] {datetime.now()} ---")
# Aggiunta manuale del path della root e della cartella backend
try:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(current_dir)
    if current_dir not in sys.path:
        sys.path.append(current_dir)
    if root_dir not in sys.path:
        sys.path.append(root_dir)
    print(f"Paths added: {current_dir}, {root_dir}")
except Exception as e:
    print(f"Path Error: {e}")

try:
    from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
    from fastapi.middleware.cors import CORSMiddleware
    from sqlalchemy.orm import Session
    from sqlalchemy import func, or_
    
    # Import locali
    from database.connection import get_db, init_db
    from database.models import Product, Brand, Category, Catalog
    from core.config import settings
    print("Core modules loaded successfully")
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
    print("Verifica database...")
    try:
        init_db()
        print("Database connesso.")
    except Exception as e:
        print(f"DATABASE CONNECTION FAILED: {str(e)}")

# Routes semplificate per test
@app.get("/api/v5/health")
def health_check():
    return {"status": "ok", "backend": "online"}

@app.get("/api/v5/repositories")
def get_repositories(db: Session = Depends(get_db)):
    try:
        return db.query(Catalog).all()
    except Exception as e:
        print(f"DB Fetch Error: {e}")
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
                "title": text_it.title if text_it else "Prodotto",
                "brand": p.brand,
                "price": p.prices[0].price if p.prices else 0.0,
            })
        return results
    except Exception as e:
        print(f"DB Products Error: {e}")
        return []

if __name__ == "__main__":
    import uvicorn
    print("Avvio server su porta 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
