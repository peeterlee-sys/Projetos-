import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ refazer?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { refazer } = await searchParams;
  const isRedo = refazer === "1";
  // Numa marca de mandato (Assessor 24h) só existe a trilha política — o
  // wizard genérico nem aparece.
  if (brand.defaultTrack === "political") {
    redirect(`/onboarding/politico${isRedo ? "?refazer=1" : ""}`);
  }
  // Já concluiu a anamnese e não pediu explicitamente para refazer → vai pro app.
  if (user.onboarded_at && !isRedo) redirect("/hoje");

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 py-8">
      {isRedo ? (
        <p className="mb-4 rounded-2xl bg-gold-300/20 p-3 text-sm text-gold-700">
          Você está refazendo a anamnese. Ao concluir, seu perfil e seu DNA Editorial serão
          atualizados com as novas respostas.
        </p>
      ) : null}
      <p className="mb-4 rounded-2xl bg-sand-100 p-3 text-sm text-ink-700">
        Tem mandato eletivo?{" "}
        <Link href="/onboarding/politico" className="font-medium underline hover:text-brand-700">
          Faça a anamnese do mandato
        </Link>{" "}
        — o questionário de bandeiras, base eleitoral, limites e imprensa local.
      </p>
      <OnboardingWizard defaultName={user.full_name ?? ""} />
    </main>
  );
}
