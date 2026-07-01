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
  const { limparTokenDb } = await import("./env");
  const url = (process.env.DATABASE_URL || "file:./ruah-crm.db").trim();
  const authToken = limparTokenDb(process.env.DATABASE_AUTH_TOKEN);
  console.log(`[migrate] Conectando em ${url.replace(/:\/\/.*@/, "://***@")}`);
  console.log(
    `[migrate] Token presente: ${Boolean(authToken)} (tamanho original: ${process.env.DATABASE_AUTH_TOKEN?.length ?? 0}, tamanho limpo: ${authToken?.length ?? 0})`,
  );

  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");

  const client = createClient({
    url,
    authToken,
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
