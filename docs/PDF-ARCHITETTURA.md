# Gestione PDF – Architettura

## Cosa usiamo

| Ruolo | Tecnologia | Uso |
|-------|------------|-----|
| **Storage e validazione** | `lib/pdf-service.ts` | Unico modulo per path, lettura, scrittura, validazione (magic %PDF, trailer %%EOF, max 50 MB). |
| **Viewer lato client** | `pdfjs-dist` (Mozilla PDF.js) | Rendering pagine, thumbnails, crop. Caricamento tramite `GET .../pdfs/[pdfId]/file` (arrayBuffer). |
| **AI (estrazione, riassunto, Q&A)** | `lib/gemini-pdf.ts` + Gemini 1.5 Pro | Estrazione prodotti, riassunto, domande sul documento (stile NotebookLM). |
| **API file** | `GET /api/repositories/[id]/pdfs/[pdfId]/file` | Restituisce il PDF solo se autorizzati; usato dal viewer invece del vecchio `?path=`. |
| **Immagini/asset** | `GET /api/storage?path=...` | Solo per immagini e asset in `public/`; i PDF del catalogo **non** passano da qui. |

## Flusso

1. **Upload**  
   `POST /api/repositories/[id]/pdfs` → `pdf-service.savePdf()` (valida + salva in `public/uploads/` e DB).

2. **Lettura**  
   Le API (extract, summarize, ask) e il client usano:
   - Server: `pdf-service.getPdfBuffer(catalogId, pdfId)`.
   - Client: `fetch("/api/repositories/{id}/pdfs/{pdfId}/file")` → `pdfjsLib.getDocument({ data: arrayBuffer })`.

3. **Eliminazione**  
   `DELETE /api/repositories/[id]/pdfs/[pdfId]` → `pdf-service.deletePdf()` (file + record DB).

## Vantaggi

- **Un solo posto** per path e validazione (`lib/pdf-service.ts`).
- **PDF protetti**: il file si scarica solo con auth tramite `/file`.
- **Niente path in query** per i PDF: si usa sempre `catalogId` + `pdfId`.
- **Stesso limite e stesse regole** (50 MB, %PDF, %%EOF) in upload e in serve.
