import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Migrações leves aplicadas em runtime (CREATE ... IF NOT EXISTS).
 * Evita passo de migração manual no Turso e é seguro rodar várias vezes.
 * Roda uma única vez por instância (cache da Promise).
 */
let _done: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!_done) {
    _done = run().catch((e) => {
      // Se falhar, limpa o cache pra tentar de novo na próxima requisição.
      _done = null;
      throw e;
    });
  }
  return _done;
}

async function run(): Promise<void> {
  // Inscrições de push (web push da equipe de comunicação).
  await db.run(sql`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id text PRIMARY KEY,
    prefeitura_id text NOT NULL,
    user_id text,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    criado_em integer NOT NULL DEFAULT (unixepoch())
  )`);

  // Mensagens já processadas do WhatsApp (idempotência contra reenvios da Meta).
  await db.run(sql`CREATE TABLE IF NOT EXISTS processed_messages (
    id text PRIMARY KEY,
    criado_em integer NOT NULL DEFAULT (unixepoch())
  )`);

  // Controle de tentativas de login (rate-limit simples por e-mail).
  await db.run(sql`CREATE TABLE IF NOT EXISTS auth_throttle (
    email text PRIMARY KEY,
    fails integer NOT NULL DEFAULT 0,
    locked_until integer NOT NULL DEFAULT 0,
    atualizado_em integer NOT NULL DEFAULT (unixepoch())
  )`);

  // Índices para as consultas quentes (lookup de secretário por telefone a cada
  // mensagem, listagens por prefeitura, fotos por release, etc.).
  const indexes = [
    sql`CREATE INDEX IF NOT EXISTS idx_secretarios_telefone ON secretarios (telefone)`,
    sql`CREATE INDEX IF NOT EXISTS idx_secretarios_pref ON secretarios (prefeitura_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_releases_pref_criado ON releases (prefeitura_id, criado_em)`,
    sql`CREATE INDEX IF NOT EXISTS idx_releases_secretario ON releases (secretario_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_fotos_release ON fotos (release_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_fotos_pref ON fotos (prefeitura_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_push_pref ON push_subscriptions (prefeitura_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_users_pref ON users (prefeitura_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_processed_criado ON processed_messages (criado_em)`,
  ];
  for (const stmt of indexes) await db.run(stmt);
}
