import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { BrandLogo } from "@/components/brand/Logo";
import { brand } from "@/lib/brand";

/**
 * Tela exibida ao concluir a anamnese — substitui o redirecionamento para
 * /hoje, que é a tela de radar/pauta do Take e não existe no Assessor 24h
 * (produto 100% sob demanda pelo WhatsApp, sem dashboard diário).
 */
export default async function ObrigadoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const firstName = user.full_name?.split(" ")[0];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <BrandLogo size={44} />
      <div className="mt-8 rounded-3xl bg-white/70 p-8 ring-1 ring-sand-200">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-100 text-2xl">
          ✅
        </span>
        <h1 className="mt-4 font-serif text-2xl text-brand-700">
          {firstName ? `Obrigado, ${firstName}!` : "Muito obrigado!"}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{brand.thankYou.title}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">{brand.thankYou.body}</p>
      </div>

      <form action="/auth/signout" method="post" className="mt-6">
        <button type="submit" className="text-sm text-ink-500 underline-offset-4 hover:underline">
          Sair
        </button>
      </form>
    </main>
  );
}
