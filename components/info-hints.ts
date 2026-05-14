export const INFO_HINTS = {
  importLab: {
    pushToMaster:
      "Invia i prodotti dallo staging a Iris applicando le regole di sovrascrittura impostate nella conferma.",
    bulkApplyAll:
      "Applica in blocco brand, categoria o magazzino su tutto lo staging. Con 'Solo se vuoto' aggiorna solo i campi mancanti.",
    dedupeImages:
      "Rimuove i link immagine duplicati all'interno di ogni articolo del listino staging.",
    bulkTitle:
      "Modifica i titoli in massa: sostituisce un testo o lo aggiunge all'inizio/fine su tutto il listino selezionato.",
    uploadListino:
      "Importa un file CSV/XLSX e apre la mappatura colonne per aggiornare lo staging del catalogo corrente.",
    uploadPdf:
      "Carica un PDF sorgente nel repository per ricerca testo, estrazione AI e associazione immagini.",
  },
  erp: {
    wooSetup:
      "Configura integrazione WooCommerce, mapping dei campi e strategia di sincronizzazione tra ERP e Woo.",
    aiContentFilter:
      "SI: breve, descrizione e bullet compilati. NO: nessun contenuto AI. NON COMPLETO: solo parte dei campi valorizzata.",
    bulkSeo:
      "Avvia la generazione AI massiva sui prodotti selezionati. Con «solo dove mancano» evita di rigenerare contenuti già presenti.",
    bulkDelete:
      "Elimina definitivamente da Iris tutti i prodotti selezionati. Operazione irreversibile.",
    bulkSeoMode:
      "Sovrascrivi: rigenera sempre i contenuti. Solo dove mancano: compila solo i campi SEO ancora vuoti.",
  },
} as const;
