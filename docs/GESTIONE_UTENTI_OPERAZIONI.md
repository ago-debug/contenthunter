# Operazioni dopo l’attivazione della gestione utenti

Dopo aver introdotto **profili** e **permessi** (gestione utenti), eseguire in ordine:

## 1. Applicare lo schema al database

```bash
npx prisma db push
```

Crea/aggiorna le tabelle `Profile` e il campo `profileId` su `User`.

## 2. Creare il profilo Admin (seed)

```bash
npm run db-seed
```

Crea il profilo **Admin** con tutti i permessi. Se il profilo esiste già, lo script non fa nulla.

## 3. Assegnare il profilo agli utenti

- Vai in **Admin → Utenti** (`/admin/users`).
- Apri la modifica del tuo utente (icona matita).
- Seleziona il profilo **Admin** (o altro profilo) e salva.

In alternativa, per il primo utente puoi impostare manualmente nel DB:

```sql
UPDATE User SET profileId = 1 WHERE email = 'tua@email.com';
```

(dove `1` è l’id del profilo Admin creato dal seed).

## 4. Riepilogo permessi

- **Admin**: accesso completo.
- **users:read** / **users:write**: elenco utenti e modifica profilo/nome.
- **profiles:read** / **profiles:write**: gestione profili e permessi.
- Altri permessi (products, catalogues, export, settings) controllano le relative funzionalità.

Se un utente **non ha ancora un profilo**, può comunque accedere a Profili e Utenti una volta per assegnarsi un profilo (bootstrap).
