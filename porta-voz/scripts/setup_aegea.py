"""
Setup do cliente AEGEA — cria 1 organização por cidade (direto no SQLite).

Modelo "responsável por cidade": como os destinatários de alerta são buscados
por org_id (sem filtro de cidade no código), cada cidade vira uma organização
separada, com seus próprios responsáveis. Assim os alertas de cada cidade vão
só para quem responde por ela.

O que este script faz:
  • Cria uma org por cidade da AEGEA (idempotente — pula as que já existem).
  • Nome padronizado "AEGEA — <Cidade>" para facilitar achar depois.
  • Grava direto no banco (contorna o 401 da API no servidor).

O que ele NÃO faz (de propósito):
  • Não cadastra rádio/programa — a AEGEA ainda não passou quais monitorar.
    Quando passar, use o setup de rádio (ver setup_balneario_camboriu.py) por org.
  • Não cadastra telefones — os responsáveis de cada cidade entram depois com:
        python3 scripts/ativar_telefones_cliente.py --org "AEGEA — <Cidade>" \
            --tel "Fulano:5547999998888" --tel "Ciclano:5547999997777"

─── USO ─────────────────────────────────────────────────────────────────────
    cd /root/projetos-/porta-voz
    python3 scripts/setup_aegea.py            # cria as orgs
    python3 scripts/setup_aegea.py --list     # só mostra o estado atual
    python3 scripts/setup_aegea.py --dry-run  # simula, não grava
"""
import argparse
import json
import sqlite3
import sys
import uuid
from datetime import datetime

CLIENTE = "AEGEA"

# Cidades da AEGEA (todas em SC). Edite aqui se entrar/sair cidade.
CIDADES = [
    ("Bombinhas", "SC"),
    ("Brusque", "SC"),
    ("Camboriú", "SC"),
    ("Palhoça", "SC"),
    ("Penha", "SC"),
    ("São Francisco do Sul", "SC"),
]

PLAN = "mvp"
DB_PATH = "porta_voz.db"


def org_name(cidade: str) -> str:
    return f"{CLIENTE} — {cidade}"


def build_settings(cidade: str, uf: str) -> str:
    """
    settings.city_context alimenta a análise do Claude. Preencha prefeito,
    secretários, câmara, bairros etc. quando tiver — melhora a precisão.
    Por enquanto vai só cidade/estado.
    """
    return json.dumps(
        {
            "client": CLIENTE,
            "city_context": {
                "city": cidade,
                "state": uf,
                # TODO preencher quando tiver os dados de cada cidade:
                # "prefeito": "...", "vice_prefeito": "...",
                # "secretarios": "...", "camara": "...", "bairros": "...",
            },
        },
        ensure_ascii=False,
    )


def list_state(cur: sqlite3.Cursor) -> None:
    print("\n[Orgs AEGEA no banco]")
    rows = cur.execute(
        "SELECT id, name, city, is_active FROM organizations WHERE name LIKE ? ORDER BY name",
        (f"{CLIENTE} —%",),
    ).fetchall()
    if not rows:
        print("  (nenhuma ainda)")
        return
    for oid, name, city, active in rows:
        n = cur.execute(
            "SELECT COUNT(*) FROM alert_recipients WHERE org_id = ? AND is_active = 1", (oid,)
        ).fetchone()[0]
        flag = "✓" if active else "✗"
        print(f"  {flag} {name}  ({oid[:8]}...)  — {n} telefone(s) ativo(s)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Setup do cliente AEGEA (1 org por cidade).")
    ap.add_argument("--db", default=DB_PATH, help="Caminho do banco SQLite.")
    ap.add_argument("--list", action="store_true", help="Só listar o estado atual.")
    ap.add_argument("--dry-run", action="store_true", help="Simula, não grava.")
    args = ap.parse_args()

    print("=" * 60)
    print(f"  PORTA VOZ — Setup {CLIENTE} ({len(CIDADES)} cidades)")
    print("=" * 60)

    try:
        db = sqlite3.connect(args.db)
    except sqlite3.Error as e:
        print(f"✗ Não abriu o banco '{args.db}': {e}")
        return 1
    cur = db.cursor()

    if args.list:
        list_state(cur)
        db.close()
        return 0

    created = skipped = 0
    now = datetime.utcnow().isoformat()

    for cidade, uf in CIDADES:
        name = org_name(cidade)
        existing = cur.execute(
            "SELECT id FROM organizations WHERE lower(name) = lower(?)", (name,)
        ).fetchone()
        if existing:
            print(f"  = {name} já existe ({existing[0][:8]}...) — pulado")
            skipped += 1
            continue

        oid = uuid.uuid4().hex
        cur.execute(
            "INSERT INTO organizations (id, name, city, state, plan, is_active, settings, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
            (oid, name, cidade, uf, PLAN, build_settings(cidade, uf), now, now),
        )
        print(f"  + {name} criada ({oid[:8]}...)")
        created += 1

    if args.dry_run:
        db.rollback()
        print(f"\n[dry-run] nada gravado. Seriam: +{created} criadas, ={skipped} já existiam.")
        db.close()
        return 0

    db.commit()
    print("\n" + "=" * 60)
    print(f"  ✅ Concluído: +{created} criadas · ={skipped} já existiam")
    list_state(cur)

    print("\n  Próximos passos por cidade:")
    print("    1) Ativar os responsáveis (quando a AEGEA passar os telefones):")
    for cidade, _ in CIDADES:
        print(f'       python3 scripts/ativar_telefones_cliente.py --org "{org_name(cidade)}" \\')
        print('           --tel "Responsável:55XXXXXXXXXXX"')
    print("    2) Cadastrar a rádio/programa de cada cidade (quando definirem quais monitorar).")
    print("\n  ⚠️  Reinicie o serviço depois de ativar telefones:")
    print("      systemctl restart porta-voz.service")
    print("=" * 60)

    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
