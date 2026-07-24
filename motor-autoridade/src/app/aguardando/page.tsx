import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TakeLogo } from "@/components/brand/TakeLogo";

/**
 * Tela de espera para cadastros pendentes de aprovação. Se a conta já foi
 * aprovada (is_active = true), segue para o app.
 */
export default async function AguardandoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.from("users").select("is_active").eq("id", user.id).maybeSingle();
  if (data?.is_active) redirect("/hoje");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <TakeLogo size={44} />
      <div className="mt-8 rounded-3xl bg-white/70 p-8 ring-1 ring-sand-200">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-300/30 text-2xl">
          ⏳
        </span>
        <h1 className="mt-4 font-serif text-2xl text-brand-700">Cadastro em análise</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
          Recebemos seu cadastro, {user.full_name?.split(" ")[0] || "tudo certo"}! Seu acesso ao
          Take passa por uma aprovação. Assim que for liberado, você entra e responde a anamnese
          editorial.
        </p>
        <p className="mt-3 text-sm text-ink-500">
          Você usará o e-mail <span className="font-medium text-ink-900">{user.email}</span> para
          entrar.
        </p>
      </div>

      <form action="/auth/signout" method="post" className="mt-6">
        <button type="submit" className="text-sm text-ink-500 underline-offset-4 hover:underline">
          Sair
        </button>
      </form>
    </main>
  );
}
