// Troca a senha de um usuário direto no banco.
// Uso:
//   DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." \
//     node scripts/set-password.mjs <email> "<novaSenha>"
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const email = process.argv[2];
const senha = process.argv[3];

if (!email || !senha) {
  console.error('Uso: node scripts/set-password.mjs <email> "<novaSenha>"');
  process.exit(1);
}
if (senha.length < 8) {
  console.error("A senha deve ter pelo menos 8 caracteres.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL (e DATABASE_AUTH_TOKEN) antes do comando.");
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
