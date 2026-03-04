import os
import shutil
import uuid
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from database.connection import get_db, init_db
from database.models import Catalog, CatalogPdf, StagingProduct, StagingProductText, StagingProductPrice, StagingProductExtra, StagingProductImage
from pdf_processing.engine import PDFDismantleEngine
from core.config import settings

app = FastAPI(title="ContentHunter V5 Dismantler API")

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

@app.get("/api/v5/repositories")
def get_repositories(db: Session = Depends(get_db)):
    return db.query(Catalog).all()

@app.post("/api/v5/pdfs/upload")
async def upload_pdf(catalog_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    # File storage
    filename = f"{int(datetime.now().timestamp())}_{file.filename}"
    upload_path = os.path.join(settings.UPLOAD_DIR, filename)
    
    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Database record
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
    if not os.path.exists(full_path):
         raise HTTPException(status_code=404, detail="Physical PDF file missing")

    # Call AI Engine
    extracted_products = pdf_engine.dismantle_pdf(full_path)
    
    # Clear existing staging for this catalog to avoid duplicates
    db.query(StagingProduct).filter(StagingProduct.catalogId == pdf_record.catalogId).delete()
    
    imported_count = 0
    for p_data in extracted_products:
        sku = p_data.get("sku")
        if not sku:
            continue
            
        # Create staging product
        staging = StagingProduct(
            catalogId=pdf_record.catalogId,
            sku=str(sku),
            ean=str(p_data.get("ean", "")),
            brand=p_data.get("brand"),
            category=p_data.get("category")
        )
        db.add(staging)
        db.flush() # Get staging.id
        
        # Texts
        db.add(StagingProductText(
            stagingProductId=staging.id,
            title=p_data.get("title", "Prodotto senza titolo"),
            description=p_data.get("description", ""),
        ))
        
        # Prices
        if p_data.get("price"):
            db.add(StagingProductPrice(
                stagingProductId=staging.id,
                price=float(p_data.get("price"))
            ))
            
        # AI Visual Mapping (Extra fields for now)
        if p_data.get("image_bbox"):
            # Auto-crop image from PDF
            crop_path = pdf_engine.crop_product_image(
                pdf_path=full_path,
                page_number=p_data.get("pageNumber", 1),
                bbox=p_data.get("image_bbox"),
                output_dir=settings.CROPS_DIR,
                sku=str(sku)
            )
            image_url = f"/static_crops/{os.path.basename(crop_path)}"
            db.add(StagingProductImage(stagingProductId=staging.id, imageUrl=image_url))
            
            # Map coordinates for UI
            db.add(StagingProductExtra(
                stagingProductId=staging.id,
                key="_ai_visual_mapping",
                value=json.dumps({
                    "page": p_data.get("pageNumber"),
                    "bbox": p_data.get("image_bbox")
                })
            ))
            
        imported_count += 1
        
    db.commit()
    return {"success": True, "count": imported_count}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
