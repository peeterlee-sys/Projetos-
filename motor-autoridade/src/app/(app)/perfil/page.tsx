import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { EnableNotifications } from "@/components/push/EnableNotifications";
import { BrandDisclosure } from "./BrandDisclosure";

export default async function PerfilPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: prefs }] = await Promise.all([
    supabase
      .from("client_profiles")
      .select(
        "display_name, profession, field_of_work, main_themes, tone_of_voice, forbidden_themes, brand_primary, brand_secondary, brand_accent, logo_url"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("client_preferences").select("weekly_goal").eq("user_id", user.id).maybeSingle(),
  ]);

  const name = user.full_name ?? profile?.display_name ?? "—";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const tagline = [profile?.profession, profile?.field_of_work].filter(Boolean).join(" · ");
  const themes = (profile?.main_themes ?? []) as string[];
  const forbidden = (profile?.forbidden_themes ?? []) as string[];
  const isAdmin = user.role === "admin" || user.role === "super_admin";

  return (
    <main className="px-5 pt-8">
      {/* Cabeçalho: avatar + nome + tagline */}
      <header className="mb-6 flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-700 text-2xl font-medium text-sand-50">
          {initial}
        </span>
        <div className="min-w-0">
          <h1 className="font-serif text-2xl text-ink-900">{name}</h1>
          {tagline ? <p className="text-sm text-ink-500">{tagline}</p> : null}
        </div>
      </header>

      {/* Perfil editorial */}
      <div className="rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
          Perfil editorial
        </p>
        <div className="mt-3 space-y-2 text-[15px] text-ink-700">
          {themes.length ? (
            <p>
              <span className="font-medium text-ink-900">Temas:</span> {themes.join(", ")}.
            </p>
          ) : null}
          {profile?.tone_of_voice ? (
            <p>
              <span className="font-medium text-ink-900">Tom:</span> {profile.tone_of_voice}.
            </p>
          ) : null}
          {forbidden.length ? (
            <p>
              <span className="font-medium text-ink-900">Evitar:</span> {forbidden.join(", ")}.
            </p>
          ) : null}
          {!themes.length && !profile?.tone_of_voice && !forbidden.length ? (
            <p className="text-ink-500">Complete seu onboarding para definir seu perfil editorial.</p>
          ) : null}
        </div>
        <Link
          href="/onboarding"
          className="mt-3 inline-block text-sm font-medium text-brand-700"
        >
          Editar perfil →
        </Link>
      </div>

      {/* Identidade visual (abre o editor de marca) */}
      <div className="mt-4">
        <BrandDisclosure
          initial={profile ?? {}}
          preview={{
            primary: profile?.brand_primary ?? "#1d4a38",
            accent: profile?.brand_accent ?? "#c9a94e",
          }}
        />
      </div>

      {/* Preferências */}
      <div className="mt-4 space-y-3 rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
        <div className="flex items-center justify-between">
          <span className="text-[15px] text-ink-700">Meta semanal</span>
          <span className="font-semibold text-ink-900">
            {prefs?.weekly_goal ?? 3} conteúdos
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[15px] text-ink-700">Pauta do dia às</span>
          <span className="font-semibold text-ink-900">7h00</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-ink-700">Notificações</span>
          <EnableNotifications />
        </div>
      </div>

      {isAdmin ? (
        <Link
          href="/admin"
          className="mt-4 flex items-center justify-between rounded-[24px] bg-white p-5 ring-1 ring-sand-200"
        >
          <span className="text-ink-900">Dashboard administrativo</span>
          <span className="text-brand-700">→</span>
        </Link>
      ) : null}

      <form action="/auth/signout" method="post" className="mt-6 mb-2 text-center">
        <button type="submit" className="text-sm text-ink-500 underline-offset-4 hover:underline">
          Sair (voltar ao início)
        </button>
      </form>
    </main>
  );
}
