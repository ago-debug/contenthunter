/**
 * Reimposta la password di un utente (es. admin globale).
 * Uso: node scripts/reset-password.js <email> <nuova_password>
 * Oppure: node --env-file=.env scripts/reset-password.js <email> <nuova_password>
 *
 * Legge DATABASE_URL da .env nella root del progetto.
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
        process.env[key] = val;
      }
    });
  }
}

async function main() {
  loadEnv();

  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error("Uso: node scripts/reset-password.js <email> <nuova_password>");
    console.error("Esempio: node scripts/reset-password.js admin@esempio.com MiaNuovaPassword123");
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error("La password deve essere di almeno 6 caratteri.");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error("Utente non trovato con email:", email);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    console.log("Password aggiornata con successo per:", email);
  } catch (e) {
    console.error("Errore:", e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
