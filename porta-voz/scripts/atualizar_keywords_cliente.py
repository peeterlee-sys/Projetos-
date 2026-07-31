"""
Atualiza as keywords (filtros) de um cliente — por cidade/org, direto no SQLite.

Keywords são por org_id (podem ter category e weight), então no modelo
"1 org por cidade" cada cidade tem o seu próprio filtro. Este script adiciona
keywords a uma org específica, ou a base de saneamento a todas as orgs AEGEA
de uma vez.

Garantias:
  • Idempotente: não duplica termo já ativo na org; reativa termo soft-deletado.
  • Grava direto no banco (contorna o 401 da API no servidor).
  • Aditivo por padrão (não apaga o que já existe). Use --substituir para
    desativar as keywords atuais da org antes de inserir as novas.

─── USO ─────────────────────────────────────────────────────────────────────
    cd /root/projetos-/porta-voz

    # Aplicar a base de saneamento a TODAS as orgs AEGEA:
    python3 scripts/atualizar_keywords_cliente.py --todas-aegea --incluir-base

    # Base + termos específicos de uma cidade:
    python3 scripts/atualizar_keywords_cliente.py --org "AEGEA — Camboriú" \
        --incluir-base --kw "córrego do 40" --kw "bairro tabuleiro"

    # Só termos específicos (sem a base):
    python3 scripts/atualizar_keywords_cliente.py --org "AEGEA — Penha" \
        --kw "orla de penha" --kw "beto carrero"

    # Conferir as keywords atuais de uma cidade:
    python3 scripts/atualizar_keywords_cliente.py --org "AEGEA — Penha" --list

    # Substituir o filtro inteiro da cidade:
    python3 scripts/atualizar_keywords_cliente.py --org "AEGEA — Brusque" \
        --incluir-base --substituir
"""
import argparse
import sqlite3
import sys
import uuid
from datetime import datetime

# ═══════════════════════════════════════════════════════════════════════════
#  BASE DE SANEAMENTO (AEGEA) — comum a todas as cidades. Edite à vontade.
# ═══════════════════════════════════════════════════════════════════════════
BASE_SANEAMENTO = [
    # Serviço e infraestrutura
    "aegea",
    "saneamento",
    "água",
    "falta de água",
    "falta d'água",
    "abastecimento de água",
    "esgoto",
    "esgoto a céu aberto",
    "estação de tratamento",
    "eta",
    "ete",
    "rede de água",
    "rede de esgoto",
    "ligação de esgoto",
    "coleta de esgoto",
    "tratamento de esgoto",
    "vazamento",
    "cano estourado",
    "adutora",
    "reservatório",
    "poço",
    "água suja",
    "água barrenta",
    "sem água",
    # Cobrança e relação com o cliente
    "conta de água",
    "tarifa de água",
    "tarifa de esgoto",
    "reajuste",
    "corte de água",
    "religação",
    "fatura",
    # Institucional / regulatório
    "concessão",
    "concessionária",
    "contrato de concessão",
    "agência reguladora",
    "arcon",
    "audiência pública",
    "obra de saneamento",
]

DB_PATH = "porta_voz.db"
AEGEA_PREFIX = "AEGEA —"


def resolve_orgs(cur: sqlite3.Cursor, org_ref: str | None, todas_aegea: bool) -> list[tuple[str, str]]:
    """Retorna [(org_id, name)] a atualizar. Vazio se não achar (com mensagem)."""
    if todas_aegea:
        rows = cur.execute(
            "SELECT id, name FROM organizations WHERE name LIKE ? ORDER BY name",
            (f"{AEGEA_PREFIX}%",),
        ).fetchall()
        if not rows:
            print(f"  ✗ Nenhuma org '{AEGEA_PREFIX} ...'. Rode antes: python3 scripts/setup_aegea.py")
        return [(r[0], r[1]) for r in rows]

    # ID exato
    row = cur.execute("SELECT id, name FROM organizations WHERE id = ?", (org_ref,)).fetchone()
    if row:
        return [(row[0], row[1])]
    # Nome exato
    rows = cur.execute(
        "SELECT id, name FROM organizations WHERE lower(name) = lower(?)", (org_ref,)
    ).fetchall()
    if not rows:  # nome parcial
        rows = cur.execute(
            "SELECT id, name FROM organizations WHERE lower(name) LIKE lower(?)",
            (f"%{org_ref}%",),
        ).fetchall()
    if len(rows) == 1:
        return [(rows[0][0], rows[0][1])]
    if len(rows) > 1:
        print(f"  ✗ '{org_ref}' é ambíguo:")
        for oid, name in rows:
            print(f"      {oid}  {name}")
        print("    Use o ID exato.")
        return []
    print(f"  ✗ Nenhuma org para '{org_ref}'. Disponíveis:")
    for oid, name in cur.execute("SELECT id, name FROM organizations ORDER BY name").fetchall():
        print(f"      {oid}  {name}")
    return []


def list_keywords(cur: sqlite3.Cursor, org_id: str, name: str) -> None:
    rows = cur.execute(
        "SELECT term, category, weight FROM keywords WHERE org_id = ? AND is_active = 1 ORDER BY term",
        (org_id,),
    ).fetchall()
    print(f"\n  [{name}] {len(rows)} keyword(s) ativa(s):")
    for term, cat, weight in rows:
        extra = f"  ({cat}, peso {weight})" if cat or (weight and weight != 1) else ""
        print(f"      • {term}{extra}")


def apply_to_org(cur, org_id, name, terms, categoria, peso, substituir, dry_run) -> tuple[int, int, int]:
    now = datetime.utcnow().isoformat()
    deactivated = 0
    if substituir:
        deactivated = cur.execute(
            "UPDATE keywords SET is_active = 0 WHERE org_id = ? AND is_active = 1", (org_id,)
        ).rowcount

    added = reactivated = skipped = 0
    for term in terms:
        term = term.strip()
        if not term:
            continue
        existing = cur.execute(
            "SELECT id, is_active FROM keywords WHERE org_id = ? AND lower(term) = lower(?)",
            (org_id, term),
        ).fetchone()
        if existing:
            kid, active = existing
            if active:
                skipped += 1
            else:
                cur.execute(
                    "UPDATE keywords SET is_active = 1, category = ?, weight = ? WHERE id = ?",
                    (categoria, peso, kid),
                )
                reactivated += 1
        else:
            cur.execute(
                "INSERT INTO keywords (id, org_id, program_id, term, category, weight, is_active, created_at) "
                "VALUES (?, ?, NULL, ?, ?, ?, 1, ?)",
                (uuid.uuid4().hex, org_id, term, categoria, peso, now),
            )
            added += 1

    tag = "[dry-run] " if dry_run else ""
    sub = f" (−{deactivated} desativadas)" if substituir else ""
    print(f"  {tag}{name}: +{added} novas · ↑{reactivated} reativadas · ={skipped} já ativas{sub}")
    return added, reactivated, skipped


def main() -> int:
    ap = argparse.ArgumentParser(description="Atualiza keywords (filtros) de um cliente por cidade.")
    ap.add_argument("--org", help="Nome ou ID da org (cidade).")
    ap.add_argument("--todas-aegea", action="store_true", help="Aplicar a todas as orgs 'AEGEA — ...'.")
    ap.add_argument("--incluir-base", action="store_true", help="Incluir a base de saneamento.")
    ap.add_argument("--kw", action="append", default=[], metavar="TERMO",
                    help="Keyword específica. Repita para várias.")
    ap.add_argument("--categoria", default=None, help="Categoria das keywords (ex.: saneamento).")
    ap.add_argument("--peso", type=int, default=1, choices=(1, 2, 3),
                    help="1=normal, 2=importante, 3=crítico.")
    ap.add_argument("--substituir", action="store_true",
                    help="Desativa as keywords atuais da org antes de inserir.")
    ap.add_argument("--db", default=DB_PATH, help="Caminho do banco SQLite.")
    ap.add_argument("--list", action="store_true", help="Só listar as keywords atuais.")
    ap.add_argument("--dry-run", action="store_true", help="Simula, não grava.")
    args = ap.parse_args()

    if not args.org and not args.todas_aegea:
        print("✗ Informe --org \"AEGEA — Cidade\" ou --todas-aegea.")
        return 1

    print("=" * 60)
    print("  PORTA VOZ — Atualização de keywords (filtros)")
    print("=" * 60)

    try:
        db = sqlite3.connect(args.db)
    except sqlite3.Error as e:
        print(f"✗ Não abriu o banco '{args.db}': {e}")
        return 1
    cur = db.cursor()

    orgs = resolve_orgs(cur, args.org, args.todas_aegea)
    if not orgs:
        db.close()
        return 1

    if args.list:
        for org_id, name in orgs:
            list_keywords(cur, org_id, name)
        db.close()
        return 0

    terms = (list(BASE_SANEAMENTO) if args.incluir_base else []) + list(args.kw)
    if not terms:
        print("✗ Nenhuma keyword para aplicar. Use --incluir-base e/ou --kw TERMO.")
        db.close()
        return 1

    # dedup preservando ordem (case-insensitive)
    seen, unique_terms = set(), []
    for t in terms:
        k = t.strip().lower()
        if k and k not in seen:
            seen.add(k)
            unique_terms.append(t.strip())

    print(f"\n[Aplicando {len(unique_terms)} termo(s) a {len(orgs)} org(s)]")
    tot_added = tot_react = tot_skip = 0
    for org_id, name in orgs:
        a, r, s = apply_to_org(cur, org_id, name, unique_terms, args.categoria,
                               args.peso, args.substituir, args.dry_run)
        tot_added += a; tot_react += r; tot_skip += s

    if args.dry_run:
        db.rollback()
        print(f"\n[dry-run] nada gravado. Total: +{tot_added} · ↑{tot_react} · ={tot_skip}")
    else:
        db.commit()
        print("\n" + "=" * 60)
        print(f"  ✅ Total: +{tot_added} novas · ↑{tot_react} reativadas · ={tot_skip} já ativas")
        print("\n  ⚠️  Reinicie o serviço para valer:")
        print("      systemctl restart porta-voz.service")
        print("=" * 60)

    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
