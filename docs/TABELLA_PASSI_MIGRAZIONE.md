# Migrazione multi-azienda – tabella passi

| # | Passo | Cosa fare | Comando / azione |
|---|--------|------------|-------------------|
| 1 | Backup | Salva il database prima di modificare | `mysqldump -u UTENTE -p NOME_DB > backup_$(date +%Y%m%d).sql` (oppure backup dal pannello hosting) |
| 2 | Esegui lo script di migrazione | Lo script crea Company, aggiunge companyId, assegna tutto all’azienda 1 | `node scripts/migrate-multi-company.js` |
| 3 | Imposta l’admin globale | Stesso script passando la tua email (un utente avrà companyId = NULL) | `node scripts/migrate-multi-company.js tua@email.com` |
| 4 | Rigenera Prisma | Aggiorna il client Prisma dopo le modifiche al DB | `npx prisma generate` |
| 5 | Seed profilo Admin | Crea il profilo “Admin” con tutti i permessi | `npm run db-seed` |
| 6 | Assegna profilo all’utente | Dalla app: Admin → Utenti → modifica il tuo utente → scegli profilo **Admin** | Apri l’app, login, Admin → Utenti → modifica → Profilo: Admin → Salva |
| 7 | Verifica Aziende | Controlla che l’azienda “Default” sia visibile | Admin → Aziende (solo se sei admin globale) |
| 8 | Seleziona azienda (header) | Per vedere cataloghi/prodotti, seleziona un’azienda dal menu in alto | Menu “Seleziona azienda” in header → scegli **Default** (o altra) |
| 9 | (Opzionale) Nuove aziende | Crea altre aziende e assegna utenti | Admin → Aziende → Nuova azienda; Admin → Utenti → modifica utente → Azienda |

---

## Se non usi lo script (migrazione manuale SQL)

| # | Passo | Cosa fare |
|---|--------|-----------|
| 1 | Backup | Fai backup del database |
| 2 | Crea tabella Company | Esegui `CREATE TABLE Company ...` (vedi `MIGRAZIONE_PASSO_PASSO.md`) |
| 3 | Inserisci azienda | `INSERT INTO Company (id, name, slug, ...) VALUES (1, 'Default', 'default', ...)` |
| 4 | Aggiungi colonna companyId | `ALTER TABLE Catalog ADD COLUMN companyId INT NULL` (e così per Product, Category, Brand, Tag, BulletPoint, Template, User) |
| 5 | Assegna tutto all’azienda 1 | `UPDATE Catalog SET companyId = 1` (e così per le altre tabelle) |
| 6 | Admin globale | `UPDATE User SET companyId = NULL WHERE email = 'tua@email.com'` |
| 7 | Rendi obbligatorio companyId | `ALTER TABLE Catalog MODIFY companyId INT NOT NULL` (per tutte tranne User) |
| 8 | Indici e univoci | Aggiungi indici/unique come in `MIGRAZIONE_PASSO_PASSO.md` (Product, Category, Brand, Tag) |
| 9 | Foreign key | `ALTER TABLE Catalog ADD CONSTRAINT ... FOREIGN KEY (companyId) REFERENCES Company(id)` (e così per le altre) |
| 10 | Prisma + seed | `npx prisma generate` e `npm run db-seed` |

---

## Riepilogo veloce (con script)

| # | Comando / azione |
|---|-------------------|
| 1 | Backup DB |
| 2 | `node scripts/migrate-multi-company.js tua@email.com` |
| 3 | `npx prisma generate` |
| 4 | `npm run db-seed` |
| 5 | Login in app → Admin → Utenti → assegna profilo Admin al tuo utente |
| 6 | Header → Seleziona azienda → Default |
