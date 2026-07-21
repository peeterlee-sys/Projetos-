import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarded_at) redirect("/hoje");

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 py-8">
      <OnboardingWizard defaultName={user.full_name ?? ""} />
    </main>
  );
}
