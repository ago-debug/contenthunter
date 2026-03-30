# Guida alle integrazioni via API (Content Hunter / PDF Catalog)

Questo documento descrive come integrare sistemi esterni con le **REST API** dell’applicazione Next.js: autenticazione, multi-tenant, header obbligatori e limitazioni attuali.

---

## 1. Panoramica

| Aspetto | Comportamento |
|--------|----------------|
| **Base URL** | L’URL pubblico dell’installazione (es. `https://contenthunter.abreve.it`) |
| **Formato** | Route `app/api/**/route.ts` → endpoint HTTP REST (`GET`, `POST`, `PATCH`, `DELETE`, …) |
| **Formato body** | Di norma **JSON** (`Content-Type: application/json`) salvo upload file |
| **Autenticazione** | **Sessione NextAuth** tramite **cookie HTTP** (JWT in sessione). Non è prevista una API key globale per integrazioni machine-to-machine. |
| **Segreto** | In **produzione** la variabile **`NEXTAUTH_SECRET`** è obbligatoria (stringa casuale lunga; es. `openssl rand -base64 32`). Non usare valori predefiniti nel codice. |
| **Proxy immagini** | Opzionale: **`PROXY_IMAGE_ALLOWED_HOSTS`** (host separati da virgola, es. `cdn.example.com,img.shop.com`) per limitare i domini scaricabili da `/api/proxy-image`. |

---

## 2. Autenticazione

### 2.1 Modello attuale

- Dopo il login (`POST /api/auth/callback/credentials` tramite flusso NextAuth), il browser riceve un **cookie di sessione**.
- Le chiamate successive a `/api/*` devono **includere quel cookie** (stesso dominio / configurazione CORS e `credentials`).

### 2.2 Richieste dal browser (SPA / stesso sito)

Usare sempre **`credentials: 'include'`** (fetch) o **`withCredentials: true`** (axios) così il cookie viene inviato:

```javascript
const res = await fetch(`${baseUrl}/api/products`, {
  method: "GET",
  credentials: "include",
  headers: {
    Accept: "application/json",
    "x-company-id": String(companyId), // se admin globale, vedi §3
  },
});
```

### 2.3 Richieste da server o script esterni (cron, ERP, microservizi)

Oggi l’app **non espone** un token Bearer dedicato per integrazioni. Opzioni pratiche:

1. **Sessione programmatica**: effettuare il login (credentials) e riutilizzare i cookie in una sessione HTTP persistente (jar cookie) — fragile e da valutare con cautela (MFA, policy password).
2. **Reverse proxy / rete privata**: esporre solo verso IP fidati e inoltrare cookie o sessione già stabilita.
3. **Evolutiva consigliata**: introdurre **API key** o **OAuth2 client credentials** lato applicazione (non ancora implementato in questo repository).

Fino a quando non esiste un meccanismo dedicato, trattare le API come **protette da sessione utente**, non come API pubbliche anonime.

### 2.4 Endpoint senza login (pubblici)

Il middleware consente senza token solo percorsi espliciti, tra cui:

- `POST /api/register` — registrazione utente (se abilitata in produzione)
- `GET/POST /api/auth/*` — flusso NextAuth
- `GET /api/storage?path=...` — file sotto `public/` (vedi policy sicurezza)
- `GET /api/proxy-image?url=...` — **richiede sessione**; validazione anti-SSRF (IP privati bloccati, opzionale allowlist `PROXY_IMAGE_ALLOWED_HOSTS`)

Tutto il resto sotto `/api/*` richiede **sessione valida** → altrimenti **401** a livello middleware.

---

## 3. Multi-tenant: `companyId` e header `x-company-id`

Le API che operano su dati aziendali usano helper in `lib/auth-api.ts`.

| Ruolo utente | Comportamento |
|--------------|----------------|
| Utente **legato a un’azienda** | Il `companyId` viene preso dalla **sessione** (`session.user.companyId`). Gli header/query di contesto sono in genere **ignorati** per l’accesso ai dati. |
| **Admin globale** (`companyId` null) | Deve indicare **per ogni richiesta** l’azienda su cui agire tramite **`x-company-id: <id numerico>`** oppure query **`?companyId=<id>`**. Se manca → spesso **403** o risposta vuota. |

Esempio admin globale:

```http
GET /api/brands HTTP/1.1
Host: esempio.it
Cookie: next-auth.session-token=...
x-company-id: 42
```

In **axios** (es. da pannello interno):

```javascript
axios.defaults.headers.common["x-company-id"] = selectedCompanyId;
```

---

## 4. Convenzioni delle risposte

Pattern ricorrenti nel codice:

| HTTP | Significato tipico |
|------|---------------------|
| `200` / `201` | Successo |
| `400` | Body/query non validi |
| `401` | Non autenticato (nessun cookie / sessione scaduta) |
| `403` | Autenticato ma non autorizzato (permessi, company mancante, risorsa altra azienda) |
| `404` | Risorsa inesistente |
| `409` | Conflitto (es. duplicati) |
| `500` | Errore server |

Corpo JSON di errore spesso include `{ "error": "messaggio" }` o `details` — dipende dalla route.

---

## 5. Aree funzionali (indicative, non esaustivo)

Le route sono organizzate per dominio:

| Prefisso / area | Contenuto indicativo |
|-----------------|----------------------|
| `/api/products`, `/api/products/[id]`, bulk, export | Prodotti Master ERP |
| `/api/brands`, `/api/categories`, `/api/tags`, `/api/vat-codes`, `/api/bullets` | Tabelle anagrafiche |
| `/api/catalogues`, `/api/repositories/[id]/...` | Cataloghi PDF, staging, PDF, immagini |
| `/api/company/integration-settings` | Impostazioni integrazione (WooCommerce, chiavi AI lato server) |
| `/api/integrations/woocommerce/*` | Flussi WooCommerce |
| `/api/ai/*`, `/api/search-images` | Funzioni AI (richiedono chiavi configurate per azienda) |
| `/api/activities/*` | Log attività, job SEO bulk |
| `/api/users`, `/api/profiles`, `/api/companies` | Amministrazione utenti/profili/aziende |
| `/api/scraping/*` | Progetti scraping e job |
| `/api/export` | Export dati (filtri lato client/server) |

Per il dettaglio dei metodi HTTP e dei campi, aprire il file `route.ts` corrispondente sotto `app/api/`.

---

## 6. Upload file

- Upload tipicamente tramite `multipart/form-data` o invio base64 secondo la route (es. logo brand, PDF, immagini).
- Richiedono sessione valida e, dove applicabile, `requireCompanyId` / controllo catalogo.
- Limiti di dimensione e validazione sono definiti per endpoint (es. `lib/pdf-service.ts` per PDF).

---

## 7. Integrazione con WooCommerce (riferimento)

Esiste integrazione dedicata sotto `/api/integrations/woocommerce` (import/sync). Per configurazione store e credenziali usare l’interfaccia **Impostazioni integrazione** per azienda e le API che leggono/aggiornano `Company` (campi dominio, consumer key/secret lato DB).

---

## 8. Sicurezza e buone pratiche per integrazioni

1. **HTTPS** obbligatorio in produzione.
2. **`NEXTAUTH_SECRET`** obbligatorio in produzione (nessun valore fisso nel codice); generare con `openssl rand -base64 32` e impostarlo nel server / Plesk / CI prima di `next build`.
3. **`/api/proxy-image`**: richiede **sessione**; blocca URL verso IP privati/metadata; opzionale **`PROXY_IMAGE_ALLOWED_HOSTS`** (host separati da virgola) per limitare i domini.
4. **`/api/storage`**: ancora pubblico per compatibilità PDF worker; non mettere file sensibili sotto `public/`.
5. Per integrazioni esterne future: preferire **rete privata**, **allowlist IP**, **rate limiting** a livello reverse proxy.
6. Validare sempre **input** lato chiamante; il server applica controlli per tenant ma non sostituisce un contratto API formale (OpenAPI non generato automaticamente qui).

---

## 9. Riferimenti nel codice

| File | Contenuto |
|------|-----------|
| `middleware.ts` | Quali path API sono pubblici vs protetti |
| `lib/auth-api.ts` | `requireCompanyId`, `ensureCatalogAccess`, `getCompanyIdFromRequest` |
| `lib/auth-options.ts` | Provider credentials e sessione JWT |
| `app/api/**/route.ts` | Definizione effettiva di ogni endpoint |

---

## 10. Roadmap suggerita (fuori scope attuale)

- Ampliare **`docs/openapi-skeleton.yaml`** (scheletro OpenAPI 3 già presente) fino a copertura completa.
- **API key** per sistemi esterni con scope per `companyId`.
- Webhook in uscita (eventi prodotto, ordine) con firma HMAC.

Per domande su un endpoint specifico, il contratto “verità” resta il file `route.ts` corrispondente nella cartella `app/api/`.

---

## 11. Riferimento endpoint (metodi HTTP)

Tabella derivata dagli `export` in `app/api/**/route.ts` (aggiornare se si aggiungono route).  
I segmenti `{id}`, `{pdfId}`, `{productId}` sono **parametri di percorso**.

| Percorso | Metodi |
|----------|--------|
| `/api/activities` | GET |
| `/api/activities/ai-bulk-seo-jobs` | POST, GET |
| `/api/activities/ai-bulk-seo-jobs/{id}` | GET, PATCH |
| `/api/activities/ai-bulk-seo-jobs/{id}/report` | GET |
| `/api/ai/describe` | POST |
| `/api/ai/suggest-product-title` | POST |
| `/api/ai/translate` | POST |
| `/api/auth/[...nextauth]` | GET, POST (NextAuth: login, callback, session, CSRF) |
| `/api/brands` | GET, POST |
| `/api/brands/bulk` | POST |
| `/api/brands/upload-logo` | POST |
| `/api/brands/{id}` | GET, PUT, DELETE |
| `/api/bullets` | GET, POST |
| `/api/bullets/{id}` | PUT, DELETE |
| `/api/catalogues` | GET, POST |
| `/api/catalogues/deep-search` | GET |
| `/api/catalogues/google-shopping` | GET |
| `/api/catalogues/sync-pages` | POST |
| `/api/catalogues/{id}` | GET, PATCH, DELETE |
| `/api/catalogues/{id}/extra-fields` | GET, POST |
| `/api/catalogues/{id}/page-matches` | GET |
| `/api/catalogues/{id}/pages` | GET |
| `/api/categories` | GET, POST |
| `/api/categories/bulk` | POST |
| `/api/categories/{id}` | PUT, DELETE |
| `/api/companies` | GET, POST |
| `/api/companies/{id}` | GET, PUT, DELETE |
| `/api/company/integration-settings` | GET, PATCH |
| `/api/debug-db` | GET |
| `/api/export` | GET, POST |
| `/api/fix-auth` | GET |
| `/api/integrations/woocommerce` | GET, POST |
| `/api/integrations/woocommerce/import` | POST |
| `/api/products` | POST, GET, DELETE |
| `/api/products/bulk` | POST |
| `/api/products/export-selected` | POST |
| `/api/products/seo-bulk` | POST |
| `/api/products/{id}/ambient-image` | POST |
| `/api/products/{id}/history` | GET |
| `/api/products/{id}/image-from-crop` | POST |
| `/api/profiles` | GET, POST |
| `/api/profiles/{id}` | GET, PUT, DELETE |
| `/api/proxy-image` | GET (sessione richiesta; anti-SSRF; vedi `lib/proxy-image-url.ts`) |
| `/api/register` | POST (pubblico) |
| `/api/repositories/scan-images` | GET |
| `/api/repositories/{id}/associate-images` | POST |
| `/api/repositories/{id}/images` | GET |
| `/api/repositories/{id}/pdfs` | POST |
| `/api/repositories/{id}/pdfs/{pdfId}` | DELETE |
| `/api/repositories/{id}/pdfs/{pdfId}/ask` | POST |
| `/api/repositories/{id}/pdfs/{pdfId}/extract` | POST |
| `/api/repositories/{id}/pdfs/{pdfId}/file` | GET |
| `/api/repositories/{id}/pdfs/{pdfId}/summarize` | GET |
| `/api/repositories/{id}/staging` | GET, POST, DELETE |
| `/api/repositories/{id}/staging-image` | POST |
| `/api/repositories/{id}/staging/bulk` | POST |
| `/api/repositories/{id}/staging/bulk-title` | POST |
| `/api/repositories/{id}/staging/{productId}` | PUT |
| `/api/repositories/{id}/staging/{productId}/image-crop` | POST |
| `/api/repositories/{id}/staging/{productId}/images` | POST, DELETE |
| `/api/scraping/jobs` | GET, POST |
| `/api/scraping/jobs/{id}` | DELETE |
| `/api/scraping/jobs/{id}/import` | POST |
| `/api/scraping/jobs/{id}/results` | GET |
| `/api/scraping/projects` | GET, POST |
| `/api/scraping/projects/{id}` | DELETE |
| `/api/scraping/spiders` | GET, POST |
| `/api/scraping/spiders/{id}` | DELETE |
| `/api/search-images` | GET |
| `/api/storage` | GET (pubblico; `?path=` relativo a `public/`) |
| `/api/storage/save-image` | POST |
| `/api/tags` | GET, POST |
| `/api/tags/bulk` | POST |
| `/api/tags/{id}` | PUT, DELETE |
| `/api/upload` | POST |
| `/api/users` | GET, POST |
| `/api/users/{id}` | GET, PATCH |
| `/api/vat-codes` | GET, POST |
| `/api/vat-codes/bulk` | POST |
| `/api/vat-codes/{id}` | PUT, DELETE |

---

## 12. Scheletro OpenAPI

È presente il file **`docs/openapi-skeleton.yaml`** (OpenAPI 3.0.3) con:

- `servers` configurabile (`host` variabile)
- schemi di sicurezza indicativi (cookie sessione, header `x-company-id`)
- alcuni path di esempio (`/api/products`, `/api/brands`, `/api/company/integration-settings`, `/api/activities`, …)

**Come usarlo**

- Import in **Postman** (Import → file YAML) o **Swagger UI** / **Redoc**.
- Estendere la sezione `paths` copiando pattern dagli export delle route o dalla tabella sopra.
- Opzionale: `npx @redocly/cli lint docs/openapi-skeleton.yaml` per validare la sintassi (richiede il pacchetto CLI).

La “fonte di verità” per body JSON, query e permessi resta sempre **`app/api/.../route.ts`**.
