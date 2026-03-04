import os
import shutil
import uuid
import json
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional, Dict, Any
from datetime import datetime

from database.connection import get_db, init_db
from database.models import (
    Catalog, CatalogPdf, Category, Brand, Tag, 
    Product, ProductText, ProductPrice, ProductExtra, ProductImage, ProductHistory,
    StagingProduct, StagingProductText, StagingProductPrice, StagingProductExtra, StagingProductImage
)
from pdf_processing.engine import PDFDismantleEngine
from core.config import settings

app = FastAPI(title="ContentHunter V5 - Master PIM API")

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Engine
pdf_engine = PDFDismantleEngine(api_key=settings.GEMINI_API_KEY)

# --- REPOSITORY & CATALOGS ---

@app.get("/api/v5/repositories")
def get_repositories(db: Session = Depends(get_db)):
    catalog_stats = db.query(
        Catalog.id,
        Catalog.name,
        Catalog.status,
        Catalog.createdAt,
        func.count(CatalogPdf.id).label("pdf_count")
    ).outerjoin(CatalogPdf, Catalog.id == CatalogPdf.catalogId)\
    .group_by(Catalog.id).all()
    
    results = []
    for c in catalog_stats:
        p_count = db.query(StagingProduct).filter(StagingProduct.catalogId == c.id).count()
        results.append({
            "id": c.id,
            "name": c.name,
            "status": c.status,
            "createdAt": c.createdAt.isoformat() if c.createdAt else None,
            "pdf_count": c.pdf_count,
            "product_count": p_count
        })
    return results

# --- MASTER PIM PRODUCTS (The Core) ---

@app.get("/api/v5/products")
def get_products(
    db: Session = Depends(get_db),
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    brand: Optional[str] = None,
    category: Optional[str] = None
):
    query = db.query(Product)
    
    if search:
        search_filter = or_(
            Product.sku.ilike(f"%{search}%"),
            Product.ean.ilike(f"%{search}%"),
            Product.brand.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)
    
    if brand and brand != "all":
        query = query.filter(Product.brand == brand)
    
    if category and category != "all":
        query = query.filter(or_(
            Product.category == category,
            Product.categoryId == int(category) if category.isdigit() else False
        ))

    total = query.count()
    products = query.offset((page - 1) * limit).limit(limit).all()
    
    results = []
    for p in products:
        # Load main translation (IT)
        text_it = next((t for t in p.texts if t.language == "it"), None)
        image_main = next((img.imageUrl for img in p.images), None)
        
        results.append({
            "id": p.id,
            "sku": p.sku,
            "ean": p.ean,
            "title": text_it.title if text_it else "Untitled",
            "description": text_it.description if text_it else "",
            "brand": p.brand,
            "category": p.category,
            "price": p.prices[0].price if p.prices else 0.0,
            "imageUrl": image_main
        })
        
    return {"total": total, "products": results}

@app.get("/api/v5/products/{sku}")
def get_product_detail(sku: str, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.sku == sku).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    
    translations = {}
    for t in p.texts:
        translations[t.language] = {
            "title": t.title,
            "description": t.description,
            "bulletPoints": t.bulletPoints,
            "seoAiText": t.seoAiText
        }
        
    return {
        "id": p.id,
        "sku": p.sku,
        "ean": p.ean,
        "brand": p.brand,
        "category": p.category,
        "categoryId": p.categoryId,
        "subCategoryId": p.subCategoryId,
        "subSubCategoryId": p.subSubCategoryId,
        "translations": translations,
        "images": [img.imageUrl for img in p.images],
        "extraFields": {ef.key: ef.value for ef in p.extra_fields},
        "prices": [{"list": pr.listName, "price": pr.price} for pr in p.prices]
    }

# --- PDF PROCESSING (Dismantle) ---

@app.post("/api/v5/pdfs/upload")
async def upload_pdf(catalog_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    filename = f"{int(datetime.now().timestamp())}_{file.filename}"
    upload_path = os.path.join(settings.UPLOAD_DIR, filename)
    
    with os.makedirs(os.path.dirname(upload_path), exist_ok=True):
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    
    new_pdf = CatalogPdf(
        catalogId=catalog_id,
        fileName=file.filename,
        filePath=f"/uploads/{filename}",
        processed=False
    )
    db.add(new_pdf)
    db.commit()
    db.refresh(new_pdf)
    
    return {"id": new_pdf.id, "fileName": new_pdf.fileName}

@app.post("/api/v5/pdfs/{pdf_id}/dismantle")
async def dismantle_pdf(pdf_id: int, db: Session = Depends(get_db)):
    pdf_record = db.query(CatalogPdf).filter(CatalogPdf.id == pdf_id).first()
    if not pdf_record:
        raise HTTPException(status_code=404, detail="PDF not found")
        
    full_path = os.path.join(settings.PUBLIC_DIR, pdf_record.filePath.lstrip("/"))
    extracted_products = pdf_engine.dismantle_pdf(full_path)
    
    db.query(StagingProduct).filter(StagingProduct.catalogId == pdf_record.catalogId).delete()
    
    for p_data in extracted_products:
        sku = p_data.get("sku")
        if not sku: continue
            
        staging = StagingProduct(
            catalogId=pdf_record.catalogId,
            sku=str(sku),
            ean=str(p_data.get("ean", "")),
            brand=p_data.get("brand"),
            category=p_data.get("category")
        )
        db.add(staging)
        db.flush()
        
        db.add(StagingProductText(
            stagingProductId=staging.id,
            title=p_data.get("title", "Prodotto senza titolo"),
            description=p_data.get("description", ""),
        ))
        
        if p_data.get("price"):
            db.add(StagingProductPrice(stagingProductId=staging.id, price=float(p_data.get("price"))))
            
        if p_data.get("image_bbox"):
            crop_path = pdf_engine.crop_product_image(
                pdf_path=full_path,
                page_number=p_data.get("pageNumber", 1),
                bbox=p_data.get("image_bbox"),
                output_dir=settings.CROPS_DIR,
                sku=str(sku)
            )
            image_url = f"/static_crops/{os.path.basename(crop_path)}"
            db.add(StagingProductImage(stagingProductId=staging.id, imageUrl=image_url))
            
    db.commit()
    return {"success": True, "count": len(extracted_products)}

# --- HELPER APIS (Categories, Brands) ---

@app.get("/api/v5/categories")
def get_categories(db: Session = Depends(get_db)):
    cats = db.query(Category).all()
    return [{"id": c.id, "name": c.name, "parentId": c.parentId} for c in cats]

@app.get("/api/v5/brands")
def get_brands(db: Session = Depends(get_db)):
    brands = db.query(Brand).all()
    return [{"id": b.id, "name": b.name, "logoUrl": b.logoUrl} for b in brands]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
