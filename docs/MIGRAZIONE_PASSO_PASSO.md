# Migrazione multi-azienda – guida passo passo

Scegli **solo uno** dei due percorsi sotto, in base al tuo caso.

---

## Percorso A: Database NUOVO (nessun dato da conservare)

Se il database è vuoto o puoi ricrearlo da zero:

### Passo 1 – Applica lo schema

Nel terminale, dalla root del progetto:

```bash
npx prisma db push
```

### Passo 2 – Crea la prima azienda e il profilo Admin (opzionale)

```bash
npm run db-seed
```

Crea il profilo **Admin** con tutti i permessi. Poi dalla app:

1. Vai in **Admin → Utenti** e assegna il profilo **Admin** al tuo utente.
2. Il tuo utente ha già `companyId = NULL` (se ti sei registrato prima della migrazione), quindi è **admin globale**.
3. Vai in **Admin → Aziende** e crea la prima azienda (es. "La mia azienda").
4. Se vuoi altri utenti “aziendali”, creali da Admin → Utenti e assegna loro **Azienda** + **Profilo**.

Fine. Non serve il Percorso B.

---

## Percorso B: Database ESISTENTE (hai già cataloghi, prodotti, utenti)

Segui **tutti** i passi nell’ordine.

---

### Passo 1 – Backup del database

Fai un backup completo del database MySQL (dump o strumento del tuo hosting).

Esempio da riga di comando:

```bash
mysqldump -u UTENTE -p NOME_DATABASE > backup_pre_migrazione_$(date +%Y%m%d).sql
```

Sostituisci `UTENTE` e `NOME_DATABASE` con i tuoi valori.

---

### Passo 2 – Crea la tabella Company

Esegui sul database (client MySQL, phpMyAdmin, o altro):

```sql
CREATE TABLE `Company` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Company_slug_key`(`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### Passo 3 – Inserisci la prima azienda

```sql
INSERT INTO `Company` (`id`, `name`, `slug`, `createdAt`, `updatedAt`)
VALUES (1, 'Default', 'default', NOW(3), NOW(3));
```

---

### Passo 4 – Aggiungi la colonna companyId (nullable) alle tabelle

Esegui **una riga alla volta** (o tutte se il client lo permette):

```sql
ALTER TABLE `Catalog`     ADD COLUMN `companyId` INT NULL;
ALTER TABLE `Product`     ADD COLUMN `companyId` INT NULL;
ALTER TABLE `Category`    ADD COLUMN `companyId` INT NULL;
ALTER TABLE `Brand`       ADD COLUMN `companyId` INT NULL;
ALTER TABLE `Tag`         ADD COLUMN `companyId` INT NULL;
ALTER TABLE `BulletPoint` ADD COLUMN `companyId` INT NULL;
ALTER TABLE `Template`    ADD COLUMN `companyId` INT NULL;
ALTER TABLE `User`        ADD COLUMN `companyId` INT NULL;
```

Se una tabella non esiste (es. non usi i BulletPoint), salta quella riga.

---

### Passo 5 – Assegna tutti i dati all’azienda 1

```sql
UPDATE `Catalog`     SET `companyId` = 1 WHERE `companyId` IS NULL;
UPDATE `Product`     SET `companyId` = 1 WHERE `companyId` IS NULL;
UPDATE `Category`    SET `companyId` = 1 WHERE `companyId` IS NULL;
UPDATE `Brand`       SET `companyId` = 1 WHERE `companyId` IS NULL;
UPDATE `Tag`         SET `companyId` = 1 WHERE `companyId` IS NULL;
UPDATE `BulletPoint` SET `companyId` = 1 WHERE `companyId` IS NULL;
UPDATE `Template`    SET `companyId` = 1 WHERE `companyId` IS NULL;
UPDATE `User`        SET `companyId` = 1 WHERE `companyId` IS NULL;
```

---

### Passo 6 – Imposta l’admin globale

Scegli **un solo** utente come admin globale (quello che potrà vedere e gestire tutte le aziende). Imposta la sua email nell’istruzione sotto:

```sql
UPDATE `User` SET `companyId` = NULL WHERE `email` = 'LA_TUA_EMAIL_ADMIN@esempio.com';
```

Sostituisci `LA_TUA_EMAIL_ADMIN@esempio.com` con l’email reale dell’account che vuoi come admin globale.

---

### Passo 7 – Rendi obbligatorio companyId (tranne su User)

Esegui solo sulle tabelle che esistono nel tuo DB:

```sql
ALTER TABLE `Catalog`     MODIFY COLUMN `companyId` INT NOT NULL;
ALTER TABLE `Product`     MODIFY COLUMN `companyId` INT NOT NULL;
ALTER TABLE `Category`    MODIFY COLUMN `companyId` INT NOT NULL;
ALTER TABLE `Brand`       MODIFY COLUMN `companyId` INT NOT NULL;
ALTER TABLE `Tag`         MODIFY COLUMN `companyId` INT NOT NULL;
ALTER TABLE `BulletPoint` MODIFY COLUMN `companyId` INT NOT NULL;
ALTER TABLE `Template`    MODIFY COLUMN `companyId` INT NOT NULL;
-- User.companyId resta NULL (per l'admin globale)
```

---

### Passo 8 – Indici e vincoli univoci (Product)

Il nuovo schema prevede che **SKU** sia univoco **per azienda**, non globale. Su MySQL:

1. Rimuovi l’indice univoco su `Product.sku` (se esiste):

```sql
-- Nome tipico dell'indice in Prisma/MySQL:
ALTER TABLE `Product` DROP INDEX `Product_sku_key`;
-- Se l'errore dice che l'indice non esiste, prova:
-- SHOW INDEX FROM Product;  e usa il nome che vedi per sku
```

2. Aggiungi l’univoco composto (companyId + sku):

```sql
ALTER TABLE `Product` ADD UNIQUE INDEX `Product_companyId_sku_key`(`companyId`, `sku`);
```

3. Indice su companyId (se non esiste già):

```sql
CREATE INDEX `Product_companyId_idx` ON `Product`(`companyId`);
```

Ripeti in modo analogo per le altre tabelle se il tuo Prisma ha altri `@@unique` composti (es. `Category`, `Brand`, `Tag`). In genere:

```sql
-- Category: univoco (companyId, name, parentId)
ALTER TABLE `Category` ADD UNIQUE INDEX `Category_companyId_name_parentId_key`(`companyId`, `name`, `parentId`);
CREATE INDEX `Category_companyId_idx` ON `Category`(`companyId`);

-- Brand: univoco (companyId, name)
ALTER TABLE `Brand` DROP INDEX `Brand_name_key`;
ALTER TABLE `Brand` ADD UNIQUE INDEX `Brand_companyId_name_key`(`companyId`, `name`);
CREATE INDEX `Brand_companyId_idx` ON `Brand`(`companyId`);

-- Tag: univoco (companyId, name)
ALTER TABLE `Tag` DROP INDEX `Tag_name_key`;
ALTER TABLE `Tag` ADD UNIQUE INDEX `Tag_companyId_name_key`(`companyId`, `name`);
CREATE INDEX `Tag_companyId_idx` ON `Tag`(`companyId`);
```

Se un `DROP INDEX` fallisce perché l’indice ha un nome diverso, usa `SHOW INDEX FROM NomeTabella;` e adatta il nome.

---

### Passo 9 – Foreign key verso Company

Aggiungi le foreign key (solo per le tabelle che hai modificato):

```sql
ALTER TABLE `Catalog`     ADD CONSTRAINT `Catalog_companyId_fkey`     FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Product`     ADD CONSTRAINT `Product_companyId_fkey`     FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Category`    ADD CONSTRAINT `Category_companyId_fkey`    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Brand`       ADD CONSTRAINT `Brand_companyId_fkey`        FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Tag`         ADD CONSTRAINT `Tag_companyId_fkey`          FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BulletPoint` ADD CONSTRAINT `BulletPoint_companyId_fkey`   FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Template`    ADD CONSTRAINT `Template_companyId_fkey`      FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `User`        ADD CONSTRAINT `User_companyId_fkey`         FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
```

Se una constraint con lo stesso nome esiste già, salta quella riga o rinomina la constraint.

---

### Passo 10 – Rigenera il client Prisma

Nel progetto:

```bash
npx prisma generate
```

Non eseguire ancora `prisma db push`: il DB è già stato aggiornato a mano.

---

### Passo 11 – Seed profilo Admin (se non l’hai già)

```bash
npm run db-seed
```

Crea il profilo **Admin** con tutti i permessi.

---

### Passo 12 – Verifica dalla app

1. Fai login con l’utente che ha `companyId = NULL` (quello impostato al Passo 6).
2. Vai in **Admin → Aziende**: deve comparire l’azienda "Default".
3. In **Admin → Utenti** assegna il profilo **Admin** a questo utente (se non ce l’ha già).
4. Nell’header in alto, seleziona l’azienda **Default** dal menu “Seleziona azienda”: da lì in poi vedi solo i dati di quell’azienda.
5. Crea eventuali nuove aziende da Admin → Aziende e assegna utenti da Admin → Utenti.

---

## Riepilogo veloce (solo passi)

**Database vuoto (Percorso A):**

1. `npx prisma db push`
2. `npm run db-seed`
3. Assegna profilo Admin al tuo utente e (opzionale) crea la prima azienda da pannello.

**Database esistente (Percorso B):**

1. Backup DB  
2. Crea tabella `Company`  
3. Inserisci una riga in `Company` (id = 1)  
4. Aggiungi colonna `companyId` (nullable) a Catalog, Product, Category, Brand, Tag, BulletPoint, Template, User  
5. UPDATE di tutte le righe a `companyId = 1`  
6. UPDATE di un utente a `companyId = NULL` (admin globale)  
7. MODIFY `companyId` NOT NULL (tranne User)  
8. Indici e univoci (Product, Category, Brand, Tag)  
9. Foreign key verso `Company`  
10. `npx prisma generate`  
11. `npm run db-seed`  
12. Verifica login, Aziende, Utenti e switcher azienda.

Se in uno dei passi compare un errore (nome indice, tabella mancante, ecc.), annota il messaggio e il passo: si può adattare lo script al tuo schema reale.
