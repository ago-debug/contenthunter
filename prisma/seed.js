const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ALL_PERMISSIONS = [
  "admin", "users:read", "users:write", "profiles:read", "profiles:write",
  "products:read", "products:write", "catalogues:read", "catalogues:write",
  "export:run", "settings:read", "settings:write",
];

async function main() {
  const existing = await prisma.profile.findFirst({ where: { name: "Admin" } });
  if (!existing) {
    await prisma.profile.create({
      data: {
        name: "Admin",
        description: "Accesso completo a tutte le funzionalità",
        permissions: ALL_PERMISSIONS,
      },
    });
    console.log("Profilo Admin creato.");
  } else {
    console.log("Profilo Admin già presente.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
