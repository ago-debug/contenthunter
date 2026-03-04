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
    active_step: int = 0  # 0: Dashboard, 1: Source, 2: Vision, 3: Extraction, 4: Matcher, 5: Editor, 6: ERP
    
    # Dashboard state
    catalogs: List[CatalogEntry] = []
    selected_catalog_id: int = 0
    new_catalog_name: str = ""
    
    # Master PIM state
    master_products: List[Dict[str, Any]] = []
    total_master_products: int = 0
    search_term: str = ""
    brand_filter: str = "all"
    category_filter: str = "all"
    current_page_master: int = 1
    
    # Editor State
    selected_product_details: Dict[str, Any] = {}
    is_editor_open: bool = False
    active_editor_tab: str = "info" # info, images, seo, attributes
    is_generating_ai: bool = False

    available_brands: List[Dict[str, Any]] = []
    available_categories: List[Dict[str, Any]] = []

    # Dismantler state
    uploaded_files: List[str] = []
    products: List[Product] = [] # Staging products from current session
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
    # Local check for dev, otherwise standard
    BACKEND_URL: str = "http://backend:8000"

    @rx.var
    def page_list(self) -> List[int]:
        return list(range(1, self.pdf_num_pages + 1))

    async def get_catalogs(self):
        """Initial load of repositories and filters."""
        import httpx
        async with httpx.AsyncClient() as client:
            # 1. Catalogs
            try:
                resp = await client.get(f"{self.BACKEND_URL}/api/v5/repositories")
                if resp.status_code == 200:
                    data = resp.json()
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
            except: pass

            # 2. Brands & Categories for filters
            try:
                resp_b = await client.get(f"{self.BACKEND_URL}/api/v5/brands")
                if resp_b.status_code == 200: self.available_brands = resp_b.json()
                
                resp_c = await client.get(f"{self.BACKEND_URL}/api/v5/categories")
                if resp_c.status_code == 200: self.available_categories = resp_c.json()
            except: pass

    async def get_master_products(self):
        """Fetch production products from PIM."""
        import httpx
        params = {
            "page": self.current_page_master,
            "search": self.search_term if self.search_term else None,
            "brand": self.brand_filter,
            "category": self.category_filter
        }
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(f"{self.BACKEND_URL}/api/v5/products", params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    self.master_products = data["products"]
                    self.total_master_products = data["total"]
            except Exception as e:
                return rx.toast.error(f"Errore PIM: {str(e)}")

    async def open_product_editor(self, sku: str):
        """Fetch full details and open modal."""
        import httpx
        self.is_editor_open = True
        self.active_editor_tab = "info"
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(f"{self.BACKEND_URL}/api/v5/products/{sku}")
                if resp.status_code == 200:
                    self.selected_product_details = resp.json()
                else:
                    self.is_editor_open = False
                    return rx.toast.error("Impossibile caricare il prodotto.")
            except:
                self.is_editor_open = False

    def close_editor(self):
        self.is_editor_open = False
        self.selected_product_details = {}

    def set_editor_tab(self, tab: str):
        self.active_editor_tab = tab

    def update_product_field(self, field: str, value: Any, subfield: str = None):
        """Guru dynamic update of nested dictionary state."""
        if subfield:
            if field not in self.selected_product_details: self.selected_product_details[field] = {}
            self.selected_product_details[field][subfield] = value
        else:
            self.selected_product_details[field] = value

    async def generate_ai_description(self):
        """Call Python backend for AI Content Generation."""
        self.is_generating_ai = True
        yield # Force UI update
        import httpx
        try:
            # We use the existing AI logic but adapted for the Master PIM
            resp = await httpx.post(
                f"{self.BACKEND_URL}/api/v5/ai/describe",
                json={"product_data": self.selected_product_details},
                timeout=60.0 # AI can be slow
            )
            if resp.status_code == 200:
                ai_data = resp.json()
                # Update IT translation with AI results
                it_text = self.selected_product_details.get("translations", {}).get("it", {})
                it_text["description"] = ai_data.get("description", it_text.get("description"))
                it_text["seoAiText"] = ai_data.get("seoAiText", it_text.get("seoAiText"))
                
                self.selected_product_details["translations"]["it"] = it_text
                rx.toast.success("AI Content generato con successo!")
        except Exception as e:
            rx.toast.error(f"AI Error: {str(e)}")
        finally:
            self.is_generating_ai = False

    async def save_product_changes(self):
        """Save PIM Master record."""
        import httpx
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"{self.BACKEND_URL}/api/v5/products/save",
                    json=self.selected_product_details
                )
                if resp.status_code == 200:
                    rx.toast.success("Prodotto Master aggiornato.")
                    self.is_editor_open = False
                    return State.get_master_products
                else:
                    rx.toast.error("Errore durante il salvataggio.")
            except: pass

    def set_filter(self, key: str, value: str):
        if key == "search": self.search_term = value
        elif key == "brand": self.brand_filter = value
        elif key == "category": self.category_filter = value
        self.current_page_master = 1
        return State.get_master_products

    def select_catalog(self, catalog_id: int):
        self.selected_catalog_id = catalog_id
        self.active_step = 1 # Go to upload
        return rx.toast.info(f"Catalogo {catalog_id} selezionato.")

    def set_step(self, step: int):
        self.active_step = step
        if step == 6: # Master ERP / PIM Phase
            return State.get_master_products
