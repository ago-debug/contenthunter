# Migrazione a multi-azienda

Dopo aver introdotto il modello **Company** e lo scope **companyId** su dati e utenti:

## 1. Schema (nuovo install)

```bash
npx prisma db push
```

Se il database è **vuoto**, non serve altro.

## 2. Migrazione database esistente

Se hai già dati (Catalog, Product, User, ecc.) **prima** di eseguire `db push`:

1. **Backup** del database.

2. Aggiungi manualmente la tabella e le colonne in due passi (così non perdi dati):

   - Crea la tabella `Company` e le colonne `companyId` **nullable** nelle tabelle che le richiedono (Catalog, Product, Category, Brand, Tag, BulletPoint, Template, User).

   - Inserisci una prima azienda:
     ```sql
     INSERT INTO Company (id, name, slug, createdAt, updatedAt) VALUES (1, 'Default', 'default', NOW(), NOW());
     ```

   - Assegna tutti i dati a questa azienda:
     ```sql
     UPDATE Catalog SET companyId = 1;
     UPDATE Product SET companyId = 1;
     UPDATE Category SET companyId = 1;
     UPDATE Brand SET companyId = 1;
     UPDATE Tag SET companyId = 1;
     UPDATE BulletPoint SET companyId = 1;
     UPDATE Template SET companyId = 1;
     UPDATE User SET companyId = 1;
     ```

   - Imposta **un** utente come admin globale (nessuna azienda):
     ```sql
     UPDATE User SET companyId = NULL WHERE email = 'tua@email.admin';
     ```

   - Rendi **NOT NULL** le colonne `companyId` dove previsto dallo schema (tranne `User.companyId` che resta nullable).

3. In alternativa puoi usare **Prisma Migrate**: crea una migration, poi modificala a mano per fare i passi sopra (aggiungi colonne nullable → INSERT Company → UPDATE → ALTER NOT NULL).

## 3. Comportamento

- **Admin globale**: utente con `companyId = NULL`. Vede la lista aziende in Admin → Aziende, può creare/modificare/eliminare aziende e assegnare utenti a un’azienda. Per vedere i dati (cataloghi, prodotti, ecc.) deve **selezionare un’azienda** dal menu in alto (header); le API useranno l’header `x-company-id` o il query param `companyId`.

- **Utente aziendale**: utente con `companyId` valorizzato. Vede solo i dati della propria azienda; non può cambiare azienda né accedere alla gestione aziende.

- **Registrazione**: il flusso di registrazione attuale non imposta `companyId` (resta `NULL`). Per un uso multi-azienda tipico conviene disattivare la registrazione pubblica e far creare gli utenti dall’admin globale (Admin → Utenti), assegnando l’azienda.

## 4. Route API non ancora scoped

Alcune route (bulk, tags/[id], bullets/[id], catalogues/sync-pages, repositories) potrebbero richiedere ancora requireCompanyId o ensureCatalogAccess. In caso di 403 applicare lo stesso pattern.
