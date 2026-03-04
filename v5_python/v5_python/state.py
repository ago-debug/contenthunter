import reflex as rx
from typing import List, Dict, Any, Optional
import json
import os
from datetime import datetime
import fitz  # PyMuPDF
import google.generativeai as genai
import base64

import pydantic

class CatalogEntry(pydantic.BaseModel):
    id: int
    name: str
    status: str = "draft"
    createdAt: str = ""
    pdf_count: int = 0
    product_count: int = 0

class Product(pydantic.BaseModel):
    sku: str
    ean: str = ""
    title: str = ""
    description: str = ""
    price: float = 0.0
    page: int = 1
    image_url: str = ""
    is_saved: bool = False

class State(rx.State):
    """The app state."""
    active_step: int = 0  # 0: Dashboard, 1: Source, 2: Vision, 3: Extraction
    
    # Dashboard state
    catalogs: List[CatalogEntry] = []
    selected_catalog_id: int = 0
    new_catalog_name: str = ""
    
    # Dismantler state
    uploaded_files: List[str] = []
    products: List[Product] = []
    is_loading: bool = False
    current_pdf_url: str = ""
    pdf_num_pages: int = 0
    current_page: int = 1
    crop_preview_url: str = ""
    
    # AI Engine Config
    is_extracting: bool = False
    extraction_progress: int = 0
    total_products_found: int = 0

    # Backend connection
    BACKEND_URL: str = "http://backend:8000"

    @rx.var
    def page_list(self) -> List[int]:
        return list(range(1, self.pdf_num_pages + 1))

    async def get_catalogs(self):
        """Fetch catalogs from FastAPI backend."""
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.BACKEND_URL}/api/v5/repositories")
                if response.status_code == 200:
                    data = response.json()
                    self.catalogs = [
                        CatalogEntry(
                            id=c["id"], 
                            name=c["name"], 
                            status=c["status"],
                            createdAt=c["createdAt"][:10] if c.get("createdAt") else "",
                            pdf_count=c.get("pdf_count", 0),
                            product_count=c.get("product_count", 0)
                        ) for c in data
                    ]
        except Exception as e:
            return rx.toast.error(f"Errore caricamento cataloghi: {str(e)}")

    def select_catalog(self, catalog_id: int):
        """Choose a catalog and go to its dashboard."""
        self.selected_catalog_id = catalog_id
        # In a real app we'd load details here
        self.active_step = 1 # Lead to file upload for that catalog
        return rx.toast.info(f"Catalogo selezionato (ID: {catalog_id})")

    def create_catalog(self):
        """Create a new catalog."""
        # TODO: Implement POST in backend
        return rx.toast.warning("Funzione creazione in fase di sviluppo.")

    def back_to_dashboard(self):
        self.active_step = 0

    def next_step(self):
        if self.active_step < 3:
            self.active_step += 1

    async def handle_upload(self, files: List[rx.UploadFile]):
        """Handle PDF / XLSX upload."""
        self.is_loading = True
        for file in files:
            # We save the file to the assets/ folder for direct serving
            content = await file.read()
            filename = f"{int(datetime.now().timestamp())}_{file.filename}"
            filepath = os.path.join("assets", filename)
            
            with open(filepath, "wb") as f:
                f.write(content)
            
            if file.filename.endswith(".pdf"):
                self.uploaded_files.append(filename)
                self.current_pdf_url = filename
                # Get PDF info
                doc = fitz.open(filepath)
                self.pdf_num_pages = doc.page_count
                doc.close()
                self.active_step = 2 # Auto move to Vision
                
        self.is_loading = False
        return rx.toast.success("File caricato e analizzato dal motore V5.")

    def run_dismantle(self):
        """Execute AI Dismantling."""
        self.is_extracting = True
        # In a real app, we'd call Gemini here.
        # For now, let's simulate findings.
        self.products = [
            Product(sku="ART-101", title="Sedia Ergonomica Pro", price=129.90, page=1),
            Product(sku="ART-202", title="Lampada Design Orion", price=89.00, page=2),
            Product(sku="ART-303", title="Scrivania Minimal X", price=245.00, page=3),
        ]
        self.total_products_found = len(self.products)
        self.is_extracting = False
        self.active_step = 3
        return rx.toast.success("Smontaggio completato: 3 prodotti identificati.")

    def select_product(self, sku: str):
        """Select a product for visual mapping."""
        # Selection logic...
        pass

    def delete_pdf(self, filename: str):
        self.uploaded_files = [f for f in self.uploaded_files if f != filename]
        if self.current_pdf_url == filename:
            self.current_pdf_url = ""
            self.active_step = 1
