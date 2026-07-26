import { Suspense } from "react";
import Link from "next/link";
import { SignupForm } from "./SignupForm";
import { BrandLogo } from "@/components/brand/Logo";
import { brand } from "@/lib/brand";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Mantém o destino ao alternar entre cadastro e login (link do Assessor 24h).
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const isAnamnese =
    brand.defaultTrack === "political" ||
    next?.startsWith("/anamnese") ||
    next?.startsWith("/onboarding/politico");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <header className="mb-8 flex flex-col items-center text-center">
        <BrandLogo size={40} />
        <h1 className="mt-4 font-serif text-2xl text-brand-700">Criar sua conta</h1>
        <p className="mt-2 text-sm text-ink-500">
          {isAnamnese
            ? `Crie a conta do mandato para responder a anamnese do ${brand.name}.`
            : "Comece hoje. Seu radar editorial já começa a trabalhar."}
        </p>
      </header>
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-ink-500">
        Já tem conta?{" "}
        <Link href={loginHref} className="font-medium text-brand-700 underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
