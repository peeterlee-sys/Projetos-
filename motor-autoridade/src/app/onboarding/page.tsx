import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { OnboardingWizard } from "./OnboardingWizard";

// A conclusão do onboarding gera a primeira pauta com busca na web (~15-25s);
// amplia o limite de execução para essa etapa não estourar timeout.
export const maxDuration = 60;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ refazer?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { refazer } = await searchParams;
  const isRedo = refazer === "1";
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
      <OnboardingWizard defaultName={user.full_name ?? ""} />
    </main>
  );
}
