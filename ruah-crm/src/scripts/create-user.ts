import "dotenv/config";
import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { users } from "../db/schema";

async function main() {
  const [, , email, nome, senha] = process.argv;
  if (!email || !nome || !senha) {
    console.error("Uso: npm run users:create -- email@exemplo.com \"Nome Sobrenome\" senha123");
    process.exit(1);
  }

  const client = createClient({
    url: process.env.DATABASE_URL || "file:./ruah-crm.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const db = drizzle(client);

  const senhaHash = await bcrypt.hash(senha, 10);

  await db
    .insert(users)
    .values({ email: email.toLowerCase().trim(), nome, senhaHash })
    .onConflictDoUpdate({ target: users.email, set: { nome, senhaHash } });

  console.log(`Usuario "${email}" criado/atualizado com sucesso.`);
  client.close();
}

main().catch((err) => {
  console.error("Falha ao criar usuario:", err);
  process.exit(1);
});
