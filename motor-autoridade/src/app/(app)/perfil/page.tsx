import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { Card, Button } from "@/components/ui";
import { EnableNotifications } from "@/components/push/EnableNotifications";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super administrador",
  admin: "Administrador",
  client: "Cliente",
  collaborator: "Colaborador",
};

export default async function PerfilPage() {
  const user = await requireUser();

  return (
    <main className="px-5 pt-8">
      <h1 className="mb-6 font-serif text-3xl text-ink-900">Perfil</h1>
      <Card className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">Nome</p>
          <p className="text-ink-900">{user.full_name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">E-mail</p>
          <p className="text-ink-900">{user.email}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">Papel</p>
          <p className="text-ink-900">{ROLE_LABEL[user.role] ?? user.role}</p>
        </div>
      </Card>

      {user.role === "admin" || user.role === "super_admin" ? (
        <Link href="/admin" className="mt-5 block">
          <Card className="flex items-center justify-between">
            <span className="text-ink-900">Dashboard administrativo</span>
            <span className="text-brand-700">→</span>
          </Card>
        </Link>
      ) : null}

      <div className="mt-5">
        <p className="mb-2 text-xs uppercase tracking-wide text-ink-400">Notificações</p>
        <EnableNotifications />
      </div>

      <form action="/auth/signout" method="post" className="mt-5">
        <Button type="submit" variant="secondary" full>
          Sair
        </Button>
      </form>
    </main>
  );
}
