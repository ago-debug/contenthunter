/**
 * Crea un utente amministratore globale (companyId null) se non esiste,
 * opzione per reimpostare la password.
 *
 * Variabili (.env o ambiente sul server):
 *   BOOTSTRAP_ADMIN_EMAIL       (obbligatorio)
 *   BOOTSTRAP_ADMIN_PASSWORD    (obbligatorio, min 6 caratteri)
 *   BOOTSTRAP_ADMIN_NAME        (opzionale, default "Amministratore")
 *   BOOTSTRAP_ADMIN_RESET_PASSWORD=1  se l'utente esiste già, aggiorna la password
 *
 * Uso:
 *   node --env-file=.env scripts/bootstrap-admin.js
 *   BOOTSTRAP_ADMIN_EMAIL=a@b.it BOOTSTRAP_ADMIN_PASSWORD=Segreta1 node scripts/bootstrap-admin.js
 *
 * Suggerimento: eseguire una volta dopo deploy / dopo upgrade DB; poi rimuovere la password dall'env.
 */

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

function loadEnv() {
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        content.split("\n").forEach((line) => {
            const m = line.match(/^([^#=]+)=(.*)$/);
            if (m) {
                const key = m[1].trim();
                let val = m[2].trim();
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
                if (process.env[key] === undefined) process.env[key] = val;
            }
        });
    }
}

async function main() {
    loadEnv();

    const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
    const name = (process.env.BOOTSTRAP_ADMIN_NAME || "Amministratore").trim();
    const reset = String(process.env.BOOTSTRAP_ADMIN_RESET_PASSWORD || "").trim() === "1";

    if (!email || !password) {
        console.error("Imposta BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD (es. in .env sul server).");
        process.exit(1);
    }
    if (password.length < 6) {
        console.error("BOOTSTRAP_ADMIN_PASSWORD deve essere di almeno 6 caratteri.");
        process.exit(1);
    }

    const prisma = new PrismaClient();

    try {
        let profile = await prisma.profile.findFirst({ where: { name: "Admin" } });
        if (!profile) {
            await prisma.profile.create({
                data: {
                    name: "Admin",
                    description: "Accesso completo (bootstrap)",
                    permissions: [
                        "admin",
                        "users:read",
                        "users:write",
                        "profiles:read",
                        "profiles:write",
                        "products:read",
                        "products:write",
                        "catalogues:read",
                        "catalogues:write",
                        "export:run",
                        "settings:read",
                        "settings:write",
                    ],
                },
            });
            profile = await prisma.profile.findFirst({ where: { name: "Admin" } });
        }

        if (!profile) {
            console.error("Impossibile creare o trovare il profilo Admin.");
            process.exit(1);
        }

        const hashed = await bcrypt.hash(password, 10);
        const existing = await prisma.user.findUnique({ where: { email } });

        if (!existing) {
            await prisma.user.create({
                data: {
                    email,
                    name,
                    password: hashed,
                    companyId: null,
                    profileId: profile.id,
                },
            });
            console.log("Utente admin globale creato:", email);
        } else if (reset) {
            await prisma.user.update({
                where: { id: existing.id },
                data: {
                    password: hashed,
                    name: name || existing.name,
                    profileId: profile.id,
                },
            });
            console.log("Password (e profilo Admin) aggiornati per:", email);
        } else {
            console.log("Utente già presente:", email);
            console.log("Per reimpostare la password aggiungi BOOTSTRAP_ADMIN_RESET_PASSWORD=1");
            process.exit(2);
        }
    } catch (e) {
        console.error("Errore:", e.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
