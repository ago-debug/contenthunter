/**
 * Mappa funzionale dell'app Iris (Content Hunter / PDF Catalog) per l'assistente AI.
 * Aggiornare questo file quando cambiano flussi principali o voci di menu.
 */
export const PLATFORM_ASSISTANT_KNOWLEDGE_IT = `
## Suite Iris — panoramica
Applicazione web Next.js per anagrafica prodotti B2B, cataloghi PDF, staging, integrazioni e-commerce (WooCommerce, PrestaShop), contenuti multilingua e attività in background.

## Navigazione principale (sidebar)
- **Biblioteca prodotti** (\`/\`): griglia prodotti ERP, filtri, ordinamento, selezione multipla, azioni bulk (traduzioni, titoli, export), editor laterale scheda singola. Salvataggio: pulsante **Esegui Salvataggio** → POST \`/api/products\` con flag overwrite (prezzo, testi, immagini, ecc.). Chiavi AI (OpenAI/Gemini) e SerpAPI si configurano in **Impostazioni azienda**.
- **Cataloghi** (\`/catalogues\`): gestione cataloghi PDF, pagine, staging prodotti, immagini, associazione a brand.
- **Import Lab** (\`/?tab=import\`, redirect da \`/import\`): import ed elaborazione assistita, anche import diretto in biblioteca.
- **Mappa da fonti** (\`/notebook-fonti\`): più fonti (PDF catalogo, PDF upload, URL sicuri, testo) + campi richiesti/obbligatori; AI restituisce JSON mappato (stile NotebookLM) via \`POST /api/ai/product-map-from-sources\` (richiede PDF Suite / Gemini).
- **Distribution**: canali e tabelle correlate (percorsi sotto \`/tables\` dove presenti).
- **Settings** (\`/settings\`): chiavi API, integrazioni, preferenze.
- **Control Center** (\`/admin\`): amministrazione; **Gestione aziende** per admin globale.
- **Storico modifiche** (\`/changelog\`): note di versione.
- **Attività** (\`/activities\`): log job (es. SEO bulk AI).

## Biblioteca prodotti — dettaglio utile
- Colonne tipiche: SKU, EAN, titolo, brand, categoria, prezzo (listino default), tag.
- **Editor scheda**: tab informazioni (titolo per lingua, brand, categorie a 3 livelli, prezzo IVA inclusa, tag, immagini), contenuti (descrizione, bullet, testo SEO AI), storico versioni.
- **Titolo da web**: pulsante vicino al titolo — chiama \`/api/ai/suggest-product-title\` (SerpAPI opzionale + AI).
- **Arricchisci titolo da scheda**: usa bullet, misure, colori, campi tecnici già presenti per proporre un titolo più completo (stesso limite caratteri e-commerce), senza inventare dati assenti.
- **Traduzione**: servizio \`/api/ai/translate\` per campi testo verso lingua di destinazione.
- **SEO / descrizioni AI**: \`/api/ai/describe\` (scheda singola) e job bulk \`/api/products/seo-bulk\`.
- **Export / bulk**: molte azioni passano da \`/api/products/bulk\` con action diversa (normalizza titoli, prefissi, ecc.).
- Admin globale: selezionare **azienda** dall’header; le API usano header \`x-company-id\`.

## Cataloghi e repository
- PDF caricati per catalogo; estrazione prodotti; staging prima di confermare in anagrafica.
- Immagini: cartelle brand, crop, ricerca web immagini (SerpAPI in impostazioni).

## Integrazioni canale
- **WooCommerce** e **PrestaShop**: configurazione in impostazioni / modali omnichannel nell’editor. Push aggiorna canale esterno; verificare mapping lingua e tasse.

## Autenticazione
- Login \`/login\`, registrazione se abilitata. Sessione NextAuth.

## Limitazioni da comunicare all’utente
- Se manca chiave OpenAI o Gemini in impostazioni azienda (o env server), le funzioni AI restituiscono errore esplicito.
- SerpAPI è opzionale: senza di esso, “titolo da web” ha meno contesto ma può comunque usare SKU/EAN/brand.
- Non eseguire azioni distruttive (elimina catalogo, reset DB) senza conferma utente: limitarsi a spiegare dove si trova il controllo.
`.trim();
