"""
Ativa os telefones de alerta de um cliente — direto no SQLite.

Por que direto no banco? No servidor a API responde 401 (código divergente),
então cadastrar por HTTP não é confiável. Este script escreve na tabela
`alert_recipients` e é o caminho recomendado para ativar um cliente na hora.

O que ele garante (regras da seção 9 do handoff):
  • Valida o formato do telefone (55 + DDD + número). Formato errado NÃO entra
    no banco — nada de falha silenciosa no envio.
  • urgency_filter = "low" por padrão → o cliente recebe TODOS os alertas
    disparados (high/critical).
  • Idempotente: não duplica número já ativo; reativa número que estava
    soft-deletado.
  • Resolve a org por ID ou por nome; se não achar, lista as orgs disponíveis.

─── USO RÁPIDO (edite o bloco CONFIG e rode) ────────────────────────────────
    cd /root/projetos-/porta-voz
    python3 scripts/ativar_telefones_cliente.py
    systemctl restart porta-voz.service

─── USO POR LINHA DE COMANDO (sem editar o arquivo) ─────────────────────────
    # Ativar por nome da org:
    python3 scripts/ativar_telefones_cliente.py \
        --org "Prefeitura de Itapema" \
        --tel "Prefeito:5547999990001" \
        --tel "Chefe de Gabinete:5547999990002"

    # Ativar por ID da org:
    python3 scripts/ativar_telefones_cliente.py --org-id <ORG_ID> --tel "Assessoria:5547999990003"

    # Só conferir quem já está ativo:
    python3 scripts/ativar_telefones_cliente.py --org "Prefeitura de Itapema" --list

    # Desativar um número (soft-delete):
    python3 scripts/ativar_telefones_cliente.py --org "Prefeitura de Itapema" --desativar 5547999990001

    # Simular sem gravar:
    python3 scripts/ativar_telefones_cliente.py --dry-run

Depois de ativar, reinicie o serviço:
    systemctl restart porta-voz.service
"""
import argparse
import re
import sqlite3
import sys
import uuid
from datetime import datetime

# ═══════════════════════════════════════════════════════════════════════════
#  CONFIG — edite aqui para o uso rápido (ou passe tudo por linha de comando)
# ═══════════════════════════════════════════════════════════════════════════

# Org do cliente: pode ser o NOME (será resolvido no banco) ou o ID direto.
ORG = "COLE_O_NOME_OU_ID_DA_ORG"

# Telefones a ativar: (Nome do contato, Telefone). Um por linha.
# Formato do telefone: 55 + DDD + número, só dígitos. Ex.: 5547999998888
# (Pode colar com +, espaço, parênteses ou traço — o script limpa e valida.)
NUMEROS = [
    ("Contato 1", "5547999990001"),
    ("Contato 2", "5547999990002"),
]

# Urgência mínima para receber. "low" = recebe tudo que for disparado.
URGENCY_FILTER = "low"

# Caminho do banco (relativo à pasta do projeto).
DB_PATH = "porta_voz.db"

# ═══════════════════════════════════════════════════════════════════════════

VALID_URGENCIES = ("low", "medium", "high", "critical")


def normalize_phone(raw: str) -> tuple[str | None, str]:
    """
    Limpa e valida um telefone para o formato Z-API (55 + DDD + número).

    Retorna (numero_valido, observacao). Se inválido, numero_valido é None.
    """
    if raw is None:
        return None, "vazio"

    digits = re.sub(r"\D", "", str(raw))
    note = ""

    if not digits:
        return None, "sem dígitos"

    # Falta o código do país (55): DDD + número = 10 (fixo) ou 11 (celular).
    if not digits.startswith("55") and len(digits) in (10, 11):
        digits = "55" + digits
        note = "adicionado código 55"

    # 55 + DDD(2) + número(8 fixo ou 9 celular) = 12 ou 13 dígitos.
    if not digits.startswith("55"):
        return None, "não começa com 55 (código do Brasil)"
    if len(digits) not in (12, 13):
        return None, f"tamanho inesperado ({len(digits)} dígitos; esperado 12 ou 13)"

    ddd = digits[2:4]
    if not (11 <= int(ddd) <= 99):
        return None, f"DDD inválido ({ddd})"

    return digits, note


def resolve_org(cur: sqlite3.Cursor, org_ref: str) -> str | None:
    """Resolve a org por ID exato, depois por nome exato, depois por nome parcial."""
    # ID exato
    row = cur.execute("SELECT id, name FROM organizations WHERE id = ?", (org_ref,)).fetchone()
    if row:
        print(f"  → Org: {row[1]} ({row[0][:8]}...)")
        return row[0]

    # Nome exato (case-insensitive)
    rows = cur.execute(
        "SELECT id, name FROM organizations WHERE lower(name) = lower(?)", (org_ref,)
    ).fetchall()
    if len(rows) == 1:
        print(f"  → Org: {rows[0][1]} ({rows[0][0][:8]}...)")
        return rows[0][0]

    # Nome parcial
    if not rows:
        rows = cur.execute(
            "SELECT id, name FROM organizations WHERE lower(name) LIKE lower(?)",
            (f"%{org_ref}%",),
        ).fetchall()

    if len(rows) == 1:
        print(f"  → Org: {rows[0][1]} ({rows[0][0][:8]}...)")
        return rows[0][0]

    if len(rows) > 1:
        print(f"  ✗ '{org_ref}' é ambíguo. Orgs que batem:")
        for oid, name in rows:
            print(f"      {oid}  {name}")
        print("    Use --org-id <ID> para escolher.")
        return None

    # Nada encontrado — mostra todas
    print(f"  ✗ Nenhuma org encontrada para '{org_ref}'. Orgs disponíveis:")
    for oid, name in cur.execute("SELECT id, name FROM organizations ORDER BY name").fetchall():
        print(f"      {oid}  {name}")
    return None


def list_recipients(cur: sqlite3.Cursor, org_id: str) -> None:
    rows = cur.execute(
        "SELECT name, phone, urgency_filter, is_active FROM alert_recipients "
        "WHERE org_id = ? ORDER BY is_active DESC, name",
        (org_id,),
    ).fetchall()
    if not rows:
        print("  (nenhum destinatário cadastrado nesta org)")
        return
    print(f"  {len(rows)} destinatário(s):")
    for name, phone, urg, active in rows:
        flag = "✓ ativo " if active else "✗ inativo"
        print(f"      {flag}  {phone}  [{urg}]  {name or '—'}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Ativa telefones de alerta de um cliente (direto no SQLite).")
    ap.add_argument("--org", help="Nome (ou ID) da org do cliente. Sobrescreve o CONFIG.")
    ap.add_argument("--org-id", help="ID exato da org (evita ambiguidade de nome).")
    ap.add_argument("--tel", action="append", default=[], metavar="Nome:Telefone",
                    help="Telefone a ativar, formato 'Nome:5547999998888'. Repita para vários.")
    ap.add_argument("--urgency", default=URGENCY_FILTER, choices=VALID_URGENCIES,
                    help='Urgência mínima para receber (padrão "low" = recebe tudo).')
    ap.add_argument("--db", default=DB_PATH, help="Caminho do banco SQLite.")
    ap.add_argument("--list", action="store_true", help="Só listar os destinatários atuais da org.")
    ap.add_argument("--desativar", metavar="TELEFONE", help="Desativar (soft-delete) este número na org.")
    ap.add_argument("--dry-run", action="store_true", help="Simula, não grava nada.")
    args = ap.parse_args()

    org_ref = args.org_id or args.org or ORG
    if org_ref == "COLE_O_NOME_OU_ID_DA_ORG":
        print("✗ Configure a org: edite ORG no topo do arquivo ou use --org / --org-id.")
        return 1

    # Monta a lista de números: CLI tem prioridade sobre o CONFIG.
    if args.tel:
        numeros = []
        for item in args.tel:
            if ":" not in item:
                print(f"✗ --tel inválido: '{item}'. Use 'Nome:Telefone'.")
                return 1
            name, phone = item.split(":", 1)
            numeros.append((name.strip(), phone.strip()))
    else:
        numeros = list(NUMEROS)

    print("=" * 60)
    print("  PORTA VOZ — Ativação de telefones de alerta")
    print("=" * 60)

    try:
        db = sqlite3.connect(args.db)
    except sqlite3.Error as e:
        print(f"✗ Não abriu o banco '{args.db}': {e}")
        return 1
    cur = db.cursor()

    org_id = resolve_org(cur, org_ref)
    if not org_id:
        db.close()
        return 1

    # Modo listar
    if args.list:
        print("\n[Destinatários atuais]")
        list_recipients(cur, org_id)
        db.close()
        return 0

    # Modo desativar
    if args.desativar:
        phone, note = normalize_phone(args.desativar)
        if not phone:
            print(f"✗ Telefone inválido para desativar: {args.desativar} ({note})")
            db.close()
            return 1
        n = cur.execute(
            "UPDATE alert_recipients SET is_active = 0 WHERE org_id = ? AND phone = ?",
            (org_id, phone),
        ).rowcount
        if args.dry_run:
            db.rollback()
            print(f"\n[dry-run] desativaria {n} registro(s) do número {phone}")
        else:
            db.commit()
            print(f"\n  ✓ {n} registro(s) do número {phone} desativado(s).")
            print("\n  Reinicie o serviço:  systemctl restart porta-voz.service")
        db.close()
        return 0

    # Modo ativar
    print(f"\n[Validando {len(numeros)} número(s)]")
    to_insert: list[tuple[str, str]] = []
    invalid = 0
    for name, raw in numeros:
        phone, note = normalize_phone(raw)
        if not phone:
            print(f"  ✗ {name or '—'}: '{raw}' inválido ({note}) — NÃO será cadastrado")
            invalid += 1
            continue
        suffix = f"  ({note})" if note else ""
        print(f"  ✓ {name or '—'}: {phone}{suffix}")
        to_insert.append((name, phone))

    if invalid:
        print(f"\n✗ {invalid} número(s) inválido(s). Corrija antes de prosseguir — "
              f"formato errado causa falha silenciosa no envio.")
        db.close()
        return 1

    if not to_insert:
        print("\n✗ Nenhum número para ativar.")
        db.close()
        return 1

    print(f"\n[Gravando na org {org_id[:8]}...]")
    added = reactivated = skipped = 0
    now = datetime.utcnow().isoformat()

    for name, phone in to_insert:
        existing = cur.execute(
            "SELECT id, is_active FROM alert_recipients WHERE org_id = ? AND phone = ?",
            (org_id, phone),
        ).fetchone()

        if existing:
            rec_id, is_active = existing
            if is_active:
                print(f"  = {phone} já estava ativo — pulado")
                skipped += 1
            else:
                cur.execute(
                    "UPDATE alert_recipients SET is_active = 1, urgency_filter = ?, name = ? WHERE id = ?",
                    (args.urgency, name, rec_id),
                )
                print(f"  ↑ {phone} reativado")
                reactivated += 1
        else:
            cur.execute(
                "INSERT INTO alert_recipients (id, org_id, name, phone, is_active, urgency_filter, created_at) "
                "VALUES (?, ?, ?, ?, 1, ?, ?)",
                (uuid.uuid4().hex, org_id, name, phone, args.urgency, now),
            )
            print(f"  + {phone} adicionado")
            added += 1

    if args.dry_run:
        db.rollback()
        print(f"\n[dry-run] nada gravado. Seriam: +{added} novos, ↑{reactivated} reativados, ={skipped} já ativos.")
    else:
        db.commit()
        print("\n" + "=" * 60)
        print(f"  ✅ Concluído: +{added} novos · ↑{reactivated} reativados · ={skipped} já ativos")
        print(f"  Urgência: {args.urgency}  (\"low\"/\"high\" = recebe todos os alertas)")
        print("\n  ⚠️  Reinicie o serviço para valer:")
        print("      systemctl restart porta-voz.service")
        print("=" * 60)

    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
