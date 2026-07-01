import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL || "file:./ruah-crm.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Migracoes aplicadas com sucesso.");
  client.close();
}

main().catch((err) => {
  console.error("Falha ao aplicar migracoes:", err);
  process.exit(1);
});
