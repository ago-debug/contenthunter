# Deploy Content Hunter (Passenger / Plesk)

Se Passenger mostra **"Web application could not be started"** (Error ID nel log), l’app Node non si avvia. Controlla i punti sotto.

## 1. Log dell’errore

- In Plesk: **Siti web e domini** → il tuo dominio → **Log** (o **Passenger / Node**).
- Cerca l’**Error ID** (es. `f29b7f16`) nel file di log indicato da Passenger.
- Leggi le righe subito dopo: di solito c’è il messaggio vero (es. `Cannot find module '@prisma/client'`, `DATABASE_URL`, errore di build, ecc.).

## 2. Comandi sul server

Esegui **nella cartella dell’app** (es. `~/httpdocs` o il path della tua app):

```bash
# Node 18+ (Next 15 richiede 18.17+)
node -v

# Dipendenze
npm ci

# Prisma client (obbligatorio prima di avviare)
npx prisma generate

# Build Next.js
npm run build
```

**Start in produzione:**

```bash
npm start
```

(equivale a `next start`; usa la porta da variabile d’ambiente, es. `PORT=3000`.)

## 3. Variabili d’ambiente

Impostale nel pannello Plesk (o nel file `.env` nella root dell’app):

| Variabile         | Uso                                      |
|-------------------|------------------------------------------|
| `DATABASE_URL`    | Connessione MySQL (es. `mysql://user:pass@host:3306/dbname`) |
| `NEXTAUTH_SECRET` | Chiave segreta per NextAuth (stringa lunga casuale) |
| `NEXTAUTH_URL`    | URL pubblico dell’app (es. `https://contenthunter.abreve.it`) |
| `NODE_ENV`        | `production` in produzione               |

Senza `DATABASE_URL` e `NEXTAUTH_SECRET` l’app può andare in errore all’avvio o alla prima richiesta.

## 4. Configurazione Passenger (Plesk)

- **Application root**: deve puntare alla cartella del progetto (dove ci sono `package.json` e `.next`).
- **Application startup file**: di solito lasciare il default (Passenger cerca `package.json` e usa `npm start`). Se usi uno script custom, deve avviare `next start` (o `node node_modules/next/dist/bin/next start`).
- **Node.js version**: 18.x o 20.x (impostabile da Plesk se disponibile).

## 5. Script di verifica

Nella root del progetto:

```bash
chmod +x scripts/check-deploy.sh
./scripts/check-deploy.sh
```

Controlla che Node sia ok, che esista il client Prisma, che la build `.next` ci sia e che le variabili d’ambiente siano impostate (senza mostrarne il valore).

## 6. Verifica rapida avvio

Dopo `npm run build` e `npx prisma generate`:

```bash
# Avvio in locale sulla porta 3000
PORT=3000 npm start
```

Poi apri `http://localhost:3000` (o l’IP del server). Se qui funziona ma su Passenger no, il problema è nella configurazione Passenger/dominio (path, env, porta).

## 7. Riepilogo checklist

- [ ] `node -v` ≥ 18.17
- [ ] `npm ci` eseguito
- [ ] `npx prisma generate` eseguito **prima** di `next build` o subito dopo (lo fa già `npm run build`)
- [ ] `npm run build` completato senza errori (cartella `.next` presente)
- [ ] `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` impostate
- [ ] Passenger punta alla stessa cartella dove hai eseguito build e prisma generate
- [ ] Log Passenger controllati con l’Error ID per il messaggio esatto
