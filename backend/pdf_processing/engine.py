import os
import fitz  # PyMuPDF
import json
import base64
import google.generativeai as genai
from PIL import Image
from io import BytesIO
from typing import List, Dict, Any

class PDFDismantleEngine:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-1.5-pro")

    def dismantle_pdf(self, pdf_path: str) -> List[Dict[str, Any]]:
        """
        Uses Gemini to identify products and their locations in the PDF.
        """
        with open(pdf_path, "rb") as f:
            pdf_data = f.read()
            pdf_base64 = base64.b64encode(pdf_data).decode("utf-8")

        prompt = """
        Sei l'AI "ContentHunter Dismantler". Il tuo compito è smontare completamente questo catalogo PDF.
        Analizza visivamente la struttura delle pagine e i testi.
        
        Per ogni prodotto individuato, restituisci un oggetto JSON strutturato.
        
        REGOLE:
        1. Identifica SKU, EAN, Titolo, Descrizione, Prezzo e Brand.
        2. ESTRAZIONE TESTI: Prendi tutti i testi tecnici e inseriscili in 'extraFields'.
        3. MAPPATURA PAGINA: Indica il numero di pagina (1-indexed).
        4. IMAGE BBOX: Fornisci le coordinate [ymin, xmin, ymax, xmax] (valori 0-1000) dell'immagine del prodotto.
        
        FORMATO JSON:
        {
          "products": [
            {
              "sku": "string",
              "ean": "string",
              "title": "string",
              "description": "string",
              "price": number,
              "brand": "string",
              "category": "string",
              "pageNumber": number,
              "image_bbox": [ymin, xmin, ymax, xmax],
              "extraFields": [{"key": "string", "value": "string"}]
            }
          ]
        }
        """

        response = self.model.generate_content([
            {"mime_type": "application/pdf", "data": pdf_base64},
            prompt
        ], generation_config={"response_mime_type": "application/json"})

        try:
            result = json.loads(response.text)
            return result.get("products", [])
        except Exception as e:
            print(f"Error parsing AI response: {e}")
            return []

    def crop_product_image(self, pdf_path: str, page_number: int, bbox: List[float], output_dir: str, sku: str) -> str:
        """
        Extracts a high-resolution image from the PDF based on AI coordinates.
        Coordinates are expected to be 0-1000 scaled.
        """
        doc = fitz.open(pdf_path)
        # page_number is 1-indexed from AI
        page = doc[page_number - 1]
        
        # Convert 0-1000 coordinates to PDF points
        w, h = page.rect.width, page.rect.height
        ymin, xmin, ymax, xmax = bbox
        
        rect = fitz.Rect(
            xmin * w / 1000,
            ymin * h / 1000,
            xmax * w / 1000,
            ymax * h / 1000
        )
        
        # Increase resolution with Matrix (e.g., 200% scale)
        mat = fitz.Matrix(3, 3) 
        pix = page.get_pixmap(clip=rect, matrix=mat, alpha=False)
        
        filename = f"crop_{sku}_{page_number}.png"
        filepath = os.path.join(output_dir, filename)
        
        pix.save(filepath)
        doc.close()
        return filepath
