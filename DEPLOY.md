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

## 7. Permessi (spesso causa di "could not be started")

Passenger avvia l’app con l’**utente del sito** (es. utente Plesk del dominio). Quell’utente deve **leggere** tutta l’app e **scrivere** in `.next/cache` e in `public/uploads` se li usi.

**Da eseguire come root** (sostituisci `UTENTE_SITO` con l’utente del dominio, es. `contenthunter` o quello indicato in Plesk per il dominio; e `CARTELLA_APP` con il path, es. `/var/www/vhosts/contenthunter.abreve.it/httpdocs`):

```bash
# Proprietario: utente con cui gira Passenger (vedi in Plesk → dominio → impostazioni)
chown -R UTENTE_SITO:UTENTE_SITO /var/www/vhosts/contenthunter.abreve.it/httpdocs

# Lettura per tutti i file, esecuzione per directory (così Node può entrare e leggere)
find /var/www/vhosts/contenthunter.abreve.it/httpdocs -type d -exec chmod 755 {} \;
find /var/www/vhosts/contenthunter.abreve.it/httpdocs -type f -exec chmod 644 {} \;

# Cartelle dove Next/Passenger devono scrivere: permesso scrittura
chmod -R 775 /var/www/vhosts/contenthunter.abreve.it/httpdocs/.next
chmod -R 775 /var/www/vhosts/contenthunter.abreve.it/httpdocs/public/uploads 2>/dev/null || true
```

**Come trovare UTENTE_SITO su Plesk:** Siti web e domini → il dominio → **Impostazioni hosting** (o **User & access**). L’utente del sito è quello associato al dominio. In alternativa controlla nei log di Passenger con quale user viene avviato il processo.

Se hai fatto `npm run build` come **root**, `.next` e a volte `node_modules` sono di proprietà di root: Passenger (che gira come utente sito) non può leggerli. Per questo `chown -R UTENTE_SITO:UTENTE_SITO` risolve.

**Script rapido (da eseguire come root):**

```bash
cd /var/www/vhosts/contenthunter.abreve.it/httpdocs
export APP_USER=contenthunter   # sostituisci con l'utente reale del dominio
export APP_DIR="$PWD"
chmod +x scripts/fix-permissions.sh   # necessario la prima volta (Permission denied senza)
./scripts/fix-permissions.sh
```

## 8. Riepilogo checklist

- [ ] `node -v` ≥ 18.17
- [ ] `npm ci` eseguito
- [ ] `npx prisma generate` eseguito **prima** di `next build` o subito dopo (lo fa già `npm run build`)
- [ ] `npm run build` completato senza errori (cartella `.next` presente)
- [ ] **Permessi**: `chown -R UTENTE_SITO:UTENTE_SITO` sulla cartella app (dopo build)
- [ ] `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` impostate
- [ ] Passenger punta alla stessa cartella dove hai eseguito build e prisma generate
- [ ] Log Passenger controllati con l’Error ID per il messaggio esatto
