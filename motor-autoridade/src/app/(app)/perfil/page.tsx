import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { Card, Button } from "@/components/ui";
import { EnableNotifications } from "@/components/push/EnableNotifications";
import { BrandSettings } from "./BrandSettings";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super administrador",
  admin: "Administrador",
  client: "Cliente",
  collaborator: "Colaborador",
};

export default async function PerfilPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("client_profiles")
    .select("brand_primary, brand_secondary, brand_accent, logo_url")
    .eq("user_id", user.id)
    .maybeSingle();

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

      <div className="mt-5">
        <BrandSettings initial={profile ?? {}} />
      </div>

      <Link href="/onboarding?refazer=1" className="mt-5 block">
        <Card className="flex items-center justify-between">
          <div>
            <span className="text-ink-900">Refazer anamnese editorial</span>
            <span className="block text-xs text-ink-400">Atualiza seu perfil e regenera o DNA Editorial</span>
          </div>
          <span className="text-brand-700">→</span>
        </Card>
      </Link>

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
