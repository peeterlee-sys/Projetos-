#!/usr/bin/env python3
"""
Cria (ou atualiza a senha de) um usuário de login da plataforma do cliente,
vinculado a uma organização.

Uso (a partir da raiz do projeto, com o venv ativo):
    python3 scripts/create_user.py --email voce@prefeitura.gov.br --senha "SenhaForte123" --org <ORG_ID> --nome "Fulano"

Listar organizações disponíveis:
    python3 scripts/create_user.py --listar-orgs
"""
import argparse
import asyncio
import os
import sys

# Permite rodar de qualquer lugar: garante a raiz do projeto no sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func

from src.core.database import AsyncSessionLocal, init_db
from src.core.models import User, Organization
from src.core.security import hash_password


async def listar_orgs():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Organization).order_by(Organization.name))
        orgs = res.scalars().all()
        if not orgs:
            print("Nenhuma organização cadastrada.")
            return
        print(f"{'ORG_ID':38}  NOME")
        for o in orgs:
            print(f"{o.id:38}  {o.name}" + (f" — {o.city}" if o.city else ""))


async def upsert_user(email: str, senha: str, org_id: str, nome: str):
    email = email.strip().lower()
    async with AsyncSessionLocal() as db:
        org = await db.get(Organization, org_id)
        if not org:
            print(f"ERRO: organização '{org_id}' não encontrada. Use --listar-orgs.")
            sys.exit(1)

        res = await db.execute(select(User).where(func.lower(User.email) == email))
        user = res.scalar_one_or_none()

        if user:
            user.password_hash = hash_password(senha)
            user.org_id = org_id
            if nome:
                user.name = nome
            user.is_active = True
            await db.commit()
            print(f"✓ Senha atualizada para usuário existente: {email}  (org: {org.name})")
        else:
            user = User(
                email=email,
                password_hash=hash_password(senha),
                org_id=org_id,
                name=nome or None,
            )
            db.add(user)
            await db.commit()
            print(f"✓ Usuário criado: {email}  (org: {org.name})")


async def main():
    p = argparse.ArgumentParser()
    p.add_argument("--listar-orgs", action="store_true", help="Lista as organizações e seus IDs")
    p.add_argument("--email")
    p.add_argument("--senha")
    p.add_argument("--org", help="ORG_ID da organização")
    p.add_argument("--nome", default="")
    args = p.parse_args()

    await init_db()  # garante que a tabela users exista

    if args.listar_orgs:
        await listar_orgs()
        return

    if not (args.email and args.senha and args.org):
        print("Faltam argumentos. Ex.:")
        print('  python3 scripts/create_user.py --email a@b.gov.br --senha "Senha123" --org <ORG_ID> --nome "Nome"')
        print("Ou:  python3 scripts/create_user.py --listar-orgs")
        sys.exit(1)

    if len(args.senha) < 8:
        print("ERRO: a senha deve ter ao menos 8 caracteres.")
        sys.exit(1)

    await upsert_user(args.email, args.senha, args.org, args.nome)


if __name__ == "__main__":
    asyncio.run(main())
