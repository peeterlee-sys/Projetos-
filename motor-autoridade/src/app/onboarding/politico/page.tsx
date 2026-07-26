import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { PoliticalWizard } from "./PoliticalWizard";

/** Anamnese do Assessor 24h — trilha de mandato (vereadores). */
export default async function AnamnesePoliticaPage({
  searchParams,
}: {
  searchParams: Promise<{ refazer?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { refazer } = await searchParams;
  const isRedo = refazer === "1";
  if (user.onboarded_at && !isRedo) redirect("/hoje");

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 py-8">
      {isRedo ? (
        <p className="mb-4 rounded-2xl bg-gold-300/20 p-3 text-sm text-gold-700">
          Você está refazendo a anamnese. Ao concluir, o perfil do mandato e o DNA Editorial serão
          atualizados com as novas respostas.
        </p>
      ) : brand.defaultTrack === "generic" ? (
        <p className="mb-4 text-center text-xs text-ink-400">
          Não tem mandato?{" "}
          <Link href="/onboarding" className="underline hover:text-brand-700">
            Faça a anamnese profissional
          </Link>
        </p>
      ) : null}
      <PoliticalWizard defaultName={user.full_name ?? ""} />
    </main>
  );
}
