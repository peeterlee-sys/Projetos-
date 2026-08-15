// Troca a senha de um usuário direto no banco.
// Uso (sem aspas na senha — ele pergunta):
//   export DATABASE_URL=libsql://...
//   export DATABASE_AUTH_TOKEN=...
//   node scripts/set-password.mjs <email>
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline/promises";

const email = process.argv[2];
if (!email) {
  console.error("Uso: node scripts/set-password.mjs <email>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL e DATABASE_AUTH_TOKEN antes (com export).");
  process.exit(1);
}

let senha = process.argv[3];
if (!senha) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  senha = (await rl.question("Nova senha (mínimo 8 caracteres): ")).trim();
  rl.close();
}
if (!senha || senha.length < 8) {
  console.error("A senha deve ter pelo menos 8 caracteres.");
  process.exit(1);
}

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const hash = await bcrypt.hash(senha, 10);
const res = await db.execute({
  sql: "UPDATE users SET senha_hash = ? WHERE lower(email) = lower(?)",
  args: [hash, email.trim()],
});

if (res.rowsAffected === 0) {
  console.error(`❌ Nenhum usuário encontrado com o e-mail: ${email}`);
  process.exit(1);
}

console.log(`✅ Senha atualizada com sucesso para ${email}.`);
process.exit(0);
