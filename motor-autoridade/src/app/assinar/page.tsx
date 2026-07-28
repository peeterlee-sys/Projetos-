import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/brand/Logo";
import { brand } from "@/lib/brand";
import { PlanForm } from "./PlanForm";

/**
 * Tela de assinatura — pra onde o WhatsApp manda o vereador quando o trial de
 * 7 dias acaba (ou pra quem quer assinar antes disso). Escolhe mensal/anual e
 * segue pro checkout do Asaas (Pix, cartão ou boleto).
 */
export default async function AssinarPage() {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/assinar`);

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("client_profiles")
    .select("subscription_status, trial_ends_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const isActive = profile?.subscription_status === "active";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <BrandLogo size={44} />
      <div className="mt-8 w-full rounded-3xl bg-white/70 p-8 ring-1 ring-sand-200">
        {isActive ? (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-100 text-2xl">
              ✅
            </span>
            <h1 className="mt-4 font-serif text-2xl text-brand-700">Sua assinatura está ativa</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
              O {brand.name} continua liberado no seu WhatsApp. Obrigado por assinar!
            </p>
          </>
        ) : (
          <>
            <h1 className="text-left font-serif text-2xl text-brand-700">Assine o {brand.name}</h1>
            <p className="mt-3 text-left text-[15px] leading-relaxed text-ink-700">
              {profile?.subscription_status === "trial"
                ? "Continue com o assistente sempre disponível no seu WhatsApp, sem interrupção."
                : "Seu período grátis terminou — assine para voltar a usar o assistente no WhatsApp."}
            </p>
            <PlanForm />
          </>
        )}
      </div>
    </main>
  );
}
