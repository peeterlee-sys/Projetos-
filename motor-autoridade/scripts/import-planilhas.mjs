#!/usr/bin/env node
/**
 * IMPORTAÇÃO DAS PLANILHAS ANTIGAS → Postgres (Assessor 24h)
 *
 * Lê os dois CSVs exportados do Google Sheets e grava tudo em
 * `legacy_vereadores`, casando os dois arquivos pelo telefone:
 *
 *   • "Planilha de Nomes"          → A: Phone · B: Nome · C: Partido ·
 *                                     D: Cidade · E: Contexto · F: Perfil
 *   • "Respostas do Formulário"    → cabeçalho do Google Form, coluna a coluna
 *
 * A partir daí o assistente do WhatsApp encontra o vereador por telefone
 * (ação get_vereador) mesmo antes de ele preencher a anamnese web. Quando ele
 * preenche, o registro é vinculado automaticamente ao usuário do app.
 *
 * Uso:
 *   node scripts/import-planilhas.mjs --nomes nomes.csv --respostas respostas.csv [--dry-run]
 *
 * Requer no ambiente:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs";

// ── CLI ─────────────────────────────────────────────────────────────────────
function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const NOMES = arg("nomes");
const RESPOSTAS = arg("respostas");
const DRY_RUN = process.argv.includes("--dry-run");

if (!NOMES && !RESPOSTAS) {
  console.error(
    "Uso: node scripts/import-planilhas.mjs --nomes nomes.csv [--respostas respostas.csv] [--dry-run]"
  );
  process.exit(1);
}

// ── CSV (com aspas, vírgulas e quebras de linha dentro do campo) ────────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Linhas como objetos, usando a primeira linha como cabeçalho. */
function toObjects(rows) {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => {
      o[h] = (r[i] ?? "").trim();
    });
    return o;
  });
}

// ── Telefone canônico (espelha src/lib/phone.ts) ─────────────────────────────
function normalizePhoneBR(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D+/g, "");
  d = d.replace(/^0+/, "");
  if (d.startsWith("055")) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!d.startsWith("55")) return null;
  if (d.length !== 12 && d.length !== 13) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return d;
}

/** Chave de casamento entre as duas planilhas: ignora o 9º dígito. */
function phoneKey(canonical) {
  const ddd = canonical.slice(2, 4);
  const local = canonical.slice(4);
  const base = local.length === 9 && local.startsWith("9") ? local.slice(1) : local;
  return `55${ddd}${base}`;
}

/** Acha uma coluna pelo nome aproximado (acentos e caixa não importam). */
function pick(obj, ...names) {
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const keys = Object.keys(obj);
  for (const name of names) {
    const target = norm(name);
    const hit = keys.find((k) => norm(k) === target) ?? keys.find((k) => norm(k).includes(target));
    if (hit && obj[hit]?.trim()) return obj[hit].trim();
  }
  return "";
}

/** "São José/SC" ou "São José - SC" → { city, state } */
function splitCity(raw) {
  if (!raw) return { city: null, state: null };
  const m = raw.match(/^(.*?)[\s]*[/\-–][\s]*([A-Za-z]{2})$/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
  return { city: raw.trim(), state: null };
}

// ── Leitura ─────────────────────────────────────────────────────────────────
const byPhone = new Map(); // phoneKey → registro consolidado

if (NOMES) {
  const rows = parseCsv(readFileSync(NOMES, "utf8"));
  // A planilha de nomes pode ou não ter cabeçalho: se a coluna A da 1ª linha
  // não vira telefone, tratamos a linha como cabeçalho e a descartamos.
  const start = normalizePhoneBR(rows[0]?.[0]) ? 0 : 1;
  let skipped = 0;

  for (const r of rows.slice(start)) {
    const phone = normalizePhoneBR(r[0]);
    if (!phone) {
      skipped++;
      continue;
    }
    const { city, state } = splitCity(r[3] ?? "");
    byPhone.set(phoneKey(phone), {
      phone,
      name: (r[1] ?? "").trim() || null,
      political_name: (r[1] ?? "").trim() || null,
      party: (r[2] ?? "").trim() || null,
      city,
      state,
      local_context: (r[4] ?? "").trim() || null,
      profile_text: (r[5] ?? "").trim() || null,
      form_answers: {},
      source: "planilha_nomes",
    });
  }
  console.log(`Planilha de nomes: ${byPhone.size} vereador(es), ${skipped} linha(s) sem telefone.`);
}

if (RESPOSTAS) {
  const answers = toObjects(parseCsv(readFileSync(RESPOSTAS, "utf8")));
  let matched = 0;
  let created = 0;
  let skipped = 0;

  for (const a of answers) {
    const phone = normalizePhoneBR(pick(a, "telefone", "whatsapp", "celular", "phone"));
    if (!phone) {
      skipped++;
      continue;
    }
    const key = phoneKey(phone);
    const existing = byPhone.get(key);
    const { city, state } = splitCity(pick(a, "cidade", "municipio"));

    if (existing) {
      matched++;
      existing.form_answers = a;
      existing.name ??= pick(a, "nome completo", "nome") || null;
      existing.political_name ??= pick(a, "nome politico", "nome de urna") || null;
      existing.party ??= pick(a, "partido") || null;
      existing.city ??= city;
      existing.state ??= state;
      existing.source = "planilha_nomes+respostas";
    } else {
      created++;
      byPhone.set(key, {
        phone,
        name: pick(a, "nome completo", "nome") || null,
        political_name: pick(a, "nome politico", "nome de urna") || null,
        party: pick(a, "partido") || null,
        city,
        state,
        local_context: pick(a, "contexto", "sobre a cidade") || null,
        profile_text: null,
        form_answers: a,
        source: "planilha_respostas",
      });
    }
  }
  console.log(
    `Respostas do formulário: ${matched} casada(s) por telefone, ${created} nova(s), ${skipped} sem telefone.`
  );
}

const records = [...byPhone.values()];
console.log(`\nTotal consolidado: ${records.length} registro(s).`);

if (DRY_RUN) {
  console.log("\n--dry-run: nada foi gravado. Amostra:");
  console.log(JSON.stringify(records.slice(0, 3), null, 2));
  process.exit(0);
}

// ── Gravação ────────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}
// Import dinâmico: o --dry-run roda sem dependências instaladas.
const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Vereadores que já fizeram a anamnese no app: o registro nasce vinculado.
const { data: profiles } = await supabase
  .from("client_profiles")
  .select("user_id, phone")
  .not("phone", "is", null);
const linkByKey = new Map(
  (profiles ?? [])
    .map((p) => [normalizePhoneBR(p.phone), p.user_id])
    .filter(([ph]) => ph)
    .map(([ph, id]) => [phoneKey(ph), id])
);

let ok = 0;
for (let i = 0; i < records.length; i += 100) {
  const batch = records.slice(i, i + 100).map((r) => ({
    ...r,
    linked_user_id: linkByKey.get(phoneKey(r.phone)) ?? null,
  }));
  const { error } = await supabase.from("legacy_vereadores").upsert(batch, { onConflict: "phone" });
  if (error) {
    console.error(`Falha no lote ${i / 100 + 1}: ${error.message}`);
    process.exit(1);
  }
  ok += batch.length;
  console.log(`Gravados ${ok}/${records.length}…`);
}

const linked = records.filter((r) => linkByKey.has(phoneKey(r.phone))).length;
console.log(
  `\nPronto. ${ok} registro(s) em legacy_vereadores — ${linked} já vinculado(s) a contas do app.`
);
console.log("Confira em /admin/vereadores.");
