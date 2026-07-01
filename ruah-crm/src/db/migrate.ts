import "dotenv/config";

process.on("uncaughtException", (err) => {
  console.error("[migrate] uncaughtException:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("[migrate] unhandledRejection:", err);
  process.exit(1);
});

async function main() {
  const url = process.env.DATABASE_URL || "file:./ruah-crm.db";
  console.log(`[migrate] Conectando em ${url.replace(/:\/\/.*@/, "://***@")}`);
  console.log(`[migrate] Token presente: ${Boolean(process.env.DATABASE_AUTH_TOKEN)}`);

  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");

  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const db = drizzle(client);

  console.log("[migrate] Aplicando migracoes...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("[migrate] Migracoes aplicadas com sucesso.");
  client.close();
}

main().catch((err) => {
  console.error("[migrate] Falha ao aplicar migracoes:", err);
  process.exit(1);
});
