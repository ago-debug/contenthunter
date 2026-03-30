/**
 * Script di migrazione multi-azienda.
 * Esegue sul DB le operazioni necessarie (tabella Company, colonne companyId, backfill).
 * Caricare .env prima: node -r dotenv/config scripts/migrate-multi-company.js
 * Oppure: node --env-file=.env scripts/migrate-multi-company.js
 */

const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

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

function parseDbUrl(url) {
  if (!url || !url.startsWith("mysql://")) {
    throw new Error("DATABASE_URL mancante o non mysql");
  }
  const u = url.replace(/^mysql:\/\//, "");
  const at = u.indexOf("@");
  const auth = u.slice(0, at);
  const rest = u.slice(at + 1);
  const user = auth.split(":")[0];
  const password = auth.includes(":") ? auth.slice(user.length + 1) : "";
  const [hostPart, dbPart] = rest.split("/");
  const database = dbPart ? dbPart.split("?")[0] : "";
  const [host, port] = hostPart.split(":");
  return {
    host: host || "localhost",
    port: port ? parseInt(port, 10) : 3306,
    user,
    password,
    database,
  };
}

async function run(conn, sql, comment) {
  try {
    await conn.query(sql);
    console.log("OK:", comment || sql.slice(0, 50) + "...");
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_TABLE_EXISTS_ERROR" || e.code === "ER_DUP_KEYNAME" || e.code === "ER_FK_DUP_NAME" || e.code === "ER_DUP_INDEX") {
      console.log("SKIP (già presente):", comment || e.code);
    } else {
      console.error("ERRORE:", comment || sql);
      console.error(e.message);
      throw e;
    }
  }
}

async function tableExists(conn, name) {
  const [rows] = await conn.query("SHOW TABLES LIKE ?", [name]);
  return rows.length > 0;
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  const config = parseDbUrl(url);
  console.log("Connessione a", config.host, config.database, "...");

  const conn = await mysql.createConnection(config);

  try {
    // 1. Tabella Company
    await run(
      conn,
      `CREATE TABLE IF NOT EXISTS \`Company\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(191) NOT NULL,
        \`slug\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`Company_slug_key\`(\`slug\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      "Tabella Company"
    );

    const [rows] = await conn.query("SELECT COUNT(*) as c FROM `Company`");
    if (rows[0].c === 0) {
      await run(conn, "INSERT INTO `Company` (`id`, `name`, `slug`, `createdAt`, `updatedAt`) VALUES (1, 'Default', 'default', NOW(3), NOW(3))", "Inserimento azienda Default");
    } else {
      console.log("SKIP: Company ha già righe");
    }

    const tables = [
      { name: "Catalog", notNull: true },
      { name: "Product", notNull: true },
      { name: "Category", notNull: true },
      { name: "Brand", notNull: true },
      { name: "Tag", notNull: true },
      { name: "BulletPoint", notNull: true },
      { name: "Template", notNull: true },
      { name: "User", notNull: false },
    ];

    for (const t of tables) {
      if (!(await tableExists(conn, t.name))) {
        console.log("SKIP: Tabella", t.name, "non presente");
        continue;
      }
      try {
        await conn.query(`ALTER TABLE \`${t.name}\` ADD COLUMN \`companyId\` INT NULL`);
        console.log("OK: Colonna companyId aggiunta a", t.name);
      } catch (e) {
        if (e.code === "ER_DUP_FIELDNAME") console.log("SKIP: companyId già presente in", t.name);
        else throw e;
      }
    }

    for (const t of tables) {
      if (!(await tableExists(conn, t.name))) continue;
      await run(conn, `UPDATE \`${t.name}\` SET \`companyId\` = 1 WHERE \`companyId\` IS NULL`, `Backfill companyId=1 su ${t.name}`);
    }

    const adminEmail = process.env.ADMIN_GLOBAL_EMAIL || process.argv[2];
    if (adminEmail) {
      const [r] = await conn.query("UPDATE `User` SET `companyId` = NULL WHERE `email` = ?", [adminEmail]);
      console.log("OK: Impostato admin globale per email:", adminEmail, "(righe:", r.affectedRows, ")");
    } else {
      console.log("INFO: Nessuna ADMIN_GLOBAL_EMAIL o argomento. Imposta un utente a mano: UPDATE User SET companyId = NULL WHERE email = 'tua@email';");
    }

    for (const t of tables) {
      if (!t.notNull || !(await tableExists(conn, t.name))) continue;
      try {
        await conn.query(`ALTER TABLE \`${t.name}\` MODIFY COLUMN \`companyId\` INT NOT NULL`);
        console.log("OK: companyId NOT NULL su", t.name);
      } catch (e) {
        console.error("Errore su", t.name, e.message);
      }
    }

    if (await tableExists(conn, "Product")) {
      try {
        await conn.query("ALTER TABLE `Product` DROP INDEX `Product_sku_key`");
        console.log("OK: Rimosso indice univoco Product.sku");
      } catch (e) {
        if (e.code === "ER_CANT_DROP_FIELD_OR_KEY") console.log("SKIP: Indice Product_sku_key non presente");
      }
      await run(conn, "ALTER TABLE `Product` ADD UNIQUE INDEX `Product_companyId_sku_key`(`companyId`, `sku`)", "Univoco Product(companyId, sku)");
      await run(conn, "CREATE INDEX `Product_companyId_idx` ON `Product`(`companyId`)", "Indice Product.companyId");
    }
    if (await tableExists(conn, "Catalog")) await run(conn, "CREATE INDEX `Catalog_companyId_idx` ON `Catalog`(`companyId`)", "Indice Catalog.companyId");
    if (await tableExists(conn, "Category")) {
      await run(conn, "ALTER TABLE `Category` ADD UNIQUE INDEX `Category_companyId_name_parentId_key`(`companyId`, `name`, `parentId`)", "Univoco Category");
      await run(conn, "CREATE INDEX `Category_companyId_idx` ON `Category`(`companyId`)", "Indice Category.companyId");
    }
    if (await tableExists(conn, "Brand")) {
      try {
        await conn.query("ALTER TABLE `Brand` DROP INDEX `Brand_name_key`");
      } catch (_) {}
      await run(conn, "ALTER TABLE `Brand` ADD UNIQUE INDEX `Brand_companyId_name_key`(`companyId`, `name`)", "Univoco Brand");
      await run(conn, "CREATE INDEX `Brand_companyId_idx` ON `Brand`(`companyId`)", "Indice Brand.companyId");
    }
    if (await tableExists(conn, "Tag")) {
      try {
        await conn.query("ALTER TABLE `Tag` DROP INDEX `Tag_name_key`");
      } catch (_) {}
      await run(conn, "ALTER TABLE `Tag` ADD UNIQUE INDEX `Tag_companyId_name_key`(`companyId`, `name`)", "Univoco Tag");
      await run(conn, "CREATE INDEX `Tag_companyId_idx` ON `Tag`(`companyId`)", "Indice Tag.companyId");
    }
    if (await tableExists(conn, "BulletPoint")) await run(conn, "CREATE INDEX `BulletPoint_companyId_idx` ON `BulletPoint`(`companyId`)", "Indice BulletPoint.companyId");
    if (await tableExists(conn, "Template")) await run(conn, "CREATE INDEX `Template_companyId_idx` ON `Template`(`companyId`)", "Indice Template.companyId");

    const fks = [
      ["Catalog", "Catalog_companyId_fkey"],
      ["Product", "Product_companyId_fkey"],
      ["Category", "Category_companyId_fkey"],
      ["Brand", "Brand_companyId_fkey"],
      ["Tag", "Tag_companyId_fkey"],
      ["BulletPoint", "BulletPoint_companyId_fkey"],
      ["Template", "Template_companyId_fkey"],
      ["User", "User_companyId_fkey"],
    ];
    for (const [table, fkName] of fks) {
      if (!(await tableExists(conn, table))) continue;
      const onDelete = table === "User" ? "SET NULL" : "CASCADE";
      try {
        await conn.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${fkName}\` FOREIGN KEY (\`companyId\`) REFERENCES \`Company\`(\`id\`) ON DELETE ${onDelete} ON UPDATE CASCADE`
        );
        console.log("OK: FK", fkName);
      } catch (e) {
        if (e.code === "ER_FK_DUP_NAME" || e.code === "ER_DUP_KEY") console.log("SKIP: FK già presente", fkName);
        else console.error("FK", fkName, e.message);
      }
    }

    console.log("\nMigrazione completata.");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
